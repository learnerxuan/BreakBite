"""Local-account product journeys. Normal HTTP by default; --bridge renders local
compiled code without browser navigation when the test environment blocks URLs.
Bridge mode does NOT test browser networking, cookie enforcement, CSP or TLS.
Use a disposable DATA_DIR. Provision the two fixture operators before starting.
"""
from __future__ import annotations
import argparse, json, re, urllib.request, urllib.error, http.cookiejar, uuid, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--base-url',default='http://127.0.0.1:8080');p.add_argument('--bridge',action='store_true');p.add_argument('--chromium');args=p.parse_args()
OUT=ROOT/'test-results'/'product';OUT.mkdir(parents=True,exist_ok=True)
PASSWORD=os.environ.get('TEST_OPERATOR_PASSWORD','Fixture-only-password-2026')

def bundle():
    def code(path):
        return re.sub(r'^import .*?;\s*$', '', (ROOT/'dist'/path).read_text(), flags=re.M).replace('export ','')
    modules=[
        ('Model','shared/model.js','', 'money,time,atRisk'),
        ('Client','web/client.js','', 'api,ApiError,restore,signIn,signOut'),
        ('State','web/state.js','', 'initialState'),
        ('UI','web/ui.js','', 'esc,icon,art,localValue,fromLocal,short,statusLabel'),
        ('Student','web/views/student.js','const {money,time,atRisk}=Model;const {art,esc,icon,localValue,short,statusLabel}=UI;', 'explore,orders,checkoutDialog,proposalCard'),
        ('Vendor','web/views/vendor.js','const {money,time,atRisk}=Model;const {art,esc,short,statusLabel}=UI;const {proposalCard}=Student;', 'vendor,menuDialog'),
    ]
    result='\n'.join(f'const {name}=(()=>{{{imports}\n{code(path)}\nreturn {{{exports}}};}})();' for name,path,imports,exports in modules)
    return result+'\n(()=>{const {api,ApiError,restore,signIn,signOut}=Client;const {initialState}=State;const {esc,fromLocal}=UI;const {explore,orders,checkoutDialog}=Student;const {vendor,menuDialog}=Vendor;'+code('web/main.js')+'\n})();'

def boot(page):
    if not args.bridge:
        page.goto(args.base_url,wait_until='networkidle');return
    jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def backend(url,options=None):
        if not url.startswith('/api/') or '..' in url:raise ValueError('Only this local application API is allowed')
        o=options or {};req=urllib.request.Request(args.base_url.rstrip('/')+url,data=o['body'].encode() if o.get('body') is not None else None,headers={**o.get('headers',{}),'Origin':args.base_url.rstrip('/')},method=o.get('method','GET'))
        try:
            with opener.open(req,timeout=15) as r:return {'status':r.status,'body':r.read().decode(),'headers':dict(r.headers)}
        except urllib.error.HTTPError as e:return {'status':e.code,'body':e.read().decode(),'headers':dict(e.headers)}
    page.expose_function('__localBackend',backend)
    page.set_content('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><a class="skip-link" href="#main">Skip to content</a><div id="app"></div><div id="toast" role="status" aria-live="polite"></div></body></html>')
    for file in ['styles.css','product.css']:page.add_style_tag(content=(ROOT/'src/web'/file).read_text())
    page.evaluate('''() => { const values=new Map();Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}});window.fetch=async(url,options={})=>{const r=await window.__localBackend(String(url),{method:options.method||'GET',headers:options.headers||{},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});}; }''')
    page.add_script_tag(content=bundle())

def overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'

def login(page,email,password=PASSWORD,register=False):
    page.get_by_role('button',name='Sign in',exact=True).click()
    if register:page.get_by_role('button',name='New here? Create an account').click();page.get_by_label('Your name',exact=True).fill('Review Student')
    page.get_by_label('Email',exact=True).fill(email);page.get_by_label('Password',exact=True).fill(password)
    page.locator('#auth-form button[type=submit]').click();expect(page.locator('#auth-dialog')).to_have_count(0)

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,**({'executable_path':args.chromium} if args.chromium else {}))
    errors=[]
    def page(width=1440,height=1000):
        ctx=b.new_context(viewport={'width':width,'height':height});pg=ctx.new_page();pg.set_default_timeout(12000);pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept());boot(pg);return pg
    student=page();expect(student.locator('.bb-meal')).to_have_count(10)
    assert 'Local Demo Only' not in student.locator('body').inner_text();assert student.locator('input[name=nextClassAt]').count()==0
    overflow(student);student.screenshot(path=str(OUT/'home-desktop.png'),full_page=True)
    student.get_by_role('button',name='Add Golden chicken rice',exact=True).click();student.get_by_role('button',name='Add Sparkling lemon',exact=True).click()
    expect(student.locator('.bb-cart-group')).to_have_count(2)
    login(student,f'student-{uuid.uuid4().hex[:8]}@example.test',register=True)
    student.get_by_role('button',name='Choose pickup times',exact=True).click();expect(student.locator('#checkout-dialog')).to_be_visible();expect(student.locator('.bb-checkout-kitchen')).to_have_count(2)
    student.screenshot(path=str(OUT/'multi-kitchen-checkout.png'),full_page=True)
    student.get_by_role('button',name='Confirm all kitchen orders',exact=True).click();expect(student.locator('.bb-order')).to_have_count(2)
    codes=student.locator('.bb-pickup-code strong').all_inner_texts();assert len(set(codes))==2
    student.screenshot(path=str(OUT/'orders-desktop.png'),full_page=True)
    op=page();login(op,'operator.bowl@example.test');expect(op.locator('[data-vendor-tab]')).to_have_count(4)
    assert not any(c in op.locator('body').inner_text() for c in codes)
    expect(op.locator('.bb-order-grid').first.locator('.bb-order')).not_to_have_count(0)
    op.get_by_role('button',name='Delays & recovery').click();op.locator('#incident-form select').select_option('chicken-rice');op.locator('#incident-form textarea').fill('Preparation unexpectedly delayed');op.locator('#incident-form input[type=number]').fill('20');op.get_by_role('button',name='Update affected orders').click()
    op.get_by_role('button',name='Check alternatives').last.click();expect(op.get_by_role('button',name='Propose',exact=True).first).to_be_visible();op.get_by_role('button',name='Propose',exact=True).first.click();op.get_by_role('button',name='Approve for student').first.click()
    student.bring_to_front();expect(student.get_by_role('button',name='Accept alternative')).to_be_visible(timeout=15000);student.get_by_role('button',name='Accept alternative').click();expect(student.locator('#toast')).to_contain_text('Alternative accepted')
    new_codes=student.locator('.bb-pickup-code strong').all_inner_texts();assert set(codes)!=set(new_codes)
    student.set_viewport_size({'width':390,'height':844});student.screenshot(path=str(OUT/'orders-mobile.png'),full_page=True);overflow(student)
    code=student.locator('.bb-order').filter(has=student.get_by_role('heading',name='Bowl Lab',exact=True)).locator('.bb-pickup-code strong').inner_text()
    op.bring_to_front();op.get_by_role('button',name='Order queue',exact=True).click();op.get_by_role('button',name='Start preparing',exact=True).first.click();op.get_by_role('button',name='Mark ready',exact=True).first.click();form=op.locator('.bb-collect').first;form.locator('input[name=code]').fill(code);form.locator('input[type=checkbox]').check();form.get_by_role('button',name='Verify & complete pickup').click();expect(op.locator('#toast')).to_contain_text('Pickup completed')
    op.get_by_role('button',name='Menu & stock',exact=True).click();op.get_by_role('button',name='+ Add menu item',exact=True).click();expect(op.locator('#menu-dialog')).to_be_visible();op.get_by_label('Name',exact=True).fill('Kitchen special');op.get_by_label('Description',exact=True).fill('Operator-created menu item');op.get_by_label('Price (RM)',exact=True).fill('8.50');op.get_by_role('button',name='Save item',exact=True).click();expect(op.get_by_role('heading',name='Kitchen special',exact=True)).to_be_visible();op.set_viewport_size({'width':390,'height':844});overflow(op);op.screenshot(path=str(OUT/'vendor-mobile.png'),full_page=True)
    student.bring_to_front();student.get_by_role('button',name='Explore',exact=True).click();expect(student.locator('.bb-meal')).not_to_have_count(0);overflow(student);student.screenshot(path=str(OUT/'home-mobile.png'),full_page=True)
    student.get_by_role('button',name='Add Sesame tofu bowl',exact=True).click();student.get_by_role('button',name='Choose pickup times').click();overflow(student);student.screenshot(path=str(OUT/'checkout-mobile.png'),full_page=True)
    # Lose one response after the actual server commit. The same request is recovered, not submitted twice.
    student.evaluate('''() => {const real=window.fetch;let drop=true;window.fetch=async(url,options)=>{const r=await real(url,options);if(drop&&url==='/api/checkouts'&&options.method==='POST'){drop=false;throw new TypeError('Test: response lost after server commit');}return r;};}''')
    student.get_by_role('button',name='Confirm all kitchen orders').click();expect(student.locator('.bb-pending')).to_be_visible();student.get_by_role('button',name='Check / retry original checkout').click();expect(student.locator('.bb-order')).to_have_count(3);expect(student.locator('.bb-pending')).to_have_count(0)
    # Cancel only the fresh tofu order; the drink stays independently active.
    tofu=student.locator('.bb-order').filter(has_text='Sesame tofu bowl').last
    # It may also have been the replacement meal above. The last still-confirmed order is selected by its cancel button.
    student.get_by_role('button',name='Cancel this kitchen’s order').first.click();expect(student.locator('#toast')).to_contain_text('Kitchen order cancelled')
    for width in [360,768,1440]:student.set_viewport_size({'width':width,'height':1000});student.get_by_role('button',name='Explore',exact=True).click();overflow(student)
    assert not errors,errors
    print(json.dumps({'result':'PASS','transport':'local rendered code/API bridge' if args.bridge else 'browser HTTP','checks':['guest catalogue','student signup','multi-kitchen checkout','two pickup codes','operator isolation','delay and consent-based replacement','payment-confirmed collection','menu creation','390/360/768/1440 layouts','lost-response checkout recovery','per-kitchen cancellation','no JS errors'],'screenshots':str(OUT)},indent=2))
    b.close()
