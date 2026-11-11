"""Local-account product journeys. Normal HTTP by default; --bridge renders local
compiled code without browser navigation when the test environment blocks URLs.
Bridge mode does NOT test browser networking, cookie enforcement, CSP or TLS.
Use a disposable DATA_DIR. Provision the two fixture operators before starting.
"""
from __future__ import annotations
import argparse, json, re, uuid, os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import monotonic, sleep
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--base-url',default='http://127.0.0.1:8080');p.add_argument('--bridge',action='store_true');p.add_argument('--chromium');p.add_argument('--apspace-export',type=Path,action='append',default=[]);args=p.parse_args()
OUT=ROOT/'test-results'/'product';OUT.mkdir(parents=True,exist_ok=True)
PASSWORD=os.environ.get('TEST_OPERATOR_PASSWORD','Fixture-only-password-2026')

from browser_support import boot as boot_page, login, overflow

def boot(page):
    boot_page(page, args.base_url, args.bridge)

MYT = timezone(timedelta(hours=8))

def wait_until(predicate, timeout=12):
    deadline = monotonic() + timeout
    while monotonic() < deadline:
        if predicate():
            return
        sleep(.1)
    assert predicate(), 'Timed out waiting for the browser condition'

def verify_apspace_export(page, path):
    # Cross-check the rendered wall times with Python's independent UTC conversion.
    source = re.sub(r'\r?\n[ \t]', '', path.read_text(encoding='utf-8-sig'))
    events = re.findall(r'BEGIN:VEVENT.*?DTSTART:(\d{8}T\d{6}Z).*?DTEND:(\d{8}T\d{6}Z).*?END:VEVENT', source, re.S)
    assert events and len(events) == source.count('BEGIN:VEVENT')
    panel = page.locator('.bb-timetable')
    page.locator('#apspace-file').set_input_files(path)
    rows = panel.locator('.bb-timetable-class')
    expect(rows).to_have_count(len(events))
    dates = set()
    for i, (start, end) in enumerate(sorted(events)):
        start_myt, end_myt = [datetime.strptime(v, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc).astimezone(MYT) for v in (start, end)]
        dates.add(start_myt.date())
        expect(rows.nth(i)).to_contain_text(start_myt.strftime('%H:%M'))
        expect(rows.nth(i)).to_contain_text(end_myt.strftime('%H:%M') + ' MYT')
    labels = [f'{day:%a}, {day.day} {day:%b %Y}' for day in sorted(dates)]
    expect(panel.locator('h5')).to_have_text(labels)
    panel.get_by_role('button',name='Cancel import',exact=True).click()

def timetable_fixture(name, title='TEST-CLASS'):
    now = datetime.now(MYT).replace(second=0, microsecond=0)
    midnight = (now + timedelta(hours=2)).replace(hour=0, minute=0)
    first_end = max(midnight + timedelta(minutes=1), now - timedelta(minutes=1))
    next_start = max(midnight + timedelta(hours=1), now + timedelta(hours=2))
    def event(summary, start, end):
        utc = lambda date: date.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        return ['BEGIN:VEVENT', f'SUMMARY:{summary}', f'DTSTART:{utc(start)}',
                f'DTEND:{utc(end)}', 'LOCATION:Synthetic Room A', 'END:VEVENT']
    first_start = first_end - timedelta(minutes=1) if first_end.date() != now.date() else max(midnight, first_end - timedelta(hours=1))
    future = midnight + timedelta(days=2, hours=10)
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
             *event(title, first_start, first_end),
             *event('ALTERNATIVE', first_start, first_end),
             *event('NEXT-CLASS', next_start, next_start + timedelta(hours=1)),
             *event('FUTURE-A', future, future + timedelta(hours=1)),
             *event('FUTURE-B', future + timedelta(hours=3), future + timedelta(hours=4)),
             'END:VCALENDAR']
    return {'name': name, 'mimeType': 'text/calendar', 'buffer': '\r\n'.join(lines).encode()}, midnight.date(), next_start

def test_timetable(page):
    fit = page.locator('#fit-toggle')
    fit.check()
    panel = page.locator('.bb-timetable')
    field = page.locator('#apspace-file')
    confirm = page.locator('#apspace-confirm')
    consent = page.locator('#apspace-consent')
    date_input = page.locator('#apspace-date')
    gap = panel.get_by_role('button', name='Use this break', exact=True)
    cancel = panel.get_by_role('button', name='Cancel import', exact=True)
    remove = panel.get_by_role('button', name='Remove timetable', exact=True)
    next_input = page.locator('input[name=nextClassAt]')
    budget = page.get_by_label('Food budget (RM)')
    eat = page.get_by_label('Time to eat (min)')
    fixture, date, next_start = timetable_fixture('initial.ics')
    replacement, _, _ = timetable_fixture('replacement.ics', 'REPLACEMENT-CLASS')

    # Track actual poll completions and verify raw timetable data never leaves the tab.
    page.evaluate(r'''() => {
        window.statePolls = 0; window.timetableRequests = []; window.quotePlans = [];
        const fetchReal = window.fetch;
        window.fetch = async (url, options) => {
            if (String(url).includes('/timetable/') || /TEST-CLASS|Synthetic Room A|initial\.ics/.test(options?.body ?? '')) {
                window.timetableRequests.push(String(url));
            }
            if (url === '/api/checkout/quote') window.quotePlans.push(JSON.parse(options.body).plan);
            const response = await fetchReal(url, options);
            if (url === '/api/product/profile') window.statePolls++;
            return response;
        };
        const read = File.prototype.arrayBuffer;
        window.finishRead = {};
        File.prototype.arrayBuffer = async function () {
            if (this.name.startsWith('slow-')) await new Promise(resolve => {window.finishRead[this.name] = resolve;});
            return read.call(this);
        };
    }''')
    budget.fill('31.75')
    eat.fill('9')
    page.locator('#plan-form details summary').click()
    page.get_by_label('Return', exact=True).fill('4')
    # Exercise the real browser file picker event in addition to selecting synthetic bytes.
    with page.expect_file_chooser() as picker:
        field.press('Enter')
    picker.value.set_files(fixture)
    expect(page.locator('#apspace-preview')).to_be_focused()
    expect(confirm).to_be_disabled()
    expect(panel.get_by_text('Overlapping class', exact=True)).to_have_count(2)
    panel.get_by_role('checkbox', name='ALTERNATIVE', exact=False).uncheck()
    consent.focus()
    page.keyboard.press('Space')
    expect(consent).to_be_checked()
    wait_until(lambda: page.evaluate('window.statePolls > 0'))
    expect(consent).to_be_focused()
    expect(confirm).to_be_enabled()
    expect(budget).to_have_value('31.75')
    expect(eat).to_have_value('9')
    expect(page.get_by_label('Return', exact=True)).to_have_value('4')
    for width in [360, 390, 768, 1440]:
        page.set_viewport_size({'width': width, 'height': 900})
        overflow(page)
        assert panel.evaluate('(el) => el.scrollWidth <= el.clientWidth + 1')
        if width in [390, 1440]:
            panel.screenshot(path=str(OUT/f'timetable-preview-{width}.png'))
    confirm.click()
    expect(date_input).to_be_focused()
    expect(panel).to_contain_text('4 confirmed classes')
    date_input.fill(str(date + timedelta(days=2)))
    expect(gap).to_be_visible()
    expect(gap).to_be_disabled()
    date_input.fill(str(date))
    gap.click()
    expect(page.locator('#plan-start')).to_be_focused()
    expect(next_input).to_have_value(next_start.strftime('%Y-%m-%dT%H:%M'))
    expect(budget).to_have_value('31.75')
    expect(eat).to_have_value('9')
    expect(page.locator('#plan-form')).to_contain_text('Times from your APSpace timetable')

    # Malformed bytes and cancelled previews leave the accepted classes and effective plan intact.
    field.set_input_files({'name':'bad.ics', 'mimeType':'text/calendar', 'buffer':b'\xff'})
    expect(panel.get_by_role('alert')).to_contain_text('UTF-8')
    expect(panel).to_contain_text('initial.ics')
    field.set_input_files(replacement)
    expect(page.locator('#apspace-preview')).to_be_visible()
    cancel.click()
    expect(field).to_be_focused()
    expect(panel).to_contain_text('initial.ics')
    expect(next_input).to_have_value(next_start.strftime('%Y-%m-%dT%H:%M'))

    if not args.bridge:
        field.set_input_files({**replacement, 'name':'slow-inbox.ics'})
        wait_until(lambda: page.evaluate('Boolean(window.finishRead["slow-inbox.ics"])'))
        page.evaluate('''navigator.serviceWorker.dispatchEvent(
            new MessageEvent('message', {data: {type: 'OPEN_INBOX'}}))''')
        expect(page.locator('button[data-view=inbox].active')).to_be_visible()
        page.evaluate('window.finishRead["slow-inbox.ics"]()')
        page.get_by_role('button',name='Explore',exact=True).click()
        expect(panel).not_to_contain_text('Reading timetable')
        expect(panel).to_contain_text('initial.ics')

    # Finishing a cancelled read or an older read must not replace the current preview.
    for name in ['slow-cancel.ics', 'slow-older.ics', 'slow-newer.ics']:
        field.set_input_files({**replacement, 'name':name})
        wait_until(lambda: page.evaluate('(name) => Boolean(window.finishRead[name])', name))
        if name == 'slow-cancel.ics':
            cancel.click()
            page.evaluate('window.finishRead["slow-cancel.ics"]()')
    page.evaluate('window.finishRead["slow-newer.ics"]()')
    expect(page.locator('#apspace-preview')).to_be_visible()
    page.evaluate('window.finishRead["slow-older.ics"]()')
    expect(panel).to_contain_text('slow-newer.ics')
    expect(panel).not_to_contain_text('slow-older.ics')
    consent.check()
    confirm.click()
    expect(fit).not_to_be_checked()
    fit.check()
    expect(panel).to_contain_text('slow-newer.ics')
    expect(page.locator('#plan-form')).not_to_contain_text('Times from your APSpace timetable')

    date_input.fill(str(date))
    gap.click()
    manually_edited = (next_start + timedelta(minutes=5)).strftime('%Y-%m-%dT%H:%M')
    next_input.fill(manually_edited)
    expect(page.locator('#plan-form')).to_contain_text('Times from your APSpace timetable')
    page.get_by_role('button', name='Apply time preferences').click()
    expect(page.locator('#plan-form')).to_contain_text('Manually edited time preferences')
    remove.click()
    expect(fit).to_be_checked()
    expect(next_input).to_have_value(manually_edited)
    expect(panel).not_to_contain_text('slow-newer.ics')

    # Pick a fresh imported gap for the real quote and lost-response checkout.
    field.set_input_files(fixture)
    consent.check()
    confirm.click()
    date_input.fill(str(date))
    gap.click()
    assert page.evaluate('window.timetableRequests') == []
    return fixture

with sync_playwright() as p:
    b=p.chromium.launch(headless=True,**({'executable_path':args.chromium} if args.chromium else {}))
    errors=[]
    def page(width=1440,height=1000):
        ctx=b.new_context(viewport={'width':width,'height':height});pg=ctx.new_page();pg.set_default_timeout(12000);pg.on('pageerror',lambda e:errors.append(str(e)));pg.on('dialog',lambda d:d.accept());boot(pg);return pg
    student=page();expect(student.locator('.bb-meal')).to_have_count(55)
    assert 'Local Demo Only' not in student.locator('body').inner_text();assert student.locator('input[name=nextClassAt]').count()==0
    overflow(student);student.screenshot(path=str(OUT/'home-desktop.png'),full_page=True)
    student.get_by_role('button',name='Add Golden chicken rice',exact=True).click();student.get_by_role('button',name='Add Sparkling lemon',exact=True).click()
    expect(student.locator('.bb-cart-group')).to_have_count(2)
    student_email = f'student-{uuid.uuid4().hex[:8]}@example.test'
    login(student,student_email,register=True)
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
    op.get_by_role('button',name='Menu & stock',exact=True).click();op.get_by_role('button',name='+ Add menu item',exact=True).click();expect(op.locator('#menu-dialog')).to_be_visible();op.get_by_label('Name',exact=True).fill('Kitchen special');op.get_by_label('Description',exact=True).fill('Operator-created menu item');op.get_by_label('Price (RM)',exact=True).fill('8.50');op.locator('input[name=foodConfirmed]').check();op.get_by_role('button',name='Save item',exact=True).click();expect(op.get_by_role('heading',name='Kitchen special',exact=True)).to_be_visible();op.set_viewport_size({'width':390,'height':844});overflow(op);op.screenshot(path=str(OUT/'vendor-mobile.png'),full_page=True)
    student.bring_to_front();student.get_by_role('button',name='Explore',exact=True).click();expect(student.locator('.bb-meal')).not_to_have_count(0);overflow(student);student.screenshot(path=str(OUT/'home-mobile.png'),full_page=True)
    student.get_by_role('button',name='Add Sesame tofu bowl',exact=True).click()
    student.get_by_role('button',name='Add Sparkling lemon',exact=True).click()
    fixture = test_timetable(student)
    student.get_by_role('button',name='Choose pickup times').click()
    expect(student.locator('.bb-checkout-kitchen')).to_have_count(2)
    # A valid new selection replaces the effective plan and discards the open quote.
    student.locator('[data-action=apspace-use]').dispatch_event('click')
    expect(student.locator('#checkout-dialog')).to_have_count(0)
    student.get_by_role('button',name='Choose pickup times').click()
    expect(student.locator('.bb-checkout-kitchen')).to_have_count(2)
    plans = student.evaluate('window.quotePlans')
    assert len(plans) == 2
    assert set(plans[-1]) == {'breakStartAt', 'nextClassAt', 'budgetSen', 'walkToMinutes',
                             'eatMinutes', 'returnMinutes', 'bufferMinutes'}
    assert plans[-1]['budgetSen'] == 3175 and plans[-1]['eatMinutes'] == 9
    student.set_viewport_size({'width':390,'height':844})
    overflow(student);student.screenshot(path=str(OUT/'checkout-mobile.png'),full_page=True)
    # Lose one response after the actual server commit. The same request is recovered, not submitted twice.
    student.evaluate('''() => {
        const real=window.fetch;
        window.fetch=async(url,options)=>{
            const response=await real(url,options);
            if(url==='/api/checkouts'&&options.method==='POST'){
                window.committed=await response.clone().json();
                throw new TypeError('Test: response lost after server commit');
            }
            if (url.startsWith('/api/checkouts/') && response.ok) window.recovered=(await response.clone().json()).checkout;
            return response;
        };
    }''')
    student.get_by_role('button',name='Confirm all kitchen orders').click()
    expect(student.locator('.bb-pending')).to_be_visible()
    actor_id = student.evaluate('async () => (await (await fetch("/api/session")).json()).actor.id')
    cache_key = 'breakbite-checkout-v2:' + actor_id
    saved_attempt = lambda: student.evaluate('key => sessionStorage.getItem(key)', cache_key)
    attempt = saved_attempt()
    assert attempt and len(student.evaluate('window.committed.orders')) == 2
    for selector in ['#apspace-file', '[data-action=apspace-use]', '[data-action=apspace-remove]', '#plan-form button[type=submit]']:
        control = student.locator(selector)
        expect(control).to_be_disabled()
        control.dispatch_event('change' if selector == '#apspace-file' else 'click')
    student.locator('#plan-form').dispatch_event('submit')
    assert saved_attempt() == attempt

    # The original record survives sign-out; a different student can order normally.
    student.get_by_role('button', name='Sign out').click()
    expect(student.locator('#fit-toggle')).not_to_be_checked()
    login(student, f'other-{uuid.uuid4().hex[:8]}@example.test', register=True)
    expect(student.locator('.bb-pending')).to_have_count(0)
    student.get_by_role('button',name='Add Sparkling lemon',exact=True).click()
    student.get_by_role('button',name='Choose pickup times').click()
    expect(student.locator('.bb-checkout-kitchen')).to_have_count(1)
    assert student.evaluate('window.quotePlans.at(-1).mode') == 'pickup'
    student.locator('[data-action=close-checkout]').click()
    assert saved_attempt() == attempt
    student.get_by_role('button', name='Sign out').click()
    # Check the legacy unscoped key still works for an already-open tab after upgrading.
    student.evaluate('''key => {
        sessionStorage.setItem('breakbite-checkout-v2', sessionStorage.getItem(key));
        sessionStorage.removeItem(key);
    }''', cache_key)
    login(student, student_email)
    student.get_by_role('button',name='Check / retry original checkout').click()
    expect(student.locator('.bb-order')).to_have_count(4)
    expect(student.locator('.bb-pending')).to_have_count(0)
    assert student.evaluate('sessionStorage.getItem("breakbite-checkout-v2")') is None
    assert student.evaluate('window.recovered.orders.map(o => o.id)') == student.evaluate('window.committed.orders.map(o => o.id)')
    noodle_order = student.evaluate('window.recovered.orders.find(o => o.vendorId === "noodle-co")')
    noodle_op = page()
    login(noodle_op, 'operator.noodle@example.test')
    noodle_id = noodle_order['id']
    noodle_op.locator(f'[data-id="{noodle_id}"][data-status=preparing]').click()
    noodle_op.locator(f'[data-id="{noodle_id}"][data-status=ready]').click()
    pickup = noodle_op.locator(f'.bb-collect[data-collect="{noodle_id}"]')
    pickup.locator('input[name=code]').fill(noodle_order['pickupCode'])
    pickup.locator('input[name=paymentReceived]').check()
    pickup.get_by_role('button',name='Verify & complete pickup').click()
    expect(noodle_op.locator('#toast')).to_contain_text('Pickup completed')
    student.bring_to_front()
    expect(student.locator('.bb-order').filter(has_text='Order ' + noodle_id[:8].upper())).to_contain_text('Collected')
    # Cancel only the fresh tofu order; the drink stays independently active.
    tofu=student.locator('.bb-order').filter(has_text='Sesame tofu bowl').filter(has=student.get_by_role('button',name='Cancel this kitchen’s order'))
    tofu.get_by_role('button',name='Cancel this kitchen’s order').click()
    expect(student.locator('#toast')).to_contain_text('Kitchen order cancelled')
    student.get_by_role('button',name='Explore',exact=True).click()
    student.locator('#fit-toggle').check()
    expect(student.locator('.bb-timetable')).not_to_contain_text('initial.ics')
    student.locator('#apspace-file').set_input_files({**fixture, 'name':'slow-session.ics'})
    wait_until(lambda: student.evaluate('Boolean(window.finishRead["slow-session.ics"])'))
    student.get_by_role('button',name='Sign out').click()
    login(student, f'other-{uuid.uuid4().hex[:8]}@example.test', register=True)
    student.evaluate('window.finishRead["slow-session.ics"]()')
    student.locator('#fit-toggle').check()
    expect(student.locator('#apspace-preview')).to_have_count(0)
    expect(student.locator('.bb-timetable')).not_to_contain_text('slow-session.ics')
    if not args.bridge:
        student.locator('#apspace-file').set_input_files(fixture)
        student.locator('#apspace-consent').check()
        student.locator('#apspace-confirm').click()
        student.reload(wait_until='networkidle')
        expect(student.locator('#fit-toggle')).not_to_be_checked()
        student.locator('#fit-toggle').check()
        expect(student.locator('.bb-timetable')).not_to_contain_text('initial.ics')
        student.locator('#apspace-file').set_input_files(fixture)
        student.locator('#apspace-consent').check()
        student.locator('#apspace-confirm').click()
        student.evaluate('''() => {
            const real = window.fetch;
            window.fetch = (url, options) => url === '/api/state'
                ? Promise.resolve(Response.json({error:{message:'Session expired'}}, {status:401}))
                : real(url, options);
        }''')
        expect(student.locator('#auth-dialog')).to_contain_text('Your session expired')
        expect(student.locator('#fit-toggle')).not_to_be_checked()
        expect(student.locator('.bb-timetable')).to_have_count(0)
        student.reload(wait_until='networkidle')
    if args.apspace_export:
        student.locator('#fit-toggle').check()
        for export in args.apspace_export:
            verify_apspace_export(student, export)
    for width in [360,768,1440]:student.set_viewport_size({'width':width,'height':1000});student.get_by_role('button',name='Explore',exact=True).click();overflow(student)
    assert not errors,errors
    print(json.dumps({'result':'PASS','transport':'local rendered code/API bridge' if args.bridge else 'browser HTTP','checks':['guest catalogue','student signup','multi-kitchen checkout','two pickup codes','operator isolation','delay and consent-based replacement','payment-confirmed collection','menu creation','390/360/768/1440 layouts','APSpace file selection, keyboard review, consent, polling and gap horizon','invalid, cancelled, overlapping async and successful replacements','manual edits and removal','timetable-derived quote, lost-response checkout recovery and pickup','sign-out and actor changes during import/recovery','per-kitchen cancellation','no JS errors'],'real_apspace_exports_checked':len(args.apspace_export),'screenshots':str(OUT)},indent=2))
    b.close()
