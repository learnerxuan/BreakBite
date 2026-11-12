"""Ivan's visual design integrated with current features; disposable localhost only."""
import argparse
from uuid import uuid4
from playwright.sync_api import sync_playwright, expect
from browser_support import ROOT, login, overflow

parser=argparse.ArgumentParser()
parser.add_argument('--base-url',default='http://127.0.0.1:8127')
parser.add_argument('--chromium')
args=parser.parse_args()
out=ROOT/'test-results'/'ivan-design';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=args.chromium)
    errors=[]
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.base_url)
    expect(page.locator('.bb-meal')).to_have_count(45)
    expect(page.locator('.bb-meal-register')).to_be_visible()
    expect(page.get_by_text('Sample menu',exact=False)).to_have_count(0)
    rail=page.locator('#prep-rail')
    assert rail.get_attribute('open') is None, 'Phone comparison must start collapsed'
    expect(page.locator('.bb-area-strip')).to_be_visible()
    page.screenshot(path=str(out/'guest-mobile.png'))
    rail.locator('summary').click()
    expect(rail).to_have_attribute('open','')
    page.wait_for_timeout(5600)
    expect(rail).to_have_attribute('open','')
    expect(page.locator('#prep-rail-toggle')).to_be_focused()
    expect(rail.locator('[data-max-prep="all"] strong')).to_have_text('12+')
    expect(rail.locator('[data-max-prep]')).to_have_count(12)
    rail.locator('summary').click()
    page.wait_for_timeout(5600)
    assert rail.get_attribute('open') is None, 'Polling reopened the optional comparison'
    page.locator('#search-input').fill('  ASIAN CUISINE  ')
    page.locator('#search-form').get_by_role('button',name='Find meals',exact=True).click()
    expect(page.locator('.bb-meal')).to_have_count(5)
    expect(page.locator('.bb-menu-heading')).to_contain_text('5 menu items shown')
    page.locator('#search-input').fill('does-not-exist')
    page.locator('#search-form').get_by_role('button',name='Find meals',exact=True).click()
    expect(page.get_by_role('heading',name='No meals match.',exact=True)).to_be_visible()
    page.locator('#search-input').fill('')
    page.locator('#search-form').get_by_role('button',name='Find meals',exact=True).click()
    first=page.locator('.bb-meal').first
    expect(first).to_contain_text('Contains: eggs, peanuts.')
    expect(first.locator('.bb-allergen-note')).to_be_visible()
    expect(first.locator('.bb-meal-pickup')).to_contain_text('Estimated pickup')
    assert first.locator('[data-action=food-details]').bounding_box()['height']>=44
    first.locator('[data-action=food-details]').click()
    expect(page.locator('#food-dialog')).to_be_visible()
    expect(page.locator('#food-dialog')).not_to_contain_text('Cross-contact may occur.')
    expect(page.locator('#food-dialog')).not_to_contain_text('Kitchen reviewed:')
    expect(page.locator('#food-dialog')).not_to_contain_text('Photo: AI-generated')
    page.keyboard.press('Escape')
    login(page,f'ivan-design-{uuid4().hex[:8]}@example.test',register=True)
    expect(page.get_by_role('heading',name='Estimated food waiting time saved',exact=True)).to_be_visible()
    assert page.locator('.bb-impact').bounding_box()['y']<500
    page.locator('#savings-explanation-toggle').click()
    page.wait_for_timeout(5600)
    expect(page.locator('#savings-explanation')).to_have_attribute('open','')
    expect(page.locator('#savings-explanation-toggle')).to_be_focused()
    page.locator('#savings-explanation-toggle').click()
    for width in [360,390,600,640,768,860,861,900,1024,1440]:
        page.set_viewport_size({'width':width,'height':1000 if width>600 else 844})
        page.evaluate('scrollTo(0,0)')
        overflow(page)
        assert page.evaluate('''()=>{const form=document.querySelector('#search-form'),box=form.getBoundingClientRect();return [...form.children].every(e=>e.getBoundingClientRect().right<=box.right+1)}'''), 'Search controls overlap the basket'
        if width in [390,900,1440]:page.screenshot(path=str(out/f'student-{width}.png'))
    availability=page.get_by_role('button',name='Availability',exact=True)
    availability.click();expect(availability).to_have_attribute('aria-current','page')
    page.get_by_role('button',name='Explore',exact=True).click()
    expect(page.get_by_role('button',name='Explore',exact=True)).to_have_attribute('aria-current','page')
    assert not errors,errors
    browser.close()
    print('PASS compact design, phone prep-filter defaults and polling, kitchen search, current food labels/status/savings, ingredients, navigation, responsive search and basket boundaries.')
