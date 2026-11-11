"""Estimated preparation wait avoided, over real HTTP with disposable accounts/data."""
from __future__ import annotations
import argparse
from uuid import uuid4
from playwright.sync_api import expect, sync_playwright
from browser_support import ROOT, login, overflow

parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:8080')
parser.add_argument('--chromium')
args = parser.parse_args()
output = ROOT / 'test-results' / 'savings'
output.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=args.chromium)
    errors = []
    def page():
        context = browser.new_context(viewport={'width':390,'height':844})
        pg = context.new_page()
        pg.add_init_script("""if (!sessionStorage.getItem('legacy-cart-fixture')) {
            sessionStorage.setItem('legacy-cart-fixture','done');
            sessionStorage.setItem('breakbite-cart-v2',JSON.stringify([{vendorId:'bowl-lab',itemId:'chicken-rice',quantity:1}]));
        }""")
        pg.on('pageerror', lambda error: errors.append(str(error)))
        pg.on('dialog', lambda dialog: dialog.accept())
        pg.goto(args.base_url)
        return pg
    student = page()
    expect(student.locator('.bb-meal')).to_have_count(45)
    expect(student.locator('.bb-cart-group')).to_have_count(0)
    expect(student.locator('#basket')).to_contain_text('Items from retired kitchens were removed')
    expect(student.locator('#kitchen-filter')).not_to_contain_text('Bowl Lab')
    expect(student.locator('#kitchen-filter')).not_to_contain_text('Noodle & Co.')
    login(student, f'savings-{uuid4().hex[:8]}@example.test', register=True)
    expect(student.locator('[data-savings-total]')).to_have_text('~0min')
    student.get_by_role('button', name='Add Nasi lemak ayam', exact=True).click()
    student.get_by_role('button', name='Add Brown sugar milk tea', exact=True).click()
    expect(student.locator('.bb-prep-preview')).to_contain_text('~8 min')
    student.get_by_role('button', name='Choose pickup times', exact=True).click()
    student.get_by_role('button', name='Confirm all kitchen orders', exact=True).click()
    expect(student.locator('.bb-order')).to_have_count(2)
    expect(student.locator('[data-savings-total]')).to_have_text('~0min')
    codes = {}
    for kitchen in ['Asian Cuisine','Bobanika']:
        card = student.locator('.bb-order').filter(has=student.get_by_role('heading', name=kitchen, exact=True))
        codes[kitchen] = card.locator('.bb-pickup-code strong').inner_text()
    for kitchen, email in [('Asian Cuisine','operator.bowl@example.test'),('Bobanika','operator.noodle@example.test')]:
        operator = page()
        login(operator, email)
        operator.get_by_role('button', name='Start preparing', exact=True).first.click()
        operator.get_by_role('button', name='Mark ready', exact=True).first.click()
        form = operator.locator('.bb-collect').first
        form.locator('input[name=code]').fill(codes[kitchen])
        form.locator('input[type=checkbox]').check()
        form.get_by_role('button', name='Verify & complete pickup', exact=True).click()
        expect(operator.locator('#toast')).to_contain_text('Pickup completed')
        expect(student.locator('[data-savings-total]')).to_have_text('~8min', timeout=15000)
        operator.context.close()
    expect(student.locator('.bb-order-saving')).to_have_count(2)
    student.reload()
    expect(student.locator('[data-savings-total]')).to_have_text('~8min')
    expect(student.locator('.bb-impact')).to_contain_text('1 collected checkout')
    student.locator('.bb-impact summary').click()
    expect(student.locator('.bb-impact')).to_contain_text('not measured time saved')
    for width in [360,390,768,1440]:
        student.set_viewport_size({'width':width,'height':844})
        overflow(student)
    student.set_viewport_size({'width':390,'height':844})
    student.locator('.bb-impact').scroll_into_view_if_needed()
    student.screenshot(path=str(output / 'estimated-savings-mobile.png'))
    other = page()
    login(other, f'other-{uuid4().hex[:8]}@example.test', register=True)
    expect(other.locator('[data-savings-total]')).to_have_text('~0min')
    student.get_by_role('button', name='Sign out', exact=True).click()
    expect(student.locator('[data-savings-total]')).to_have_count(0)
    assert not errors, errors
    browser.close()
    print('PASS 9 kitchens/45 meals, estimate preview, collected-only savings, largest-per-checkout total, reload persistence, account isolation, explanation and responsive layouts over browser HTTP.')
