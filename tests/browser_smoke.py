"""Browser integration smoke test.

Normal: python tests/browser_smoke.py --base-url http://127.0.0.1:8080
Offline renderer: add --bridge. In bridge mode the browser loads no URL; compiled
local UI code is injected into about:blank and API calls are relayed to the local
Node backend using urllib. This does not test browser CORS/network/CSP deployment.
Requires: pip install playwright; playwright install chromium (or --chromium PATH).
"""
from __future__ import annotations
import argparse
import json
import re
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8080')
parser.add_argument('--bridge', action='store_true')
parser.add_argument('--chromium')
args = parser.parse_args()
OUT = ROOT / 'docs' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)


def backend(url: str, options: dict | None = None) -> dict:
    """Relay ONLY our own local /api endpoints. No arbitrary network proxy."""
    if not url.startswith('/api/'):
        raise ValueError('Bridge only permits the local application API.')
    options = options or {}
    req = urllib.request.Request(args.base_url.rstrip('/') + url,
        data=options.get('body', '').encode() if options.get('body') is not None else None,
        headers=options.get('headers', {}), method=options.get('method', 'GET'))
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            return {'status': response.status, 'body': response.read().decode(), 'headers': dict(response.headers)}
    except urllib.error.HTTPError as error:
        return {'status': error.code, 'body': error.read().decode(), 'headers': dict(error.headers)}


def bootstrap(page):
    if not args.bridge:
        page.goto(args.base_url, wait_until='networkidle')
        return
    page.expose_function('__localBackend', backend)
    page.set_content('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><a class="skip-link" href="#main">Skip to content</a><div id="app"></div><div id="toast" role="status" aria-live="polite"></div></body></html>')
    page.add_style_tag(content=(ROOT / 'src/web/styles.css').read_text())
    page.evaluate('''() => {
      const values = new Map();
      Object.defineProperty(window, 'sessionStorage', {value: {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}});
      window.fetch = async (url, options={}) => {
        const result = await window.__localBackend(String(url), {method:options.method||'GET',headers:options.headers||{},body:options.body});
        return new Response(result.body, {status:result.status,headers:result.headers});
      };
      if (!crypto.randomUUID) crypto.randomUUID = () => '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
    }''')
    shared = (ROOT / 'dist/shared/model.js').read_text().replace('export ', '')
    client = (ROOT / 'dist/web/client.js').read_text().replace('export ', '')
    main = re.sub(r'^import .*?;\s*$', '', (ROOT / 'dist/web/main.js').read_text(), flags=re.M)
    bundled = f'''const Model = (()=>{{{shared}\nreturn {{atRisk,money,time}};}})();
const Client = (()=>{{{client}\nreturn {{api,configure,demoLogin,firebaseLogin,hasSession,logout}};}})();
(()=>{{const {{atRisk,money,time}}=Model;const {{api,configure,demoLogin,firebaseLogin,hasSession,logout}}=Client;{main}\n}})();'''
    page.add_script_tag(content=bundled)


def assert_no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal layout overflow'


with sync_playwright() as p:
    options = {'headless': True}
    if args.chromium:
        options['executable_path'] = args.chromium
    browser = p.chromium.launch(**options)
    context = browser.new_context(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    bootstrap(page)
    expect(page.get_by_role('button', name='Alex · student')).to_be_visible()
    page.screenshot(path=str(OUT / 'login-desktop.png'), full_page=True)
    # Clean state before exercising the actual UI flow.
    page.get_by_role('button', name='Bowl Lab · operator').click()
    expect(page.locator('.workspace-tabs')).to_be_visible()
    page.get_by_role('button', name='Reset this kitchen’s demo data').click()
    expect(page.locator('#toast')).to_contain_text('Demo kitchen reset')
    page.locator('#account-switch').select_option('student-alex')
    expect(page.locator('.meal-card')).to_have_count(10)
    page.screenshot(path=str(OUT / 'student-desktop.png'), full_page=True)
    assert_no_overflow(page)
    # Filter, search, reset filter.
    page.locator('[data-category="Rice"]').click()
    expect(page.locator('.meal-card')).to_have_count(3)
    page.locator('#meal-search').fill('tofu')
    expect(page.locator('.meal-card')).to_have_count(1)
    page.locator('#meal-search').fill('')
    page.locator('[data-category="All meals"]').click()
    # A short enough deadline to make a 15-minute delay meaningful.
    now = datetime.now(timezone(timedelta(hours=8))).replace(second=0, microsecond=0)
    page.locator('#break-start').fill(now.strftime('%Y-%m-%dT%H:%M'))
    page.locator('#next-class').fill((now + timedelta(minutes=40)).strftime('%Y-%m-%dT%H:%M'))
    page.get_by_role('button', name='Find my pickup windows').click()
    expect(page.locator('#toast')).to_contain_text('Pickup windows updated')
    page.get_by_role('button', name='Add Golden chicken rice', exact=True).click()
    page.get_by_role('button', name='Choose pickup time').click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.locator('.slot-option')).not_to_have_count(0)
    page.screenshot(path=str(OUT / 'checkout-desktop.png'), full_page=True)
    page.get_by_role('button', name='Confirm pre-order').click()
    expect(page.locator('.order-card')).to_have_count(1)
    original_code = page.locator('.pickup-pass strong').inner_text()
    # Vendor does not see student's secret; a delay produces a real recovery proposal.
    page.locator('#account-switch').select_option('vendor-bowl')
    expect(page.locator('.kitchen-order')).to_have_count(1)
    assert original_code not in page.locator('body').inner_text()
    page.locator('#incident-form select[name="itemId"]').select_option('chicken-rice')
    page.locator('#incident-form input[name="reason"]').fill('Rice cooker delayed')
    page.get_by_role('button', name='Report delay', exact=False).click()
    expect(page.get_by_text('Deadline at risk', exact=True)).to_be_visible()
    page.get_by_role('button', name='Evaluate rescue').click()
    expect(page.locator('.recovery-option')).not_to_have_count(0)
    page.screenshot(path=str(OUT / 'vendor-desktop.png'), full_page=True)
    page.get_by_role('button', name='Create proposal', exact=True).first.click()
    expect(page.get_by_role('button', name='Approve & send', exact=True)).to_be_visible()
    page.get_by_role('button', name='Approve & send', exact=True).click()
    expect(page.locator('.proposal-card .pill')).to_have_text('approved')
    page.locator('#account-switch').select_option('student-alex')
    page.locator('[data-view="orders"]').first.click()
    expect(page.get_by_role('button', name='Accept replacement')).to_be_visible()
    page.get_by_role('button', name='Accept replacement').click()
    expect(page.locator('.proposal-card .pill')).to_have_text('accepted')
    new_code = page.locator('.pickup-pass strong').inner_text()
    assert new_code != original_code
    page.screenshot(path=str(OUT / 'order-desktop.png'), full_page=True)
    # A different student cannot see the order.
    page.locator('#account-switch').select_option('student-sam')
    page.locator('[data-view="orders"]').first.click()
    expect(page.locator('.order-card')).to_have_count(0)
    # Prepare and collect using the real updated code.
    page.locator('#account-switch').select_option('vendor-bowl')
    page.locator('[data-tab="queue"]').click()
    page.get_by_role('button', name='Start preparing', exact=True).click()
    page.get_by_role('button', name='Mark ready', exact=True).click()
    page.locator('.collect-form input').fill(new_code)
    page.get_by_role('button', name='Verify & collect', exact=True).click()
    expect(page.locator('.kitchen-order')).to_have_count(0)
    page.locator('#account-switch').select_option('student-alex')
    page.locator('[data-view="orders"]').first.click()
    expect(page.locator('.order-top .pill')).to_have_text('Collected')
    expect(page.locator('.pickup-pass')).to_have_count(0)
    # Responsive rendering and another mobile order.
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.mobile-nav [data-view="explore"]').click()
    expect(page.locator('.meal-card')).to_have_count(10)
    page.screenshot(path=str(OUT / 'student-mobile.png'), full_page=True)
    assert_no_overflow(page)
    page.get_by_role('button', name='Add Sesame tofu bowl', exact=True).click()
    page.get_by_role('button', name='Choose pickup time').click()
    expect(page.get_by_role('dialog')).to_be_visible()
    assert_no_overflow(page)
    page.get_by_role('button', name='Confirm pre-order').click()
    expect(page.locator('.order-card')).to_have_count(2)
    page.screenshot(path=str(OUT / 'order-mobile.png'), full_page=True)
    assert_no_overflow(page)
    page.locator('#account-switch').select_option('vendor-bowl')
    page.screenshot(path=str(OUT / 'vendor-mobile.png'), full_page=True)
    assert_no_overflow(page)
    assert not errors, errors
    print(json.dumps({'result': 'PASS', 'transport': 'offline local-backend bridge' if args.bridge else 'normal browser HTTP', 'checks': ['desktop login', 'menu search/category', 'time filtering', 'checkout', 'vendor secret isolation', 'delay report', 'manual proposal', 'operator approval', 'student acceptance', 'pickup-code rotation', 'cross-student privacy', 'preparation states', 'one-time collection', '390px mobile ordering', 'horizontal overflow', 'no uncaught JS errors'], 'screenshots': str(OUT)}, indent=2))
    browser.close()
