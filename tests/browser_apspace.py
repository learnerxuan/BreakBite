"""Exercise the download-free planner over real HTTP using the synthetic fixture server."""
from __future__ import annotations

import argparse
from uuid import uuid4

from playwright.sync_api import expect, sync_playwright
from browser_support import login, overflow

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8095')
parser.add_argument('--chromium')
args = parser.parse_args()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=args.chromium)
    page = browser.new_page(viewport={'width': 390, 'height': 800})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(args.base_url)
    login(page, f'apspace-{uuid4().hex[:8]}@example.test', register=True)
    page.locator('#fit-toggle').check()
    page.get_by_role('button', name='Open My planner').click()
    expect(page.get_by_role('heading', name='APSpace timetable', exact=True)).to_be_focused()
    page.get_by_role('button', name='Connect APSpace timetable').click()
    intake = page.get_by_label('Intake code', exact=True)
    expect(intake).to_be_focused()
    page.get_by_role('button', name='Cancel setup').click()
    expect(page.get_by_role('button', name='Connect APSpace timetable')).to_be_focused()
    page.get_by_role('button', name='Connect APSpace timetable').click()
    intake.fill('unknown')
    page.get_by_role('button', name='Review classes').click()
    expect(intake).to_have_attribute('aria-invalid', 'true')
    expect(page.get_by_text('BreakBite cannot find this intake code.')).to_be_visible()
    intake.fill('')
    intake.press_sequentially(' test-intake ')
    expect(intake).to_be_focused()
    page.get_by_label('Group', exact=True).select_option('G2')
    page.get_by_role('button', name='Review classes').click()
    preview = page.locator('#apspace-connect-confirm')
    expect(preview).to_contain_text('TEST-INTAKE · G2')
    expect(preview).to_contain_text('Earlier class')
    expect(page.get_by_role('heading', name='Review classes')).to_be_focused()
    assert preview.locator('.bb-timetable-class').first.bounding_box()['height'] >= 44
    first_class = preview.locator('input[name=classId]').first
    first_class.uncheck()
    page.get_by_role('button', name='My planner', exact=True).click()
    expect(first_class).not_to_be_checked()
    first_class.check()
    for width in [360, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 800})
        overflow(page)
    page.set_viewport_size({'width': 360, 'height': 800})
    page.evaluate("document.documentElement.style.fontSize = '200%'")
    overflow(page)
    page.evaluate("document.documentElement.style.removeProperty('font-size')")
    preview.locator('input[name=consent]').press('Space')
    preview.get_by_role('button', name='Save timetable').click()
    expect(page.get_by_role('button', name='Fit a meal')).to_be_visible()
    page.reload()
    page.get_by_role('button', name='My planner', exact=True).click()
    page.get_by_role('button', name='Fit a meal').click()
    expect(page.locator('#plan-form')).to_contain_text('Times from your saved timetable')
    page.get_by_role('button', name='Add Nasi lemak ayam', exact=True).click()
    page.get_by_role('button', name='Add Brown sugar milk tea', exact=True).click()
    page.get_by_label('Food budget (RM)').fill('5')
    with page.expect_request(lambda request: request.url.endswith('/api/checkout/quote')) as quoted:
        page.get_by_role('button', name='Choose pickup times', exact=True).click()
    assert quoted.value.post_data_json['plan']['budgetSen'] == 500
    expect(page.locator('#checkout-dialog')).to_be_visible()
    page.locator('[data-action=close-checkout]').click()
    page.get_by_label('Food budget (RM)').fill('25')
    page.get_by_role('button', name='Check pickup times for this break').click()
    expect(page.locator('.bb-checkout-kitchen')).to_have_count(2)
    page.evaluate("""() => {
        const original = window.fetch.bind(window);
        window.fetch = async (url, options) => {
            const response = await original(url, options);
            if (url === '/api/checkouts' && options?.method === 'POST') {
                window.committed = await response.clone().json();
                throw new TypeError('Test: response lost after server commit');
            }
            return response;
        };
    }""")
    page.get_by_role('button', name='Confirm all kitchen orders').click()
    retry = page.get_by_role('button', name='Check / retry original checkout')
    expect(retry).to_be_visible()
    session = page.request.get(args.base_url + '/api/session').json()
    cache_key = 'breakbite-checkout-v2:' + session['actor']['id']
    attempt = page.evaluate('key => sessionStorage.getItem(key)', cache_key)
    assert attempt and len(page.evaluate('window.committed.orders')) == 2
    refreshed = page.request.post(args.base_url + '/api/product/timetable/apspace/refresh',
                                  data={}, headers={'Origin': args.base_url, 'X-CSRF-Token': session['csrfToken']})
    assert refreshed.ok, refreshed.text()
    assert page.evaluate('key => sessionStorage.getItem(key)', cache_key) == attempt
    retry.click()
    expect(page.locator('.bb-order')).to_have_count(2)
    assert page.evaluate('key => sessionStorage.getItem(key)', cache_key) is None
    page.get_by_role('button', name='Explore', exact=True).click()
    expect(page.locator('#fit-toggle')).to_be_checked()
    expect(page.locator('#plan-start')).to_have_value('')
    expect(page.get_by_text('Your timetable changed. Choose a new break or enter your times manually.')).to_be_visible()
    page.get_by_role('button', name='My planner', exact=True).click()
    expect(preview).to_contain_text('Later class moved')
    expect(page.get_by_role('button', name='Fit a meal')).to_have_count(0)
    preview.locator('input[name=consent]').check()
    preview.get_by_role('button', name='Save timetable').click()
    expect(page.get_by_role('button', name='Fit a meal')).to_be_visible()
    page.get_by_role('button', name='Disconnect APSpace').click()
    expect(page.get_by_role('button', name='Fit a meal')).to_have_count(0)
    assert not errors, errors
    print('PASS typed intake setup, keyboard review, responsive layouts, persistence, visible budget, checkout retry across refresh, changed-date review and disconnect over browser HTTP.')
    browser.close()
