"""Reference campus photos and clear, functional filters with disposable localhost data."""
import argparse
from uuid import uuid4
from playwright.sync_api import sync_playwright, expect
from browser_support import ROOT, login, overflow, open_basket, close_basket

parser=argparse.ArgumentParser();parser.add_argument('--base-url',default='http://127.0.0.1:8148');parser.add_argument('--chromium');args=parser.parse_args()
out=ROOT/'test-results'/'campus-photo-design';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=args.chromium)
    page=browser.new_page(viewport={'width':1440,'height':1100});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.base_url)
    expect(page.locator('.bb-area-card')).to_have_count(3)
    expect(page.locator('.bb-area-card img')).to_have_count(3)
    assert page.locator('.bb-area-card img').evaluate_all('(images)=>images.every(i=>i.complete&&i.naturalWidth>0)')
    expect(page.locator('.bb-area-strip')).to_contain_text('6 kitchens open')
    expect(page.locator('.bb-meal')).to_have_count(45)
    page.screenshot(path=str(out/'desktop-reference.png'))
    page.locator('[data-area="Atrium (Level 3)"]').click()
    expect(page.locator('.bb-meal')).to_have_count(5)
    expect(page.locator('[data-area="Atrium (Level 3)"]')).to_have_attribute('aria-pressed','true')
    page.get_by_role('button',name='Drinks',exact=True).click()
    expect(page.locator('.bb-meal')).to_have_count(1)
    page.get_by_role('button',name='Clear menu filters',exact=True).click()
    expect(page.locator('.bb-meal')).to_have_count(45)
    page.get_by_role('button',name='Add Nasi lemak ayam',exact=True).click()
    page.locator('[data-area="Above Centre Point (Level 5)"]').click()
    expect(page.locator('.bb-meal')).to_have_count(10)
    expect(page.locator('.bb-cart-line')).to_contain_text('Nasi lemak ayam')
    page.locator('#prep-filter-3').click()
    expect(page.locator('#prep-filter-3')).to_have_attribute('aria-pressed','true')
    assert page.locator('.bb-meal-time strong').evaluate_all('(nodes)=>nodes.every(n=>Number(n.textContent)<=3)')
    page.get_by_role('button',name='Clear menu filters',exact=True).click()
    page.get_by_role('button',name='Vegetarian',exact=True).click()
    expect(page.get_by_role('heading',name='No meals match.',exact=True)).to_be_visible()
    expect(page.locator('.bb-empty')).to_contain_text('reviewed information')
    page.get_by_role('button',name='Vegetarian',exact=True).click()
    page.get_by_role('button',name='Spicy',exact=True).click()
    assert 0<page.locator('.bb-meal').count()<45
    page.get_by_role('button',name='Clear menu filters',exact=True).click()
    toggle=page.locator('#allergy-filter-toggle');toggle.focus();toggle.press('Enter')
    expect(page.locator('#allergy-filters')).to_have_attribute('open','')
    assert toggle.bounding_box()['height']>=56
    page.get_by_role('button',name='Avoid Peanuts',exact=True).click()
    expect(toggle).to_contain_text('1 selected')
    expect(page.locator('.bb-meal')).to_have_count(0)
    page.wait_for_timeout(5600)
    expect(page.locator('#allergy-filters')).to_have_attribute('open','')
    expect(page.locator('#avoid-allergen-peanuts')).to_be_focused()
    page.get_by_role('button',name='Clear all',exact=True).click()
    expect(page.locator('.bb-meal')).to_have_count(45)
    toggle.click()
    login(page,f'campus-photo-{uuid4().hex[:8]}@example.test',register=True)
    before=page.evaluate("async()=> (await (await fetch('/api/product/profile')).json()).profile.preferences")
    page.get_by_role('button',name='Spicy',exact=True).click()
    after=page.evaluate("async()=> (await (await fetch('/api/product/profile')).json()).profile.preferences")
    assert before==after,'Browse filters changed saved food preferences'
    page.get_by_role('button',name='Clear menu filters',exact=True).click()
    expect(page.locator('.bb-impact')).to_be_visible()
    for width in [360,390,600,640,768,860,861,900,1024,1440]:
        page.set_viewport_size({'width':width,'height':1100 if width>600 else 844})
        if page.locator('#allergy-filters').get_attribute('open') is None:
            page.locator('#allergy-filter-toggle').click()
        assert page.locator('.bb-allergy-options').evaluate('e=>getComputedStyle(e).display')=='grid'
        assert page.locator('.bb-allergy-options button').evaluate_all('(buttons)=>buttons.every(b=>{const r=b.getBoundingClientRect(),p=b.closest(".bb-allergy-content").getBoundingClientRect();return r.left>=p.left&&r.right<=p.right+1&&r.height>=44})'),'Allergen choices overflow or have small touch targets'
        overflow(page)
        if width<=600:
            assert page.locator('.bb-area-card').evaluate_all('(cards)=>cards.every(c=>{const r=c.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth})')
        if width in [390,1440]:
            page.evaluate('scrollTo(0,0)');page.screenshot(path=str(out/f'student-{width}.png'))
    page.set_viewport_size({'width':390,'height':844})
    open_basket(page)
    expect(page.locator('.bb-cart-line')).to_contain_text('Nasi lemak ayam')
    close_basket(page)
    assert not errors,errors
    browser.close()
    print('PASS three current campus photo areas, area/category/prep/diet filtering, basket preservation, obvious keyboard-accessible allergy control, polling focus, unchanged saved preferences and 360–1440px layouts.')
