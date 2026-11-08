"""v0.3 UI acceptance journeys. Use a disposable database and fixture operators.
Run with --bridge only for isolated renderer checks; it is not a camera/network test.
Requires playwright; independent screenshot QR decoding additionally requires opencv-python.
"""
from __future__ import annotations
import argparse
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_support import ROOT, boot, login, overflow
p = argparse.ArgumentParser(); p.add_argument('--base-url', default='http://127.0.0.1:8080'); p.add_argument('--bridge', action='store_true'); p.add_argument('--chromium'); args = p.parse_args()
OUT = ROOT / 'test-results' / 'v0.3'; OUT.mkdir(parents=True, exist_ok=True)
errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, **({'executable_path': args.chromium} if args.chromium else {}))
    def page(width=1440):
        pg = browser.new_page(viewport={'width': width, 'height': 1000}); pg.set_default_timeout(15000)
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('dialog', lambda d: d.accept('Campus lunch' if d.type == 'prompt' else None))
        boot(pg, args.base_url, args.bridge); return pg
    try:
        student = page(); expect(student.locator('.bb-meal')).not_to_have_count(0)
        expect(student.locator('.bb-loads')).to_have_count(0)
        student.get_by_role('button', name='Availability', exact=True).click()
        expect(student.get_by_text('Online bookings, not the physical queue', exact=True)).to_be_visible()
        student.get_by_role('button', name='Explore', exact=True).click()
        expect(student.locator('.bb-loads')).to_have_count(0)
        student.screenshot(path=str(OUT / 'home-desktop.png'), full_page=True)
        for w in [360, 390, 768, 1440]: student.set_viewport_size({'width': w, 'height': 1000}); overflow(student)
        login(student, f'product-{uuid.uuid4().hex[:8]}@example.test', register=True)
        student.get_by_role('button', name='Favourite Golden chicken rice', exact=True).click()
        expect(student.get_by_role('button', name='Remove favourite Golden chicken rice', exact=True)).to_be_visible()
        student.get_by_role('button', name='Add Golden chicken rice', exact=True).click()
        student.get_by_role('button', name='Add Sparkling lemon', exact=True).click()
        student.get_by_role('button', name='Save basket as a usual order').click()
        expect(student.locator('#toast')).to_contain_text('saved')
        student.get_by_role('button', name='Saved', exact=True).click()
        expect(student.get_by_role('heading', name='Campus lunch', exact=True)).to_be_visible()
        student.get_by_role('button', name='Review basket').click()
        expect(student.locator('.bb-cart-group')).to_have_count(2)
        expect(student.locator('#basket')).to_contain_text('Nothing has been ordered')
        student.get_by_role('button', name='Choose pickup times', exact=True).click()
        expect(student.locator('#checkout-dialog')).to_be_visible()
        student.locator('select[name="slot:bowl-lab"]').select_option(index=8)
        student.locator('select[name="slot:noodle-co"]').select_option(index=10)
        student.get_by_role('button', name='Confirm all kitchen orders').click()
        expect(student.locator('.bb-order')).to_have_count(2)
        student.get_by_role('button', name='Need a faster option?', exact=True).first.click()
        expect(student.locator('#toast')).not_to_contain_text('Something went wrong')
        earlier = student.locator('[data-action=move-earlier]').first
        expect(earlier).to_be_visible(); earlier.click()
        expect(student.locator('#toast')).to_contain_text('Earlier slot reserved')
        student.locator('[data-action=qr]').first.click()
        expect(student.locator('#qr-dialog')).to_be_visible()
        student.locator('.bb-qr').screenshot(path=str(OUT / 'pickup-qr.png'))
        import cv2
        decoded, _, _ = cv2.QRCodeDetector().detectAndDecode(cv2.imread(str(OUT / 'pickup-qr.png')))
        assert decoded.startswith('BB1:'), 'Independent QR decode failed'
        student.screenshot(path=str(OUT / 'qr-dialog.png'), full_page=True)
        student.get_by_role('button', name='Close QR', exact=True).click()
        operator = page(); login(operator, 'operator.bowl@example.test')
        oid = decoded.split(':')[1]
        order = operator.locator('.bb-order').filter(has=operator.locator(f'[data-action=status][data-id="{oid}"]'))
        order.get_by_role('button', name='Start preparing', exact=True).click()
        operator.locator(f'[data-action=status][data-id="{oid}"][data-status=ready]').click()
        operator.get_by_role('button', name='Scan a pickup QR', exact=True).click()
        operator.locator('#scanner-input input').fill(decoded)
        operator.get_by_role('button', name='Find order', exact=True).click()
        expect(operator.locator('#scan-confirm')).to_be_visible()
        operator.locator('#scan-confirm input[type=checkbox]').check()
        operator.get_by_role('button', name='Confirm payment & handover', exact=True).click()
        expect(operator.locator('#toast')).to_contain_text('pickup completed')
        operator.get_by_role('button', name='Scan a pickup QR', exact=True).click()
        operator.locator('#scanner-input input').fill(decoded)
        operator.get_by_role('button', name='Find order', exact=True).click()
        expect(operator.locator('#toast')).to_contain_text('ready')
        operator.get_by_role('button', name='Close scanner', exact=True).click()
        student.locator('[data-view=inbox]').click()
        expect(student.locator('body')).to_contain_text('ready')
        student.get_by_role('button', name='Mark all read', exact=True).click()
        operator.get_by_role('button', name='Menu & stock', exact=True).click()
        operator.locator('[data-action=edit-item][data-id=chicken-rice]').click()
        operator.get_by_label('Ingredients', exact=True).fill('Chicken, rice, soy sauce and oil. Kitchen test fixture.')
        operator.locator('input[name=allergensKnown]').check(); operator.locator('input[name=allergens][value=soy]').check()
        operator.locator('input[name=mayContain][value=sesame]').check(); operator.locator('select[name=spice]').select_option('mild')
        operator.locator('input[name=foodConfirmed]').check(); operator.get_by_role('button', name='Save item', exact=True).click()
        expect(operator.locator('#menu-dialog')).to_have_count(0)
        operator.locator('[data-action=edit-item][data-id=chicken-rice]').click()
        operator.locator('#photo-form input[type=file]').set_input_files({'name':'test-pattern.png','mimeType':'image/png','buffer':(OUT/'pickup-qr.png').read_bytes()})
        operator.locator('#photo-form input[name=credit]').fill('Local automated test pattern; not a food photograph')
        operator.locator('#photo-form input[name=permission]').check(); operator.get_by_role('button', name='Save photograph', exact=True).click()
        expect(operator.locator('#toast')).to_contain_text('Photo saved')
        operator.get_by_role('button', name='Remove photograph', exact=True).click(); expect(operator.get_by_role('button', name='Remove photograph', exact=True)).to_have_count(0)
        operator.get_by_role('button', name='Close menu editor', exact=True).click()
        operator.get_by_role('button', name='Kitchen settings', exact=True).click()
        operator.locator('input[name=cutoffMinutes]').fill('2'); operator.locator('input[name=holdMinutes]').fill('20')
        operator.get_by_role('button', name='Save profile', exact=True).click(); expect(operator.locator('#toast')).to_contain_text('profile saved')
        student.get_by_role('button', name='My planner', exact=True).click()
        student.locator('input[name=avoid][value=soy]').check(); student.locator('input[name=hideUnsuitable]').check()
        student.get_by_role('button', name='Save food preferences', exact=True).click()
        student.get_by_role('button', name='Explore', exact=True).click(); expect(student.get_by_role('button', name='Add Golden chicken rice', exact=True)).to_have_count(0)
        student.get_by_role('button', name='My planner', exact=True).click(); student.locator('input[name=avoid][value=soy]').uncheck();student.locator('input[name=hideUnsuitable]').uncheck();student.get_by_role('button',name='Save food preferences',exact=True).click()
        now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
        start = now + timedelta(minutes=100); end = start + timedelta(hours=1)
        student.locator('#class-form input[name=title]').fill('Software Engineering')
        student.locator('#class-form input[name=startAt]').fill((start+timedelta(hours=8)).strftime('%Y-%m-%dT%H:%M'))
        student.locator('#class-form input[name=endAt]').fill((end+timedelta(hours=8)).strftime('%Y-%m-%dT%H:%M'))
        student.get_by_role('button', name='Add class', exact=True).click()
        expect(student.locator('.bb-class-row')).to_have_count(1)
        content = '\r\n'.join(['BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:browser-class','SUMMARY:Imported networks',f'DTSTART:{(start+timedelta(days=1)).strftime("%Y%m%dT%H%M%SZ")}',f'DTEND:{(end+timedelta(days=1)).strftime("%Y%m%dT%H%M%SZ")}', 'RRULE:FREQ=WEEKLY;COUNT=3','END:VEVENT','END:VCALENDAR'])
        student.locator('input[name=calendar]').set_input_files({'name':'timetable.ics','mimeType':'text/calendar','buffer':content.encode()})
        student.get_by_role('button', name='Preview import', exact=True).click()
        expect(student.locator('#confirm-ics-form input[name=classId]')).to_have_count(3)
        expect(student.locator('.bb-class-row')).to_have_count(1)
        student.get_by_role('button', name='Confirm selected classes', exact=True).click()
        expect(student.locator('.bb-class-row')).to_have_count(4)
        student.set_viewport_size({'width':390,'height':844});overflow(student);student.screenshot(path=str(OUT/'planner-mobile.png'),full_page=True)
        student.get_by_role('button', name='Fit a meal', exact=True).first.click();expect(student.locator('#fit-toggle')).to_be_checked()
        student.locator('[data-action=food-details][data-id=chicken-rice]').click();expect(student.locator('#food-dialog')).to_contain_text('soy');overflow(student)
        student.get_by_role('button',name='Close food details',exact=True).click()
        student.evaluate('window.scrollTo(0,0)');student.screenshot(path=str(OUT/'home-mobile.png'),full_page=True)
        operator.set_viewport_size({'width':390,'height':844});overflow(operator);operator.screenshot(path=str(OUT/'kitchen-mobile.png'),full_page=True)
        for w in [360,390,768,1440]:
            student.set_viewport_size({'width':w,'height':1000})
            for tab in ['Saved','My planner','Inbox','My orders','Explore']:
                student.locator('[data-view=inbox]').click() if tab=='Inbox' else student.get_by_role('button',name=tab,exact=True).click();overflow(student)
        assert not errors, errors
        # These images contain a test-only pickup credential. Never publish it as a live pickup credential.
        print(json.dumps({'result':'PASS','transport':'isolated renderer + real local API' if args.bridge else 'browser HTTP','checks':['favourites','usual multi-kitchen basket','fresh-slot repeat checkout','non-displacing earlier pickup','independent QR screenshot decode','merchant payment/QR handover','QR replay rejection','persisted inbox','food metadata editing','photo upload/remove','vendor policies','diet filters','manual timetable','ICS preview/confirm','optional break helper','360/390/768/1440 layouts','no uncaught JS errors'],'screenshots':str(OUT)},indent=2))
    except Exception:
        for index, context in enumerate(browser.contexts):
            for pg in context.pages:
                print('UI failure state:', pg.evaluate('window.__testView?.()'), 'Toast:', pg.locator('#toast').inner_text(), 'Errors:', errors)
                pg.screenshot(path=str(OUT / f'failure-{index}.png'), full_page=True)
        raise
    browser.close()
