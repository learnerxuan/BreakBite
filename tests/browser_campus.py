"""Combined campus-menu acceptance. Use only a disposable local database."""
from __future__ import annotations

import argparse
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright
from browser_support import ROOT, login, overflow

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8080')
parser.add_argument('--chromium')
args = parser.parse_args()
output = ROOT / 'test-results' / 'campus'
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=args.chromium)
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    page.set_default_timeout(12000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(args.base_url)
    expect(page.locator('#kitchen-filter')).not_to_contain_text('Bowl Lab')
    expect(page.locator('#kitchen-filter')).not_to_contain_text('Noodle & Co.')
    photos = page.locator('.bb-meal img[src^="/images/menu/"]')
    expect(photos).to_have_count(45)
    catalog = page.request.get(args.base_url + '/api/catalog').json()
    assert len(catalog['vendors']) == 9
    for item in catalog['items']:
        if not item.get('photoPath', '').startswith('/images/menu/'):
            continue
        image = page.request.get(args.base_url + item['photoPath'])
        assert image.ok and image.headers['content-type'] == 'image/jpeg'
        assert image.body().startswith(b'\xff\xd8\xff')
    assert page.request.get(args.base_url + '/images/menu/missing.jpg').status == 404
    assert page.request.get(args.base_url + '/images/menu/file.svg').status == 404

    page.locator('.bb-allergy-filters summary').click()
    page.get_by_role('button', name='Avoid Peanuts', exact=True).click()
    expect(photos).to_have_count(0)  # Sample claims never pass an active restriction.
    page.get_by_role('button', name='Clear all', exact=True).click()
    expect(photos).to_have_count(45)
    page.locator('#kitchen-filter').select_option('asian-cuisine')
    expect(page.locator('.bb-meal')).to_have_count(5)
    expect(page.locator('.bb-kitchen-name').first).to_contain_text('Sample menu')
    page.locator('#kitchen-filter').select_option('all')

    login(page, f'campus-{uuid4().hex[:8]}@example.test', register=True)
    page.get_by_role('button', name='Add Nasi lemak ayam', exact=True).click()
    page.get_by_role('button', name='Add Brown sugar milk tea', exact=True).click()
    page.locator('.bb-mobile-cart').click()
    page.locator('#fit-toggle').check()
    expect(page.locator('#plan-form')).to_be_visible()
    expect(page.locator('#apspace-file')).to_have_count(1)
    page.locator('#fit-toggle').uncheck()
    for width in [360, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 844})
        overflow(page)
        action = page.get_by_role('button', name='Choose pickup times', exact=True)
        action.scroll_into_view_if_needed()
        expect(action).to_be_in_viewport()
    page.set_viewport_size({'width': 390, 'height': 844})
    page.locator('.bb-mobile-cart').click()
    page.screenshot(path=str(output / 'combined-basket-mobile.png'))
    page.get_by_role('button', name='Choose pickup times', exact=True).click()
    expect(page.locator('.bb-checkout-kitchen')).to_have_count(2)
    expect(page.locator('#checkout-dialog')).to_contain_text('RM 19.00')
    page.get_by_role('button', name='Confirm all kitchen orders', exact=True).click()
    expect(page.locator('.bb-order')).to_have_count(2)
    first = page.locator('.bb-order').filter(has=page.get_by_role('heading', name='Asian Cuisine', exact=True))
    sibling = page.locator('.bb-order').filter(has=page.get_by_role('heading', name='Bobanika', exact=True))
    first.locator('[data-action=cancel]').click()
    expect(first).to_contain_text('Cancelled')
    expect(sibling).to_contain_text('Confirmed')
    assert not errors, errors
    print('PASS 9 kitchens, all 45 JPEGs, sample labels, fail-closed allergy filters, combined mobile basket, two added-kitchen checkout and independent cancellation over browser HTTP.')
    browser.close()
