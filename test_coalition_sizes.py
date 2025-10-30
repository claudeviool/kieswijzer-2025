#!/usr/bin/env -S uv run -s
# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright>=1.47,<2"]
# ///
"""
Test coalition size generation
"""
import asyncio
from playwright.async_api import async_playwright
import http.server
import socketserver
import threading
import time
import re

PORT = 8002

def start_server():
    """Start a simple HTTP server in a background thread"""
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        httpd.serve_forever()

async def test_coalition_sizes():
    """Test that coalitions of all sizes are generated"""
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)
    
    console_messages = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        # Capture console messages
        page.on("console", lambda msg: console_messages.append(msg.text))
        
        print("\n🔍 Testing coalition size generation...")
        await page.goto(f'http://localhost:{PORT}/index.html')
        await page.wait_for_load_state('networkidle')
        await page.wait_for_timeout(3000)
        
        print("📊 Clicking 'Find Coalition' button...")
        await page.click('#findCoalition')
        await page.wait_for_timeout(3000)
        
        await browser.close()
    
    # Parse console output
    print("\n" + "="*60)
    print("COALITION GENERATION ANALYSIS")
    print("="*60)
    
    size_dist = None
    total_coalitions = None
    top_coalitions = []
    
    for msg in console_messages:
        if 'Coalition size distribution:' in msg:
            # Extract size distribution
            match = re.search(r'Coalition size distribution: ({.*})', msg)
            if match:
                size_dist = eval(match.group(1))
        elif 'Total coalitions generated:' in msg:
            match = re.search(r'Total coalitions generated: (\d+)', msg)
            if match:
                total_coalitions = int(match.group(1))
        elif re.match(r'\d+\. \[\d+ parties\]', msg):
            top_coalitions.append(msg)
    
    if size_dist:
        print("\n📊 Coalition Size Distribution:")
        for size in sorted(size_dist.keys()):
            print(f"  {size} parties: {size_dist[size]} coalitions")
    
    if total_coalitions:
        print(f"\n📈 Total: {total_coalitions} coalitions generated")
    
    if top_coalitions:
        print("\n🏆 Top 10 Coalitions:")
        for coalition in top_coalitions[:10]:
            print(f"  {coalition}")
    
    # Analysis
    print("\n" + "="*60)
    print("ANALYSIS")
    print("="*60)
    
    if size_dist:
        sizes_present = sorted(size_dist.keys())
        print(f"✓ Coalition sizes generated: {sizes_present}")
        
        if len(sizes_present) < 5:
            print(f"⚠️  WARNING: Only {len(sizes_present)} different sizes generated!")
            print(f"   Expected: 1, 2, 3, 4, 5 party coalitions")
        else:
            print("✅ All coalition sizes (1-5 parties) are being generated")
        
        # Check if top results are all same size
        if top_coalitions:
            top_sizes = [int(re.search(r'\[(\d+) parties\]', c).group(1)) for c in top_coalitions[:5]]
            unique_top_sizes = set(top_sizes)
            if len(unique_top_sizes) == 1:
                print(f"\n⚠️  WARNING: Top 5 results are ALL {top_sizes[0]}-party coalitions!")
                print("   This suggests the scoring heavily favors one size")
            else:
                print(f"\n✅ Top 5 results have varied sizes: {sorted(unique_top_sizes)}")

if __name__ == "__main__":
    asyncio.run(test_coalition_sizes())