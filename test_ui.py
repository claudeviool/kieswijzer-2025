#!/usr/bin/env -S uv run -s
# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright>=1.47,<2"]
# ///
"""
Test the Coalition Simulator UI using Playwright
"""
import asyncio
from playwright.async_api import async_playwright
import http.server
import socketserver
import threading
import time

PORT = 8000

def start_server():
    """Start a simple HTTP server in a background thread"""
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Server running at http://localhost:{PORT}")
        httpd.serve_forever()

async def test_ui():
    """Test the coalition simulator UI"""
    # Start server in background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2)  # Give server time to start
    
    async with async_playwright() as p:
        # Launch browser in headed mode to see the UI
        browser = await p.chromium.launch(headless=False, slow_mo=500)
        context = await browser.new_context(viewport={'width': 1400, 'height': 900})
        page = await context.new_page()
        
        print("\n✓ Opening Coalition Simulator...")
        await page.goto(f'http://localhost:{PORT}/index.html')
        await page.wait_for_load_state('networkidle')
        
        # Take initial screenshot
        await page.screenshot(path='screenshots/01_initial.png', full_page=True)
        print("✓ Initial page loaded")
        
        # Wait for data to load
        await page.wait_for_selector('.party-card', timeout=5000)
        print("✓ Party cards loaded")
        
        # Count available parties
        party_cards = await page.query_selector_all('#availableParties .party-card')
        print(f"✓ Found {len(party_cards)} available parties")
        
        # Test 1: Drag D66 to coalition
        print("\n--- Test 1: Dragging D66 to coalition ---")
        d66_card = await page.query_selector('[data-party-name="D66"]')
        if d66_card:
            coalition_zone = await page.query_selector('#coalitionParties')
            
            # Get bounding boxes
            d66_box = await d66_card.bounding_box()
            coalition_box = await coalition_zone.bounding_box()
            
            # Perform drag and drop
            await page.mouse.move(d66_box['x'] + d66_box['width']/2, 
                                 d66_box['y'] + d66_box['height']/2)
            await page.mouse.down()
            await page.mouse.move(coalition_box['x'] + coalition_box['width']/2,
                                 coalition_box['y'] + coalition_box['height']/2,
                                 steps=10)
            await page.mouse.up()
            
            await page.wait_for_timeout(500)
            await page.screenshot(path='screenshots/02_d66_added.png', full_page=True)
            print("✓ D66 dragged to coalition")
            
            # Check coalition seats
            coalition_seats = await page.text_content('#coalitionSeats')
            print(f"✓ Coalition seats: {coalition_seats}")
        
        # Test 2: Add VVD to coalition
        print("\n--- Test 2: Adding VVD to coalition ---")
        vvd_card = await page.query_selector('[data-party-name="VVD"]')
        if vvd_card:
            coalition_zone = await page.query_selector('#coalitionParties')
            vvd_box = await vvd_card.bounding_box()
            coalition_box = await coalition_zone.bounding_box()
            
            await page.mouse.move(vvd_box['x'] + vvd_box['width']/2,
                                 vvd_box['y'] + vvd_box['height']/2)
            await page.mouse.down()
            await page.mouse.move(coalition_box['x'] + coalition_box['width']/2,
                                 coalition_box['y'] + 50,
                                 steps=10)
            await page.mouse.up()
            
            await page.wait_for_timeout(500)
            await page.screenshot(path='screenshots/03_vvd_added.png', full_page=True)
            print("✓ VVD dragged to coalition")
            
            coalition_seats = await page.text_content('#coalitionSeats')
            print(f"✓ Coalition seats: {coalition_seats}")
        
        # Test 3: Add CDA to reach majority
        print("\n--- Test 3: Adding CDA to reach majority ---")
        cda_card = await page.query_selector('[data-party-name="CDA"]')
        if cda_card:
            coalition_zone = await page.query_selector('#coalitionParties')
            cda_box = await cda_card.bounding_box()
            coalition_box = await coalition_zone.bounding_box()
            
            await page.mouse.move(cda_box['x'] + cda_box['width']/2,
                                 cda_box['y'] + cda_box['height']/2)
            await page.mouse.down()
            await page.mouse.move(coalition_box['x'] + coalition_box['width']/2,
                                 coalition_box['y'] + 100,
                                 steps=10)
            await page.mouse.up()
            
            await page.wait_for_timeout(500)
            await page.screenshot(path='screenshots/04_cda_added_majority.png', full_page=True)
            print("✓ CDA dragged to coalition")
            
            coalition_seats = await page.text_content('#coalitionSeats')
            print(f"✓ Coalition seats: {coalition_seats} (should be 69)")
            
            # Check if majority indicator shows
            coalition_bar = await page.query_selector('#coalitionBar')
            bar_text = await coalition_bar.text_content()
            print(f"✓ Coalition bar text: '{bar_text}'")
        
        # Test 4: Expand first statement
        print("\n--- Test 4: Expanding statements ---")
        first_statement = await page.query_selector('.statement-item')
        if first_statement:
            header = await first_statement.query_selector('.statement-header')
            await header.click()
            await page.wait_for_timeout(500)
            await page.screenshot(path='screenshots/05_statement_expanded.png', full_page=True)
            print("✓ First statement expanded")
        
        # Test 5: Expand all statements
        print("\n--- Test 5: Expanding all statements ---")
        expand_all_btn = await page.query_selector('#expandAll')
        await expand_all_btn.click()
        await page.wait_for_timeout(1000)
        await page.screenshot(path='screenshots/06_all_statements_expanded.png', full_page=True)
        print("✓ All statements expanded")
        
        # Test 6: Scroll through statements
        print("\n--- Test 6: Scrolling through statements ---")
        await page.evaluate('window.scrollTo(0, document.body.scrollHeight / 2)')
        await page.wait_for_timeout(500)
        await page.screenshot(path='screenshots/07_scrolled_statements.png', full_page=True)
        print("✓ Scrolled through statements")
        
        # Test 7: Remove a party from coalition
        print("\n--- Test 7: Removing D66 from coalition ---")
        d66_in_coalition = await page.query_selector('#coalitionParties [data-party-name="D66"]')
        if d66_in_coalition:
            available_zone = await page.query_selector('#availableParties')
            d66_box = await d66_in_coalition.bounding_box()
            available_box = await available_zone.bounding_box()
            
            await page.mouse.move(d66_box['x'] + d66_box['width']/2,
                                 d66_box['y'] + d66_box['height']/2)
            await page.mouse.down()
            await page.mouse.move(available_box['x'] + available_box['width']/2,
                                 available_box['y'] + 50,
                                 steps=10)
            await page.mouse.up()
            
            await page.wait_for_timeout(500)
            await page.screenshot(path='screenshots/08_d66_removed.png', full_page=True)
            print("✓ D66 removed from coalition")
            
            coalition_seats = await page.text_content('#coalitionSeats')
            print(f"✓ Coalition seats: {coalition_seats}")
        
        # Test 8: Test coalition finder without preference
        print("\n--- Test 8: Testing coalition finder (no preference) ---")
        await page.evaluate('window.scrollTo(0, 0)')
        await page.wait_for_timeout(500)
        
        find_btn = await page.query_selector('#findCoalition')
        await find_btn.click()
        await page.wait_for_timeout(2000)  # Wait for calculation
        await page.screenshot(path='screenshots/09_coalition_finder_results.png', full_page=True)
        print("✓ Coalition finder executed")
        
        # Check if suggestions are visible
        suggestions = await page.query_selector('.coalition-suggestions.visible')
        if suggestions:
            suggestion_items = await suggestions.query_selector_all('.suggestion-item')
            print(f"✓ Found {len(suggestion_items)} coalition suggestions")
            
            # Click first suggestion to apply it
            if suggestion_items:
                await suggestion_items[0].click()
                await page.wait_for_timeout(1000)
                await page.screenshot(path='screenshots/10_applied_suggestion.png', full_page=True)
                print("✓ Applied first coalition suggestion")
                
                # Check agreement overview is visible
                agreement_overview = await page.query_selector('#agreementOverview')
                if agreement_overview:
                    is_visible = await agreement_overview.is_visible()
                    if is_visible:
                        print("✓ Agreement overview bar is visible")
                    else:
                        print("⚠ Agreement overview bar is not visible")
        
        # Test 9: Test coalition finder with required party (D66)
        print("\n--- Test 9: Testing coalition finder with D66 required ---")
        await page.evaluate('window.scrollTo(0, 0)')
        await page.wait_for_timeout(500)
        
        # Select D66 from dropdown
        required_party_select = await page.query_selector('#requiredParty')
        await required_party_select.select_option('D66')
        await page.wait_for_timeout(500)
        
        # Click find coalition button
        await find_btn.click()
        await page.wait_for_timeout(2000)
        await page.screenshot(path='screenshots/11_coalition_finder_d66_required.png', full_page=True)
        print("✓ Coalition finder with D66 requirement executed")
        
        # Check results
        suggestions = await page.query_selector('.coalition-suggestions.visible')
        if suggestions:
            suggestion_items = await suggestions.query_selector_all('.suggestion-item')
            print(f"✓ Found {len(suggestion_items)} coalitions with D66")
            
            # Verify all suggestions contain D66
            for i, item in enumerate(suggestion_items[:3]):  # Check first 3
                text = await item.text_content()
                if 'D66' in text:
                    print(f"  ✓ Suggestion {i+1} contains D66")
                else:
                    print(f"  ⚠ Suggestion {i+1} does NOT contain D66!")
        
        # Test 10: Check info modal
        print("\n--- Test 10: Testing info modal ---")
        info_btn = await page.query_selector('#infoButton')
        await info_btn.click()
        await page.wait_for_timeout(500)
        await page.screenshot(path='screenshots/12_info_modal.png', full_page=True)
        print("✓ Info modal opened")
        
        # Close modal
        modal_close = await page.query_selector('.modal-close')
        await modal_close.click()
        await page.wait_for_timeout(500)
        print("✓ Info modal closed")
        
        print("\n✅ All tests completed! Check the screenshots/ directory for results.")
        print("Browser will close in 5 seconds...")
        
        # Keep browser open for manual inspection
        await page.wait_for_timeout(5000)
        
        await browser.close()

if __name__ == "__main__":
    import os
    os.makedirs('screenshots', exist_ok=True)
    asyncio.run(test_ui())