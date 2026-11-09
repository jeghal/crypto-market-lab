import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { getCandles, getTopGainers } from '../dashboard/api.js';
import { buildSignal } from '../dashboard/signal.js';
import { atr } from '../dashboard/indicators.js';
import { createRunController } from '../dashboard/run-controller.js';

const projectRoot = new URL('../../', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, projectRoot), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

export async function runRegressionTests() {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalStorage = globalThis.localStorage;
  const originalConsoleError = console.error;
  const unhandled = [];
  const onUnhandled = error => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  let passed = 0;
  async function check(name, fn) {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  }
  try {
    await check('ATR uses chart OHLC instead of another timeframe', async () => {
      globalThis.fetch = async url => {
        const u = new URL(url);
        if (u.pathname.endsWith('bookTicker')) return { ok: true, json: async () => ({ bidPrice: '100', askPrice: '100.01' }) };
        const range = u.searchParams.get('interval') === '1d' ? 10 : 0.2;
        return { ok: true, json: async () => Array.from({ length: 260 }, (_, i) => [i * 60000, 100, 100 + range, 100 - range, 100, 100]) };
      };
      const result = await buildSignal('REGATRUSDT', '1d', 50);
      assert.equal(result.atrV, atr(result.candles).at(-1));
      assert.equal(result.atrV, 20);
      const shortView = await buildSignal('REGATRUSDT', '1d', 10);
      assert.equal(shortView.candles.length, 10);
      assert.equal(shortView.atrV, 20, 'A small visible window must retain ATR warmup');
    });

    await check('Expired candle and ticker caches cannot hide a network outage', async () => {
      let clock = originalNow();
      Date.now = () => clock;
      globalThis.fetch = async url => ({ ok: true, json: async () => new URL(url).pathname.endsWith('/klines')
        ? [[0, 100, 101, 99, 100, 10], [300000, 100, 101, 99, 100, 10]]
        : [{ symbol: 'REGCACHEUSDT', quoteVolume: '1000000000', priceChangePercent: '5' }] });
      await getCandles('REGCACHEUSDT', '5m', 2);
      await getTopGainers(1);
      clock += 86400000;
      globalThis.fetch = async () => { throw new Error('offline'); };
      await assert.rejects(getCandles('REGCACHEUSDT', '5m', 2), /offline/);
      await assert.rejects(getTopGainers(1), /offline/);
      Date.now = originalNow;
    });

    await check('Handled and cancelled candle failures create no unhandled rejection', async () => {
      globalThis.fetch = async () => { throw new Error('offline'); };
      await assert.rejects(getCandles('REGFAILUSDT', '5m', 2), /offline/);
      const controller = new AbortController();
      globalThis.fetch = (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      const pending = getCandles('REGABORTUSDT', '5m', 2, controller.signal);
      controller.abort();
      await assert.rejects(pending, { name: 'AbortError' });
      await tick();
      assert.deepEqual(unhandled, []);
    });

    await check('Analysis shortage is reported accurately without changing chart timeframe', async () => {
      const attempted = [];
      const el = { sigTxt: {}, sigSub: {} };
      const state = { curSym: 'TESTUSDT', curIv: '1M', activeRunId: 0, candleLimit: 50 };
      console.error = () => {};
      await createRunController({ state, el, wsManager: {}, getPrices: async () => ({}), buildSignal: async (s, iv) => {
        attempted.push(iv);
        const error = new Error('بيانات غير كافية للتحليل: 4h (10/50)');
        error.code = 'INSUFFICIENT_ANALYSIS_DATA';
        throw error;
      } }).run();
      console.error = originalConsoleError;
      assert.deepEqual(attempted, ['1M']);
      assert.match(el.sigTxt.textContent, /لا توجد بيانات كافية/);
    });

    await check('Chart fallback recovers without mixing frames or retaining the fallback socket', async () => {
      const state = { curSym: 'TESTUSDT', curIv: '1M', activeRunId: 0, candleLimit: 10, chartCandles: [], prices: {} };
      let recovering = false;
      const connections = [];
      const controller = createRunController({ state, el: {}, wsManager: { reconnect: (s, iv) => connections.push(iv) },
        getPrices: async () => ({}), clearChartState: () => { state.chartCandles = []; },
        buildSignal: async (s, iv) => {
          if (!recovering && iv === '1M') {
            const error = new Error('بيانات غير كافية للتحليل');
            error.code = 'INSUFFICIENT_CHART_DATA';
            throw error;
          }
          return { candles: [{ t: iv === '1M' ? Date.UTC(2026, 10, 1) : Date.UTC(2026, 9, 26), o: 100, h: 101, l: 99, c: 100, v: 10 }] };
        } });
      await controller.run();
      recovering = true;
      await controller.run();
      assert.deepEqual(connections, ['1w', '1M']);
      assert.equal(state.chartCandles.length, 1);
      assert.equal(state.chartCandles[0].t, Date.UTC(2026, 10, 1));
    });

    await check('Real buildSignal emits distinct chart and analysis shortage codes', async () => {
      let shortage = 'chart';
      globalThis.fetch = async url => {
        const u = new URL(url);
        if (u.pathname.endsWith('bookTicker')) return { ok: true, json: async () => ({ bidPrice: '100', askPrice: '100.01' }) };
        const interval = u.searchParams.get('interval');
        const length = (shortage === 'chart' && interval === '1M') || (shortage === 'analysis' && interval === '4h') ? 5 : 260;
        return { ok: true, json: async () => Array.from({ length }, (_, i) => [i * 60000, 100, 101, 99, 100, 10]) };
      };
      await assert.rejects(buildSignal('REGSHORTCHARTUSDT', '1M', 50), { code: 'INSUFFICIENT_CHART_DATA' });
      shortage = 'analysis';
      await assert.rejects(buildSignal('REGSHORTANALYSISUSDT', '1d', 50), { code: 'INSUFFICIENT_ANALYSIS_DATA' });
    });

    await check('ATLASFLOW cancelled requests cannot clear or overwrite the active request', async () => {
      const pending = [];
      const context = vm.createContext({ window: {}, console, AbortController, URLSearchParams, Date, Number, Object, Array,
        fetch: (url, { signal }) => new Promise((resolve, reject) => {
          pending.push({ resolve, signal });
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        }) });
      vm.runInContext(read('ATLASFLOW/js/chart/data.js'), context);
      const S = { symbol: 'BTCUSDT', interval: '1h', candles: [], mtf: {}, limit: 100 };
      const options = { S, isValidSymbol: () => true, disconnectWsFn() {}, draw() {}, emitAssistantSnapshotFn() {},
        normalizeIntervalLabel: x => x, toApiInterval: x => x, toCandleRow: x => x,
        recompute() {}, connectWsFn() {}, buildFrameSnapshot: () => ({}), refreshMtfSnapshotsFn() {}, spanIndicator: {} };
      const fetchCandles = () => context.window.CreptoChart.fetchCandles(options);
      const a = fetchCandles();
      const b = fetchCandles();
      const activeB = S.aborter;
      await a;
      assert.equal(S.aborter, activeB);
      assert.equal(S.fetching, true);
      const c = fetchCandles();
      assert.equal(pending[1].signal.aborted, true);
      await b;
      pending[2].resolve({ ok: true, json: async () => [{ c: 200 }] });
      await c;
      assert.equal(S.candles[0].c, 200);
      assert.equal(S.fetching, false);
      assert.equal(S.aborter, null);

      // A transport can finish even after abort; ownership must still reject its result.
      const delayed = [];
      context.fetch = () => new Promise(resolve => delayed.push(resolve));
      const old = fetchCandles();
      const newest = fetchCandles();
      delayed[1]({ ok: true, json: async () => [{ c: 300 }] });
      await newest;
      delayed[0]({ ok: true, json: async () => [{ c: 100 }] });
      await old;
      assert.equal(S.candles[0].c, 300);
    });

    for (const project of ['data_pipeline', 'trading-dashboard/radar']) {
      await check(`${project}: notional uses rounded order price and quantity`, () => {
        const context = vm.createContext({});
        vm.runInContext(read(`${project}/assets/js/market-core.js`), context);
        vm.runInContext(read(`${project}/assets/js/transforms.js`), context);
        const result = vm.runInContext('buildExecutionCheck("TESTUSDT", "2026-11-09", 10.09, {tickSize:"1",stepSize:"1",minQty:"1",maxQty:"100",minNotional:"90.5"})', context);
        assert.equal(result.estimated_notional, 90);
        assert.equal(result.checks.passes_min_notional, false);
        assert.equal(result.status, 'invalid_at_reference_price');
        const valid = vm.runInContext('buildExecutionCheck("TESTUSDT", "2026-11-09", 10, {tickSize:"1",stepSize:"1",minQty:"1",maxQty:"100",minNotional:"90.5"})', context);
        assert.equal(valid.status, 'valid_at_reference_price');
      });
      await check(`${project}: 429 retries recover or reject with status and retry delay`, async () => {
        let calls = 0;
        const waits = [];
        const context = vm.createContext({ AbortController, DOMException, clearTimeout, setTimeout: (fn,ms) => { if(ms<12000){waits.push(ms); return setTimeout(fn,0);} return setTimeout(fn,ms); }, fetch: async () => {
          calls++;
          return { ok: false, status: 429, headers: { get: () => '2' } };
        }, sleep: async ms => waits.push(ms), appendStatus() {} });
        vm.runInContext(read(`${project}/assets/js/market-core.js`), context);
        vm.runInContext(read(`${project}/assets/js/api.js`), context);
        await assert.rejects(vm.runInContext('fetchJson("mock")', context), error => error.status === 429 && error.retryAfterMs === 2000);
        assert.equal(calls, 3);
        assert.deepEqual(waits, [2000, 2000]);
        calls = 0;
        context.fetch = async () => ++calls === 1
          ? { ok: false, status: 429, headers: { get: () => 'invalid' } }
          : { ok: true, json: async () => ({ recovered: true }) };
        const recovered = await vm.runInContext('fetchJson("mock")', context);
        assert.equal(recovered.recovered, true);
        assert.equal(calls, 2);
        assert.ok(Number.isFinite(waits.at(-1)));
      });
    }
    await tick();
    assert.deepEqual(unhandled, []);
    console.log(`Regression tests: ${passed} passed`);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    globalThis.localStorage = originalStorage;
    console.error = originalConsoleError;
    process.removeListener('unhandledRejection', onUnhandled);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runRegressionTests();
}
