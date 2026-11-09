#!/usr/bin/env python
from __future__ import annotations

import contextlib
import os
import http.server
import re
import socketserver
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

from playwright.sync_api import Download, Page, TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"


@dataclass
class TestResult:
    status: str
    name: str
    details: str = ""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


@contextlib.contextmanager
def local_server(root: Path):
    handler = lambda *a, **kw: QuietHandler(*a, directory=str(root), **kw)  # noqa: E731
    with ThreadingTCPServer((HOST, 0), handler) as server:
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://{HOST}:{port}/index.html"
        finally:
            server.shutdown()
            thread.join(timeout=2)


def run_tests() -> int:
    results: list[TestResult] = []
    dash = "\u2014"

    def ok(name: str, details: str = ""):
        results.append(TestResult("PASS", name, details))

    def fail(name: str, details: str = ""):
        results.append(TestResult("FAIL", name, details))

    def verify(condition: bool, name: str, details: str = ""):
        if condition:
            ok(name, details)
        else:
            fail(name, details)

    def is_placeholder(text: str) -> bool:
        normalized = (text or "").strip()
        return normalized in {"", "-", dash}

    with local_server(ROOT) as url:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1450, "height": 930}, accept_downloads=True)
            if os.environ.get('LIVE_BINANCE') != '1':
                from ui_fixtures import install_market_fixtures
                install_market_fixtures(context)
            page = context.new_page()
            page_errors: list[str] = []
            console_errors: list[str] = []
            page.on("pageerror", lambda e: page_errors.append(str(e)))
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

            # 1) Boot + core visibility
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=35000)
                ok("Page loads", url)
            except Exception as exc:
                fail("Page loads", str(exc))
                _print_report(results)
                return 1

            for sel, name in [
                ("#symTabs", "Symbol tabs visible"),
                ("#ivTabs", "Interval tabs visible"),
                ("#cv", "Chart canvas visible"),
                ("#sigTxt", "Signal card visible"),
                ("#screenerBody", "Screener table visible"),
                ("#tcRR", "Trade calculator visible"),
                ("#proDecisionBtn", "Professional decision button visible"),
            ]:
                try:
                    page.wait_for_selector(sel, state="visible", timeout=12000)
                    ok(name)
                except PlaywrightTimeoutError as exc:
                    fail(name, str(exc))

            # 2) Wait for first live analysis result
            try:
                page.wait_for_function(
                    """() => {
                        const t = document.querySelector('#sigTxt')?.textContent?.trim() || '';
                        return t && !t.includes('جار') && !t.includes('تحليل');
                    }""",
                    timeout=60000,
                )
                sig = page.locator("#sigTxt").inner_text().strip()
                ok("Signal analysis updated", sig)
            except PlaywrightTimeoutError:
                fail("Signal analysis updated", "Timed out waiting for analyzed signal text")

            # Price chips update (at least one non-dash)
            try:
                page.wait_for_function(
                    """() => Array.from(document.querySelectorAll('.sp'))
                        .some((n) => (n.textContent || '').trim() !== '—')""",
                    timeout=45000,
                )
                ok("Header price chips updated")
            except PlaywrightTimeoutError:
                fail("Header price chips updated", "No price chip updated from dash")

            try:
                cond_score = page.locator("#condScore").inner_text().strip()
                score_match = re.search(r"(\d+)\s*/\s*(\d+)", cond_score)
                verify(bool(score_match), "Condition score format valid", cond_score)

                cond_done = None
                if score_match:
                    cond_done = int(score_match.group(1))
                    cond_total = int(score_match.group(2))
                    verify(0 <= cond_done <= cond_total <= 8, "Condition score range valid", cond_score)

                cond_badges = page.locator(".clist .cbadge")
                verify(cond_badges.count() == 8, "Condition badges count = 8")
                badge_texts = [cond_badges.nth(i).inner_text().strip() for i in range(cond_badges.count())]
                verify(all(not is_placeholder(t) for t in badge_texts), "Condition badges populated")

                sig_pills = page.locator("#sigPills .pill")
                ok_count = page.locator("#sigPills .pill.ok").count()
                verify(sig_pills.count() == 8, "Signal pills count = 8")
                if cond_done is not None:
                    verify(ok_count == cond_done, "Signal ok-pill count matches score", f"ok={ok_count}, score={cond_done}")

                mtf_rows = page.locator("#mtfBody tr")
                verify(mtf_rows.count() == 4, "MTF table row count = 4")
                mtf_tfs = [mtf_rows.nth(i).locator("td").first.inner_text().strip() for i in range(mtf_rows.count())]
                mtf_aliases = {
                    "15د": "15m",
                    "1س": "1h",
                    "4س": "4h",
                    "1ي": "1d",
                    "1ج": "1d",
                }
                mtf_norm = [mtf_aliases.get(t, t.lower()) for t in mtf_tfs]
                verify(
                    len(mtf_norm) == 4
                    and mtf_norm[0] == "15m"
                    and mtf_norm[1] == "1h"
                    and mtf_norm[2] == "4h"
                    and mtf_norm[3] == "1d",
                    "MTF table order valid",
                    ",".join(mtf_tfs),
                )

                for rid in [
                    "tpV", "slV", "rrV", "atrVal", "rvolVal", "mDir", "mM", "mS", "mH",
                    "stochK", "stochD", "scenarioStatus", "scenarioBias",
                ]:
                    val = page.locator(f"#{rid}").inner_text().strip()
                    verify(not is_placeholder(val), f"{rid} populated", val)

                r_values = [page.locator(f"#srR{i}").inner_text().strip() for i in range(1, 5)]
                s_values = [page.locator(f"#srS{i}").inner_text().strip() for i in range(1, 5)]
                verify(any(not is_placeholder(v) for v in r_values), "At least one resistance level populated")
                verify(any(not is_placeholder(v) for v in s_values), "At least one support level populated")

                sig_sub = page.locator("#sigSub").inner_text().strip()
                sub_match = re.search(r"(\d+)\s*/\s*8", sig_sub)
                verify(bool(sub_match), "Signal subtitle score format valid", sig_sub)
                if cond_done is not None and sub_match:
                    verify(
                        int(sub_match.group(1)) == cond_done,
                        "Signal subtitle score matches condScore",
                        sig_sub,
                    )
            except Exception as exc:
                fail("Core card values consistency", str(exc))

            # 3) Chart control toggles
            toggle_ids = [
                "togEMA", "togVol", "togGrid", "togSR", "togTL",
                "togFib", "togBB", "togVP", "togTrade", "togTradeZones",
            ]
            for tid in toggle_ids:
                btn = page.locator(f"#{tid}")
                try:
                    def is_on() -> bool:
                        return "on" in (btn.get_attribute("class") or "")

                    def set_on_state(expected_on: bool) -> bool:
                        for _ in range(3):
                            if is_on() == expected_on:
                                return True
                            try:
                                btn.click(timeout=5000)
                            except Exception:
                                page.wait_for_timeout(120)
                                btn.click(timeout=5000, force=True)
                            page.wait_for_timeout(120)
                        return is_on() == expected_on

                    initial_on = is_on()
                    verify(set_on_state(not initial_on), f"Toggle flips ({tid})")
                    verify(set_on_state(initial_on), f"Toggle restores ({tid})")
                except Exception as exc:
                    fail(f"Toggle interaction ({tid})", str(exc))

            # Add a manual level button should be clickable without errors
            try:
                page.click("#btnAddLevel", timeout=5000)
                ok("Add manual level button clickable")
            except Exception as exc:
                fail("Add manual level button clickable", str(exc))

            # 4) Intervals + candle count + symbol switching
            try:
                tabs = page.locator("#ivTabs .itab")
                count = tabs.count()
                for i in range(count):
                    tabs.nth(i).click(timeout=6000)
                    verify("active" in (tabs.nth(i).get_attribute("class") or ""), f"Interval activates (idx={i})")
                ok("All interval tabs clickable")
            except Exception as exc:
                fail("All interval tabs clickable", str(exc))

            try:
                options = page.locator("#candleCount option")
                values = [options.nth(i).get_attribute("value") for i in range(options.count())]
                for v in values[-2:]:
                    if not v:
                        continue
                    page.select_option("#candleCount", v)
                    selected = page.locator("#candleCount").input_value()
                    verify(selected == v, f"Candle count change ({v})")
                ok("Candle count selector works")
            except Exception as exc:
                fail("Candle count selector works", str(exc))

            try:
                page.select_option("#chartSymbolSelect", "ETHUSDT")
                page.wait_for_function(
                    "() => document.querySelector('.stab.active')?.getAttribute('data-sym') === 'ETHUSDT'",
                    timeout=30000,
                )
                ok("Chart symbol select switches to ETH")
                page.click('.stab[data-sym="BTCUSDT"]')
                page.wait_for_function(
                    "() => document.querySelector('.stab.active')?.getAttribute('data-sym') === 'BTCUSDT'",
                    timeout=30000,
                )
                ok("Symbol tab switches back to BTC")
            except Exception as exc:
                fail("Symbol switching", str(exc))

            # 5) Screener modes + sorting + row navigation
            try:
                page.click("#screenerTopBtn")
                verify("active" in (page.locator("#screenerTopBtn").get_attribute("class") or ""), "Screener top mode active")
                page.wait_for_selector("#screenerBody tr", timeout=45000)
                ok("Top screener renders")
            except Exception as exc:
                fail("Top screener mode", str(exc))

            try:
                page.click("#screenerBreakBtn")
                verify("active" in (page.locator("#screenerBreakBtn").get_attribute("class") or ""), "Screener breakout mode active")
                page.wait_for_timeout(900)
                ok("Breakout screener triggers")
            except Exception as exc:
                fail("Breakout screener mode", str(exc))

            try:
                page.click("#screenerCoilBtn")
                page.wait_for_timeout(1200)
                coil_display = page.locator("#coilTable").evaluate("e => getComputedStyle(e).display")
                scr_display = page.locator("#screenerTable").evaluate("e => getComputedStyle(e).display")
                verify(coil_display != "none" and scr_display == "none", "Coil table visibility toggled")
                ok("Coil screener mode toggles tables")
            except Exception as exc:
                fail("Coil screener mode", str(exc))

            try:
                page.click("#screenerScanBtn")
                page.wait_for_timeout(1200)
                coil_display = page.locator("#coilTable").evaluate("e => getComputedStyle(e).display")
                scr_display = page.locator("#screenerTable").evaluate("e => getComputedStyle(e).display")
                verify(scr_display != "none" and coil_display == "none", "Default screener table visibility toggled")
                ok("Default screener mode toggles tables")
            except Exception as exc:
                fail("Default screener mode", str(exc))

            try:
                page.click("#screenerMomentumBtn")
                verify("active" in (page.locator("#screenerMomentumBtn").get_attribute("class") or ""), "Momentum screener mode active")
                page.wait_for_selector("#screenerBody tr", timeout=45000)
                coil_display = page.locator("#coilTable").evaluate("e => getComputedStyle(e).display")
                scr_display = page.locator("#screenerTable").evaluate("e => getComputedStyle(e).display")
                verify(scr_display != "none" and coil_display == "none", "Momentum uses standard screener table")
                ok("Momentum screener renders in main table")

                page.click("#screenerScanBtn")
                page.wait_for_timeout(1200)
            except Exception as exc:
                fail("Momentum screener mode", str(exc))

            try:
                # Sort by price twice and ensure arrow appears
                page.click('#screenerTable thead th[data-sort="price"]')
                page.wait_for_timeout(250)
                t1 = page.locator('#screenerTable thead th[data-sort="price"]').inner_text().strip()
                page.click('#screenerTable thead th[data-sort="price"]')
                page.wait_for_timeout(250)
                t2 = page.locator('#screenerTable thead th[data-sort="price"]').inner_text().strip()
                verify(("↑" in t1 or "↓" in t1) and ("↑" in t2 or "↓" in t2), "Screener sort arrow appears")
                ok("Screener sorting clickable")
            except Exception as exc:
                fail("Screener sorting clickable", str(exc))

            try:
                row = page.locator("#screenerBody tr.scr-row").first
                if row.count() > 0:
                    sym = row.get_attribute("data-sym") or ""
                    row.click(timeout=6000)
                    if sym:
                        page.wait_for_function(
                            "(s) => document.querySelector('.stab.active')?.getAttribute('data-sym') === s",
                            arg=sym,
                            timeout=35000,
                        )
                    ok("Screener row click switches active symbol", sym)
                else:
                    fail("Screener row click switches active symbol", "No screener rows")
            except Exception as exc:
                fail("Screener row click switches active symbol", str(exc))

            # 6) Watchlist add/remove
            try:
                page.fill("#wlInput", "ADAUSDT")
                page.keyboard.press("Enter")
                page.wait_for_function(
                    "() => !!document.querySelector('#watchlistTabs .stab[data-sym=\"ADAUSDT\"]')",
                    timeout=10000,
                )
                ok("Watchlist add symbol")
                page.click('#watchlistTabs .wl-remove[data-sym="ADAUSDT"]')
                page.wait_for_function(
                    "() => !document.querySelector('#watchlistTabs .stab[data-sym=\"ADAUSDT\"]')",
                    timeout=10000,
                )
                ok("Watchlist remove symbol")
            except Exception as exc:
                fail("Watchlist add/remove", str(exc))

            # 7) Trade calculator full interactions
            try:
                page.fill("#tcAmount", "100")
                page.fill("#tcEntry", "70000")
                page.fill("#tcTarget", "73500")
                page.fill("#tcStop", "68600")
                page.fill("#tcBuyFee", "0.1")
                page.fill("#tcSellFee", "0.1")
                page.wait_for_timeout(350)

                rr = page.locator("#tcRR").inner_text().strip()
                verify(rr != "—" and "1 :" in rr, "Trade calculator RR computed", rr)

                # TP/SL quick buttons
                page.click('#tcTpBtns button[data-tp="5"]')
                page.wait_for_timeout(200)
                target = float(page.locator("#tcTarget").input_value())
                entry = float(page.locator("#tcEntry").input_value())
                verify(target > entry, "TP quick button sets higher target")

                page.click('#tcSlBtns button[data-sl="3"]')
                page.wait_for_timeout(200)
                stop = float(page.locator("#tcStop").input_value())
                verify(stop < entry, "SL quick button sets lower stop")

                # Trigger warning states
                page.fill("#tcTrigger", str(stop - 10))
                page.wait_for_timeout(250)
                warn_cls = page.locator("#tcTriggerWarn").get_attribute("class") or ""
                verify("warn-error" in warn_cls or "warn-caution" in warn_cls, "Trigger warning for invalid trigger")

                page.fill("#tcTrigger", str(round(stop * 1.002, 4)))
                page.wait_for_timeout(250)
                warn_cls = page.locator("#tcTriggerWarn").get_attribute("class") or ""
                verify("warn-ok" in warn_cls, "Trigger warning OK for valid trigger")

                # BEP controls
                bep_text = page.locator("#tcBEPPrice").inner_text().strip()
                verify(bep_text != "—", "Breakeven computed")
                if page.locator("#tcBreakevenBtn").count():
                    page.click("#tcBreakevenBtn")
                    page.wait_for_timeout(200)
                    verify(page.locator("#tcStop").input_value().strip() != "", "BEP button applies stop")
                if page.locator("#tcBepApply").is_visible():
                    page.click("#tcBepApply")
                    page.wait_for_timeout(200)
                    verify(page.locator("#tcStop").input_value().strip() != "", "BEP apply button applies stop")

                # Fill from signal should populate fields
                page.click("#tcFillBtn")
                page.wait_for_timeout(500)
                verify(page.locator("#tcEntry").input_value().strip() != "", "Auto fill updates entry")
                verify(page.locator("#tcTarget").input_value().strip() != "", "Auto fill updates target")
                verify(page.locator("#tcStop").input_value().strip() != "", "Auto fill updates stop")

                # Live price button should cycle state and re-enable
                page.click("#tcLiveBtn")
                page.wait_for_function(
                    "() => document.querySelector('#tcLiveBtn') && !document.querySelector('#tcLiveBtn').disabled",
                    timeout=7000,
                )
                verify(page.locator("#tcLiveBtn").is_enabled(), "Live price button re-enabled")

                ok("Trade calculator advanced interactions")
            except Exception as exc:
                fail("Trade calculator advanced interactions", str(exc))

            # 9) Professional decision output
            try:
                prev_text = page.locator("#proDecisionOutput").inner_text().strip()
                page.click("#proDecisionBtn")
                page.wait_for_function(
                    """(prev) => {
                        const txt = document.querySelector('#proDecisionOutput')?.textContent?.trim() || '';
                        if (!txt || txt === prev) return false;
                        return !txt.includes('جارٍ');
                    }""",
                    arg=prev_text,
                    timeout=90000,
                )
                out = page.locator("#proDecisionOutput").inner_text().strip()
                verify(out != prev_text and len(out) > 8, "Professional decision output updated")
                ok("Professional decision flow")
            except Exception as exc:
                fail("Professional decision flow", str(exc))

            # 10) Capture download
            try:
                with page.expect_download(timeout=15000) as dl_info:
                    page.click("#btnCapture")
                png = dl_info.value.suggested_filename
                verify(png.lower().endswith(".png"), "Capture button download", png)
                ok("Capture button works")
            except Exception as exc:
                fail("Capture button works", str(exc))

            # 11) Footer/status/sentiment sanity
            try:
                st_txt = page.locator("#stTxt").inner_text().strip()
                verify(st_txt != "", "Status text present", st_txt)
                ok("Status bar populated")
            except Exception as exc:
                fail("Status bar populated", str(exc))

            try:
                page.wait_for_function(
                    """() => {
                        const v = (document.querySelector('#fngValue')?.textContent || '').trim();
                        const d = (document.querySelector('#domPct')?.textContent || '').trim();
                        return v && v !== '—' && d && d !== '—';
                    }""",
                    timeout=45000,
                )
                ok("Sentiment cards populated")
            except Exception as exc:
                fail("Sentiment cards populated", str(exc))

            # runtime error review
            if page_errors:
                fail("No page runtime errors", f"{len(page_errors)} page errors. First: {page_errors[0][:200]}")
            else:
                ok("No page runtime errors")

            # Keep console errors only if they are not benign extension/noise
            filtered_console_errors = [
                e for e in console_errors
                if "favicon" not in e.lower()
                and "websocket connection to" not in e.lower()
                and "ping receive" not in e.lower()
            ]
            if filtered_console_errors:
                fail("No console errors", f"{len(filtered_console_errors)} console errors. First: {filtered_console_errors[0][:200]}")
            else:
                ok("No console errors")

            context.close()
            browser.close()

    return _print_report(results)


def _print_report(results: list[TestResult]) -> int:
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass

    def safe_print(text: str):
        try:
            print(text)
        except UnicodeEncodeError:
            enc = sys.stdout.encoding or "utf-8"
            print(text.encode(enc, errors="replace").decode(enc, errors="replace"))

    passed = sum(1 for r in results if r.status == "PASS")
    failed = [r for r in results if r.status == "FAIL"]

    safe_print("")
    safe_print("=== UI E2E Summary ===")
    safe_print(f"Total: {len(results)}")
    safe_print(f"Passed: {passed}")
    safe_print(f"Failed: {len(failed)}")
    safe_print("")

    for r in results:
        prefix = "[PASS]" if r.status == "PASS" else "[FAIL]"
        safe_print(f"{prefix} {r.name}{' -> ' + r.details if r.details else ''}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(run_tests())
