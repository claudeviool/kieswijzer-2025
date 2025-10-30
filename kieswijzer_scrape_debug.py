#!/usr/bin/env -S uv run -s
# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright>=1.47,<2"]
# ///
"""
kieswijzer_scrape_debug.py — resilient scraper + rich diagnostics (uv script)

Commands:
  --install-browser
  scrape --base-url URL --profile {stemwijzer,kieskompas} [--out CSV] [--headed] [--slowmo MS] [--trace] [--shots DIR] [--paginate] [--max-pages N]
  pivot  --in CSV --out CSV
"""
from __future__ import annotations
import argparse, asyncio, csv, os, re, subprocess, sys, time, json, pathlib
from dataclasses import dataclass
from typing import Optional, List, Tuple, Dict
from collections import defaultdict, OrderedDict
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

# ---------- selector presets (tune here once you see real markup) ----------
PROFILES: dict[str, dict[str,str]] = {
  "stemwijzer": {
    "start_button": "button:has-text('Start'), .start__button",
    "statement_items": ".statement, .statement__inner",
    "statement_text": ".statement__title, .statement-title, h1.statement__title",
    "open_party_positions_button": ".statement__tab-button--parties, button:has-text('Wat vinden de partijen')",
    "party_container": ".statement__tab-content, .positions, [role='dialog'], .modal",
    "party_row": ".position, .party-row, .partij, li",
    "party_name": ".position__name, .party-name, strong, h3, h4",
    "stance_agree_marker": ".position__icon--agree, .icon--agree, .agree, .eens",
    "stance_neutral_marker": ".position__icon--neutral, .icon--neutral, .neutral, .neutraal",
    "stance_disagree_marker": ".position__icon--disagree, .icon--disagree, .disagree, .oneens",
    "close_party_positions_button": "button:has-text('Sluiten'), [aria-label='Sluiten'], .close, button:has-text('Terug')",
    "next_statement_button": "button.button--agree, button.button--disagree, button.button--neither",
    "accept_cookies_button": "button:has-text('Akkoord'), button:has-text('Accepteer'), button:has-text('Accept')",
  },
  "kieskompas": {
    "statement_items": "[data-testid='stelling'], .stelling, .statement, .question, [role='region']",
    "statement_text": "[data-testid='stelling-text'], .question__title, h2, h3",
    "open_party_positions_button": "button:has-text('Partijen'), button:has-text('Standpunten'), a:has-text('Partijen')",
    "party_container": "[data-testid='positions'], .positions, [role='dialog']",
    "party_row": "[data-testid='party-row'], .party-row, li, .party",
    "party_name": "[data-testid='party-name'], .party-name, strong, .name, span",
    "stance_agree_marker": ".agree, .eens, [data-stance='agree']",
    "stance_neutral_marker": ".neutral, .neutraal, [data-stance='neutral']",
    "stance_disagree_marker": ".disagree, .oneens, [data-stance='disagree']",
    "close_party_positions_button": "button:has-text('Sluiten'), .close, [aria-label='Close']",
    "next_statement_button": "button:has-text('Volgende'), button:has-text('Next')",
    "accept_cookies_button": "button:has-text('Akkoord'), button:has-text('Accepteer'), button:has-text('Accept')",
  },
}

STANCE_TEXT_MAP = {
  "eens": 1, "agree": 1, "voor": 1, "ja": 1,
  "neutraal": 0, "geen van beide": 0, "weet niet": 0,
  "oneens": -1, "disagree": -1, "tegen": -1, "nee": -1,
}

THROTTLE_MS = 600

@dataclass
class Statement: sid:str; text:str
@dataclass
class PartyStance: party:str; value:int

def normalize(s:str)->str: return re.sub(r"\s+", " ", s or "").strip()

async def snap(page, shots_dir:Optional[str], name:str):
  if not shots_dir: return
  os.makedirs(shots_dir, exist_ok=True)
  p = os.path.join(shots_dir, f"{int(time.time()*1000)}_{name}.png")
  try: await page.screenshot(path=p, full_page=True)
  except Exception: pass

async def click_if_exists(page, selector:str)->bool:
  try:
    el = await page.query_selector(selector)
    if el:
      await el.click()
      await page.wait_for_timeout(THROTTLE_MS)
      return True
  except Exception:
    return False
  return False

async def ensure_cookies(page, S):
  for _ in range(3):
    if await click_if_exists(page, S["accept_cookies_button"]): return
    await page.wait_for_timeout(300)

async def deep_query_all(page, root_selector:str, inner_selector:str):
  """
  Query nodes possibly nested in shadow DOMs:
  returns list of elementHandles
  """
  js = """
  (rootSel, innerSel) => {
    function* iterShadow(root){
      const st = [root];
      while (st.length){
        const n = st.pop();
        if (n.shadowRoot) st.push(n.shadowRoot);
        const kids = n.querySelectorAll('*');
        for (const k of kids){
          if (k.shadowRoot) st.push(k.shadowRoot);
        }
        yield n;
      }
    }
    const roots = document.querySelectorAll(rootSel);
    const out = [];
    for (const r of roots){
      for (const scope of iterShadow(r)){
        out.push(...scope.querySelectorAll(innerSel));
      }
    }
    return out;
  }
  """
  return await page.evaluate_handle(js, root_selector, inner_selector)

async def extract_party_stances(page, S)->List[PartyStance]:
  """Extract party stances from column-based layout (StemWijzer style)"""
  stances: List[PartyStance] = []
  
  # Find all party columns (Eens, Geen van beide, Oneens)
  columns = await page.query_selector_all(".parties-column")
  
  for column in columns:
    # Determine stance value from column header class
    header = await column.query_selector(".parties-column__header")
    if not header:
      continue
    
    # Check the header's class to determine stance
    header_class = await header.get_attribute("class")
    stance_value = None
    
    if "parties-column__header--agree" in (header_class or ""):
      stance_value = 1
    elif "parties-column__header--disagree" in (header_class or ""):
      stance_value = -1
    elif "parties-column__header--neither" in (header_class or ""):
      stance_value = 0
    
    if stance_value is None:
      continue
    
    # Get all parties in this column
    party_items = await column.query_selector_all(".parties-column__party")
    for item in party_items:
      name_el = await item.query_selector(".parties-column__party-name")
      if name_el:
        party_name = normalize(await name_el.inner_text())
        stances.append(PartyStance(party_name, stance_value))
  
  return stances

async def harvest_single_statement(page, S, shots, sid:str)->Tuple[Statement, List[PartyStance]]:
  """Extract one statement from current page (wizard-style interface)"""
  # Get statement text
  text_el = await page.query_selector(S["statement_text"])
  if not text_el:
    html = await page.content()
    pathlib.Path("empty_dom_dump.html").write_text(html, encoding="utf-8")
    print(f"WARN: No statement text found for {sid}. Wrote empty_dom_dump.html")
    await snap(page, shots, f"no_statement_{sid}")
    return (Statement(sid, ""), [])
  
  s_text = normalize(await text_el.inner_text())
  print(f"Found statement {sid}: {s_text[:60]}...")

  # Try to open party positions
  opened = False
  try:
    btn = await page.query_selector(S["open_party_positions_button"])
    if btn:
      await btn.click()
      opened = True
      # Wait for the tab content to be visible
      await page.wait_for_timeout(THROTTLE_MS)
      # Wait for the parties tab to be fully loaded
      await page.wait_for_selector(".statement__tab--parties", state="visible", timeout=3000)
      print(f"  Opened party positions for {sid}")
  except Exception as e:
    print(f"  Could not open party positions: {e}")

  await snap(page, shots, f"stmt_{sid}_{'opened' if opened else 'no_open'}")

  stances = []
  if opened:
    # Wait a bit more for content to render
    await page.wait_for_timeout(500)
    
    # Always dump the full page HTML when modal is open for debugging
    try:
      html = await page.content()
      pathlib.Path(f"party_modal_{sid}.html").write_text(html, encoding="utf-8")
      print(f"  Saved party_modal_{sid}.html for inspection")
    except Exception as e:
      print(f"  Could not save modal HTML: {e}")
    
    stances = await extract_party_stances(page, S)
    print(f"  Found {len(stances)} party stances")
    
    if not stances:
      # Debug: check if columns exist
      columns = await page.query_selector_all(".parties-column")
      print(f"  DEBUG: Found {len(columns)} party columns")
      for i, col in enumerate(columns):
        header = await col.query_selector(".parties-column__header")
        parties = await col.query_selector_all(".parties-column__party")
        print(f"    Column {i}: header={header is not None}, parties={len(parties)}")
    
    # Close the modal
    await click_if_exists(page, S["close_party_positions_button"])
    await page.wait_for_timeout(300)

  return (Statement(sid, s_text), stances)

async def do_scrape(base_url:str, profile:str, out_csv:str, headed:bool, slowmo:int, trace:bool, shots:Optional[str], paginate:bool, max_pages:int):
  S = PROFILES[profile]
  async with async_playwright() as p:
    launch_args = dict(headless=not headed, slow_mo=slowmo or 0)
    browser = await p.chromium.launch(**launch_args)
    context = await browser.new_context(locale="nl-NL", user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36")
    if trace: await context.tracing.start(screenshots=True, snapshots=True, sources=True)
    page = await context.new_page()

    # help diagnose console errors
    page.on("console", lambda msg: print("BROWSER:", msg.type(), msg.text()))
    page.on("pageerror", lambda err: print("BROWSER ERROR:", err))

    await page.goto(base_url, wait_until="domcontentloaded")
    await ensure_cookies(page, S)
    await page.wait_for_load_state("networkidle")
    await snap(page, shots, "landing")

    # Click the Start button to enter the quiz
    print("Looking for Start button...")
    start_clicked = await click_if_exists(page, S["start_button"])
    if start_clicked:
      print("Start button clicked, waiting for statements to load...")
      await page.wait_for_load_state("networkidle")
      await page.wait_for_timeout(1000)  # Extra wait for SPA to render
      await snap(page, shots, "after_start")
    else:
      print("WARN: Start button not found, proceeding anyway...")

    harvested = []
    # This is a wizard-style interface - one statement per page
    # We need to iterate through statements using answer buttons
    seen = set()
    for idx in range(1, max_pages + 1):
      sid = f"t{idx:02d}"
      st, stances = await harvest_single_statement(page, S, shots, sid)
      
      if st.text and st.text not in seen:
        seen.add(st.text)
        harvested.append((st, stances))
      elif not st.text:
        print(f"No more statements found at index {idx}")
        break
      
      # Click any answer button to proceed to next statement
      # Try "Eens" (agree) button as default
      moved = await click_if_exists(page, "button.button--agree")
      if not moved:
        # Try other buttons if agree doesn't work
        moved = await click_if_exists(page, "button.button--neither")
      if not moved:
        moved = await click_if_exists(page, "button.button--disagree")
      
      await snap(page, shots, f"after_answer_{sid}")
      
      if not moved:
        print(f"Could not proceed after statement {sid}")
        break
      
      await page.wait_for_timeout(THROTTLE_MS)
      
      # Check if we've reached the end (results page or similar)
      if idx >= 30:  # StemWijzer typically has 30 statements
        break

    with open(out_csv, "w", newline="", encoding="utf-8") as f:
      w = csv.writer(f); w.writerow(["statement_id","statement_text","party","stance_value"])
      for st, stances in harvested:
        if stances:
          for ps in stances: w.writerow([st.sid, st.text, ps.party, ps.value])
        else:
          w.writerow([st.sid, st.text, "", ""])

    if trace:
      await context.tracing.stop(path="trace.zip")
      print("Trace written to trace.zip")

    await context.close(); await browser.close()
    print(f"Wrote {out_csv} with {len(harvested)} statements.")

def pivot(in_path:str, out_path:str):
  rows=[]; parties=OrderedDict()
  with open(in_path, newline="", encoding="utf-8") as f:
    r=csv.DictReader(f)
    for row in r:
      sid=(row.get("statement_id") or "").strip()
      txt=(row.get("statement_text") or "").strip()
      p=(row.get("party") or "").strip()
      v=(row.get("stance_value") or "").strip()
      if not sid: continue
      rows.append((sid,txt,p,v))
      if p: parties.setdefault(p,None)
  by=defaultdict(lambda:{"text":"","vals":{}})
  for sid,txt,p,v in rows:
    if by[sid]["text"]=="": by[sid]["text"]=txt
    if p:
      try: iv=int(v)
      except: iv=""
      by[sid]["vals"][p]=iv
  with open(out_path,"w",newline="",encoding="utf-8") as f:
    w=csv.writer(f); w.writerow(["statement_id","statement_text",*list(parties.keys())])
    for sid in sorted(by.keys()):
      vals=by[sid]["vals"]; w.writerow([sid, by[sid]["text"], *[vals.get(p,"") for p in parties.keys()]])

def install_browser(): subprocess.run([sys.executable,"-m","playwright","install","chromium"], check=True)

def build_parser():
  ap=argparse.ArgumentParser()
  ap.add_argument("--install-browser", action="store_true")
  sub=ap.add_subparsers(dest="cmd")

  sp=sub.add_parser("scrape")
  sp.add_argument("--base-url", required=True)
  sp.add_argument("--profile", choices=list(PROFILES), default="stemwijzer")
  sp.add_argument("--out", default="statements_long.csv")
  sp.add_argument("--headed", action="store_true")
  sp.add_argument("--slowmo", type=int, default=0)
  sp.add_argument("--trace", action="store_true")
  sp.add_argument("--shots", default=None, help="Directory to save screenshots")
  sp.add_argument("--paginate", action="store_true")
  sp.add_argument("--max-pages", type=int, default=40)

  pp=sub.add_parser("pivot")
  pp.add_argument("--in", dest="in_path", required=True)
  pp.add_argument("--out", dest="out_path", default="statements_wide.csv")
  return ap

def main():
  ap=build_parser(); args=ap.parse_args()
  if args.install_browser: install_browser(); return
  if args.cmd=="scrape":
    asyncio.run(do_scrape(args.base_url, args.profile, args.out, args.headed, args.slowmo, args.trace, args.shots, args.paginate, args.max_pages)); return
  if args.cmd=="pivot": pivot(args.in_path, args.out_path); return
  ap.print_help()

if __name__=="__main__": main()

