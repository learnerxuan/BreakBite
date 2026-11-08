"""Availability and push settings layout checks. Bridge mode does NOT prove real device delivery."""
import argparse, json, uuid
from playwright.sync_api import sync_playwright, expect
from browser_support import ROOT, boot, login, overflow
p=argparse.ArgumentParser();p.add_argument('--base-url',default='http://127.0.0.1:8080');p.add_argument('--bridge',action='store_true');p.add_argument('--chromium');args=p.parse_args()
out=ROOT/'test-results'/'v0.3.1';out.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,**({'executable_path':args.chromium} if args.chromium else {}))
    page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(10000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));boot(page,args.base_url,args.bridge)
    expect(page.locator('.bb-meal')).not_to_have_count(0);expect(page.locator('.bb-loads')).to_have_count(0)
    page.get_by_role('button',name='Availability',exact=True).click();expect(page.get_by_role('heading',name='Kitchen availability',level=1)).to_be_visible();expect(page.locator('.bb-loads')).to_have_count(1);expect(page.locator('.bb-meal')).to_have_count(0)
    for w in [360,390,768,1440]:
        page.set_viewport_size({'width':w,'height':1000});overflow(page)
        if w in [390,1440]:page.screenshot(path=str(out/f'availability-{w}.png'),full_page=True)
    page.get_by_role('button',name='Explore',exact=True).click();expect(page.locator('.bb-loads')).to_have_count(0)
    login(page,f'notifications-{uuid.uuid4().hex[:8]}@example.test',register=True)
    page.get_by_role('button',name='Inbox',exact=True).click();expect(page.get_by_role('heading',name='Inbox',exact=True)).to_be_visible();expect(page.locator('.bb-push-panel')).to_be_visible()
    expect(page.get_by_role('button',name='Enable push notifications',exact=True)).to_be_disabled()
    expect(page.locator('.bb-push-panel')).to_contain_text('not configured')
    for w in [360,390,768,1440]:
        page.set_viewport_size({'width':w,'height':1000});overflow(page)
        if w in [390,1440]:page.screenshot(path=str(out/f'inbox-{w}.png'),full_page=True)
    assert not errors,errors
    print(json.dumps({'result':'PASS','mode':'renderer/API bridge' if args.bridge else 'browser navigation','checks':['Availability independent from Explore','guest and student tabs','push setup status','360/390/768/1440 layouts','no JS errors'],'real_push_delivery_tested':False}))
    browser.close()
