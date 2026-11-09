"""Workspace/browser regressions, using public-market fixtures and no real orders."""
import functools,http.server,json,sys,threading,time
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'trading-dashboard/scripts'))
from ui_fixtures import install_market_fixtures
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def main():
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    results=[]
    def check(name,condition):
        if not condition:raise AssertionError(name)
        results.append(name);print('PASS '+name,flush=True)
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True)
            context=browser.new_context(viewport={'width':1450,'height':930},accept_downloads=True)
            controls=install_market_fixtures(context)
            page=context.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            base=f'http://127.0.0.1:{server.server_port}'
            page.goto(base+'/')
            check('Independent projects are listed at the workspace entrance',page.locator('a.card').count()==3)
            page.evaluate("localStorage.setItem('binance_signal_journal_v1','retired-test')")
            page.locator('a[href="trading-dashboard/"]').click()
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale === 'false'")
            check('Dashboard displays source age and effective interval','الفريم الفعلي' in page.locator('#dataHealth').inner_text())
            check('Successful analysis updates the status bar','تم التحديث' in page.locator('#stTxt').inner_text())
            check('Journal entry point has been removed',page.locator('a[href="journal.html"]').count()==0)
            check('Retired journal data is cleaned without new recording',page.evaluate("localStorage.getItem('binance_signal_journal_v1')")==None)
            context.set_offline(True)
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale === 'true'")
            check('Offline browser immediately marks the analysis as stale',page.locator('#sigTxt').get_attribute('data-stale')=='true')
            context.set_offline(False)
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale === 'false'")
            check('Analysis recovers when connectivity returns',True)

            controls['fail_klines']=True
            page.evaluate("""async()=>{const a=await import('./dashboard/api.js');const {state}=await import('./dashboard/state.js');for(const iv of ['1M','1w','1d','4h','1h','15m'])a.clearKlineCache(state.curSym,iv);} """)
            page.locator('#refBtn').click()
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale === 'true'",timeout=15000)
            check('HTTP failure marks prior analysis stale',True)
            controls['fail_klines']=False
            page.locator('#refBtn').click()
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale === 'false'")
            check('A subsequent successful request clears the stale state',True)

            controls['short_month']=True
            page.evaluate("""async()=>{const a=await import('./dashboard/api.js');a.clearKlineCache('BTCUSDT','1M');}""")
            page.locator('#ivTabs [data-iv="1M"]').click()
            page.wait_for_function("document.getElementById('dataHealth').textContent.includes('المطلوب')")
            actual=page.evaluate("async()=>{const {state}=await import('./dashboard/state.js');return state.effectiveIv;}")
            check('A short monthly history falls back with a visible explanation',actual=='1w')
            controls['short_month']=False
            page.evaluate("""async()=>{const a=await import('./dashboard/api.js');a.clearKlineCache('BTCUSDT','1M');}""")
            page.locator('#refBtn').click()
            page.wait_for_function("document.getElementById('dataHealth').dataset.stale==='false' && !document.getElementById('dataHealth').textContent.includes('المطلوب')")
            check('Returning to the original timeframe restores the correct stream',page.evaluate("async()=>{const {state}=await import('./dashboard/state.js');return state.effectiveIv;}")=='1M')

            page.goto(base+'/ATLASFLOW/tests.html')
            page.wait_for_function("document.getElementById('overall').dataset.completed==='true'")
            check('Atlas tests exercise the independent production modules',page.locator('.status-pass').count()==17 and page.locator('.status-fail').count()==0)
            page.goto(base+'/ATLASFLOW/')
            page.wait_for_selector('#chartAutoChecklist li',state='attached')
            check('Atlas production page loads with the shared indicator runtime',page.evaluate("typeof window.BinanceCore.ema === 'function'"))
            page.goto(base+'/data_pipeline/')
            check('Standalone pipeline uses its original candle profile',page.evaluate("globalThis.BinancePipelineProfile.limits[0]")==100)
            page.goto(base+'/trading-dashboard/#radarCard')
            check('Dashboard has one integrated radar card',page.locator('#radarCard').count()==1)
            check('Only one radar is rendered',page.locator('iframe[src*="radar/"]').count()==0)
            check('Integrated radar retains its extended candle profile',page.evaluate("globalThis.BinancePipelineProfile.limits[0]")==150)
            styles=page.evaluate("""()=>({nav:getComputedStyle(document.querySelector('.project-nav')).display,font:getComputedStyle(document.querySelector('.project-nav a')).fontSize,health:getComputedStyle(document.querySelector('.data-health')).fontSize})""")
            check('Navigation and data health styles apply on desktop',styles=={'nav':'flex','font':'13px','health':'12px'})
            page.set_viewport_size({'width':390,'height':844})
            mobile=page.evaluate("getComputedStyle(document.querySelector('.project-nav')).display")
            check('Navigation remains styled on mobile',mobile=='flex')
            if errors: print(json.dumps({'browser_errors':errors},ensure_ascii=True),flush=True)
            check('No uncaught browser errors across the projects',not errors)
            context.unroute_all(behavior="wait")
            browser.close()
        print(f'Workspace UI: {len(results)} passed',flush=True)
    finally:server.shutdown()
if __name__=='__main__':main()
