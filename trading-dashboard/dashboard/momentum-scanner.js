import { api } from './api.js';
import { DATA_API_BASE } from './config.js';
import { state } from './state.js';

const REQUEST_TIMEOUT_MS = 12000;
const REQUEST_RETRIES = 3;
const MOMENTUM_INTERVAL = '5m';
const MAX_SCAN_SYMBOLS = 80;

function safeFloat(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

function mean(arr) {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

async function fetchJson(path, params = {}, signal) {
    return api(path, params, {
        baseUrl: DATA_API_BASE,
        signal,
        timeoutMs: REQUEST_TIMEOUT_MS,
        retries: Math.max(0, REQUEST_RETRIES - 1),
        retryDelayMs: 1200,
        headers: { Accept: "application/json" },
    });
}

const PRESETS = {
    conservative: { min24hQuoteVolume: 2000000, maxSpreadPct: 0.5, candleChangePctMin: 1.0, rangePctMin: 1.5, volumeLookback: 10, volumeRatioMin: 1.5, breakoutLookback: 8, maxCloseFromHighPct: 1.0, minBodyToRangeRatio: 0.3 },
    balanced: { min24hQuoteVolume: 500000, maxSpreadPct: 1.0, candleChangePctMin: 0.6, rangePctMin: 0.8, volumeLookback: 10, volumeRatioMin: 1.1, breakoutLookback: 5, maxCloseFromHighPct: 1.5, minBodyToRangeRatio: 0.2 },
    aggressive: { min24hQuoteVolume: 100000, maxSpreadPct: 1.5, candleChangePctMin: 0.3, rangePctMin: 0.4, volumeLookback: 10, volumeRatioMin: 0.8, breakoutLookback: 3, maxCloseFromHighPct: 2.5, minBodyToRangeRatio: 0.1 },
};

function getSettings() {
    const preset = PRESETS.balanced;

    return {
        interval: MOMENTUM_INTERVAL,
        quoteAsset: "USDT",
        topN: 5,
        ...preset,
        maxWorkers: 10,
    };
}

async function getSpotQuoteSymbols(s, signal) {
    const data = await fetchJson("/api/v3/exchangeInfo", { permissions: "SPOT", symbolStatus: "TRADING", showPermissionSets: "false" }, signal);
    const out = [];
    const leveraged = ["UP", "DOWN", "BULL", "BEAR"];
    for (const info of data.symbols || []) {
        if (info.quoteAsset !== s.quoteAsset || info.status !== "TRADING" || !info.isSpotTradingAllowed) continue;
        if (leveraged.some(x => (info.baseAsset || "").endsWith(x))) continue;
        out.push(info.symbol);
    }
    return out.sort();
}

async function scanCoins(externalSignal) {
    state.scanner.abortController?.abort();
    const controller = new AbortController();
    state.scanner.abortController = controller;
    const abortCurrent = () => controller.abort();
    externalSignal?.addEventListener?.('abort', abortCurrent, { once: true });

    try {
        const s = getSettings();
        const symbols = await getSpotQuoteSymbols(s, controller.signal);

        const stats = await fetchJson("/api/v3/ticker/24hr", { symbolStatus: "TRADING" }, controller.signal);
        const statMap = new Map();
        for (const i of stats) statMap.set(i.symbol, i);

        const liquid = symbols.filter(sym => {
            const st = statMap.get(sym);
            return st && safeFloat(st.quoteVolume) >= s.min24hQuoteVolume;
        });

        const books = await fetchJson("/api/v3/ticker/bookTicker", { symbolStatus: "TRADING" }, controller.signal);
        const bookMap = new Map();
        for (const i of books) bookMap.set(i.symbol, i);

        const tradable = [];
        for (const sym of liquid) {
            const item = bookMap.get(sym);
            if (!item) continue;
            const bid = safeFloat(item.bidPrice);
            const ask = safeFloat(item.askPrice);
            if (bid <= 0 || ask <= 0 || ask <= bid) continue;
            const spreadPct = ((ask - bid) / ask) * 100;
            if (spreadPct <= s.maxSpreadPct) {
                tradable.push(sym);
            }
        }
        const scanUniverse = tradable
            .sort((a, b) => safeFloat(statMap.get(b)?.quoteVolume) - safeFloat(statMap.get(a)?.quoteVolume))
            .slice(0, MAX_SCAN_SYMBOLS);

        async function worker(sym) {
            const klines = await fetchJson("/api/v3/klines", { symbol: sym, interval: s.interval, limit: 30 }, controller.signal);
            if (!klines || klines.length < 25) return null;

            const closed = klines.slice(0, -1);
            const candle = closed[closed.length - 1];
            const prevVol = closed.slice(-(s.volumeLookback + 1), -1);
            const prevBreak = closed.slice(-(s.breakoutLookback + 1), -1);

            const open = safeFloat(candle[1]);
            const high = safeFloat(candle[2]);
            const low = safeFloat(candle[3]);
            const close = safeFloat(candle[4]);
            const volume = safeFloat(candle[5]);
            if (close <= open) return null;

            const candleChangePct = ((close - open) / open) * 100;
            const rangePct = low > 0 ? ((high - low) / low) * 100 : 0;
            const closeFromHighPct = high > 0 ? ((high - close) / high) * 100 : 999;
            const bodyToRangeRatio = Math.abs(close - open) / Math.max(high - low, 1e-12);

            const avgPrevVolume = mean(prevVol.map(x => safeFloat(x[5])));
            if (avgPrevVolume <= 0) return null;
            const volumeRatio = volume / avgPrevVolume;

            const breakoutLevel = Math.max(...prevBreak.map(x => safeFloat(x[2])));
            const breakout = close > breakoutLevel;

            let isUptrend = true;
            if (closed.length >= 20) {
                const sma20 = mean(closed.slice(-20).map(x => safeFloat(x[4])));
                if (close < sma20) isUptrend = false;
            }

            const upperWick = high - close;
            const lowerWick = open - low;
            const bodySize = close - open;
            const safeRejection = upperWick <= (bodySize + lowerWick);

            if (!breakout || !isUptrend || !safeRejection) return null;
            if (candleChangePct < s.candleChangePctMin || rangePct < s.rangePctMin || volumeRatio < s.volumeRatioMin) return null;
            if (closeFromHighPct > s.maxCloseFromHighPct || bodyToRangeRatio < s.minBodyToRangeRatio) return null;

            return { symbol: sym, candleChangePct, entry: high * 1.001 };
        }

        const results = [];
        let workerErrorCount = 0;
        let cursor = 0;

        async function runWorker() {
            while (cursor < scanUniverse.length) {
                const i = cursor++;
                try {
                    const res = await worker(scanUniverse[i]);
                    if (res) results.push(res);
                } catch (e) {
                    if (controller.signal.aborted || e?.name === 'AbortError') return;
                    workerErrorCount += 1;
                }
            }
        }

        const pool = Array.from({ length: Math.min(s.maxWorkers, scanUniverse.length) }, () => runWorker());
        await Promise.all(pool);
        if (workerErrorCount) {
            console.warn(`Momentum scan: ${workerErrorCount} worker errors (ignored).`);
        }

        results.sort((a, b) => b.candleChangePct - a.candleChangePct);
        const topResults = results.slice(0, s.topN);

        state.scanner.lastRefresh = Date.now();
        return topResults;
    } catch (e) {
        if (e?.name === 'AbortError') throw e;
        console.error('Momentum scan failed:', e);
        throw e;
    } finally {
        externalSignal?.removeEventListener?.('abort', abortCurrent);
        if (state.scanner.abortController === controller) {
            state.scanner.abortController = null;
        }
    }
}

export function initMomentumScanner() {
    return {
        run(signal) {
            return scanCoins(signal);
        },
        pause() {
            state.scanner.abortController?.abort();
            state.scanner.abortController = null;
        },
        resume() {
            return;
        },
        dispose() {
            state.scanner.abortController?.abort();
            state.scanner.abortController = null;
        },
    };
}
