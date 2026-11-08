"""Local UI test harness. Bridge mode does not test TLS, browser networking or camera access."""
from __future__ import annotations
import http.cookiejar
import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from playwright.sync_api import expect
ROOT = Path(__file__).resolve().parents[1]
PASSWORD = 'Fixture-only-password-2026'

def bundle(entry='web/main.js'):
    """Bundle only our compiled static ES modules for an isolated renderer test."""
    modules = {}; chunks = []
    def visit(relative):
        path = (ROOT / 'dist' / relative).resolve()
        if not path.is_relative_to((ROOT / 'dist').resolve()):
            raise ValueError('Only this build is allowed')
        if path in modules: return modules[path]
        name = f'M{len(modules)}'; modules[path] = name
        source = path.read_text()
        pattern = re.compile(r'^import\s+\{([^}]+)\}\s+from\s+[\'\"]([^\'\"]+)[\'\"];\s*$', re.M)
        def imports(m):
            dep = visit((path.parent / m.group(2)).resolve().relative_to(ROOT / 'dist'))
            names = re.sub(r'\s+as\s+', ':', m.group(1))
            return f'const {{{names}}} = {dep};'
        source = pattern.sub(imports, source)
        exports = re.findall(r'^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)', source, re.M)
        source = source.replace('export ', '')
        if str(relative) == 'web/main.js': source += '\nwindow.__testView = () => ({view:s.view,busy:s.busy,editing:s.editing,actor:s.actor});'
        chunks.append(f'const {name} = (() => {{\n{source}\nreturn {{{",".join(exports)}}};\n}})();')
        return name
    visit(entry)
    return '\n'.join(chunks)

def boot(page, base_url, bridge=False):
    if not bridge:
        page.goto(base_url, wait_until='networkidle')
        return
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def backend(url, options=None):
        if not url.startswith('/api/') or '..' in url: raise ValueError('Only this local application API is allowed')
        o = options or {}
        req = urllib.request.Request(base_url.rstrip('/') + url,
            data=o['body'].encode() if o.get('body') is not None else None,
            headers={**o.get('headers', {}), 'Origin': base_url.rstrip('/')}, method=o.get('method', 'GET'))
        try:
            with opener.open(req, timeout=15) as r: return {'status': r.status, 'body': r.read().decode(), 'headers': dict(r.headers)}
        except urllib.error.HTTPError as e: return {'status': e.code, 'body': e.read().decode(), 'headers': dict(e.headers)}
    page.expose_function('__localBackend', backend)
    page.set_content('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><a class="skip-link" href="#main">Skip to content</a><div id="app"></div><div id="toast" role="status" aria-live="polite"></div></body></html>')
    for file in ['styles.css', 'product.css']: page.add_style_tag(content=(ROOT / 'src/web' / file).read_text())
    page.evaluate('''() => { const values = new Map(); Object.defineProperty(window,'sessionStorage',{value:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}}); window.fetch=async(url,options={})=>{const r=await window.__localBackend(String(url),{method:options.method||'GET',headers:options.headers||{},body:options.body});return new Response(r.body,{status:r.status,headers:r.headers});}; }''')
    page.add_script_tag(content=bundle())

def login(page, email, password=PASSWORD, register=False):
    page.get_by_role('button', name='Sign in', exact=True).click()
    if register:
        page.get_by_role('button', name='New here? Create an account').click()
        page.get_by_label('Your name', exact=True).fill('Review Student')
    page.get_by_label('Email', exact=True).fill(email)
    page.get_by_label('Password', exact=True).fill(password)
    page.locator('#auth-form button[type=submit]').click()
    expect(page.locator('#auth-dialog')).to_have_count(0)

def overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Horizontal overflow'
