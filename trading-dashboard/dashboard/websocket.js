import { SYMS } from './config.js';
import { state } from './state.js';
import { getPriceChip } from './dom.js';
import { fmt } from './utils.js';
import { clearKlineCache } from './api.js';

const ENDPOINTS = [
  'wss://stream.binance.com:9443/stream'
];
let endpointIdx = 0;

const RECONNECT_BASE_MS = 2500;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_MAX_ATTEMPTS = 8;
const WATCHDOG_INTERVAL_MS = 60_000;
const WATCHDOG_STALE_MS = 120_000;
const monotonicNow = () => (
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
);

class BinanceWebSocket {
  constructor() {
    this._ws = null;
    this._delay = RECONNECT_BASE_MS;
    this._timer = null;
    this._manualClose = false;
    this._attempts = 0;
    this._watchdogTimer = null;
    this._lastMsgAt = 0;
    this._onKlineClose = null;
    this._onMiniTicker = null;
    this._redrawChart = null;
    this._sym = null;
    this._iv = null;
    this._rafPending = false;
    this._extraMiniSymbols = [];
    this._generation = 0;
  }

  _streamKey(sym = this._sym, iv = this._iv) {
    return sym && iv ? `${sym}:${iv}` : '';
  }

  _hasPendingOrActiveConnection(targetKey) {
    if (!targetKey) return false;
    if (this._timer && this._streamKey() === targetKey) return true;
    return this._ws
      && this._streamKey() === targetKey
      && (this._ws.readyState === WebSocket.CONNECTING || this._ws.readyState === WebSocket.OPEN);
  }

  onKlineClose(cb) { this._onKlineClose = cb; return this; }
  onMiniTicker(cb) { this._onMiniTicker = cb; return this; }
  setRedrawChart(fn) { this._redrawChart = fn; }

  setExtraMiniSymbols(symbols) {
    this._extraMiniSymbols = [...new Set((symbols ?? []).filter(Boolean))].sort();
  }

  connect(sym, iv) {
    const nextKey = this._streamKey(sym, iv);
    if (this._hasPendingOrActiveConnection(nextKey)) return;

    this._sym = sym;
    this._iv = iv;
    this._attempts = 0;
    this._generation += 1;
    clearTimeout(this._timer);
    this._timer = null;
    this._stopWatchdog();
    this._cleanup();

    this._timer = setTimeout(() => {
      this._timer = null;
      this._open();
    }, 150);
  }

  reconnect(sym, iv) {
    const nextKey = this._streamKey(sym, iv);
    if (this._hasPendingOrActiveConnection(nextKey)) return;

    this._sym = sym;
    this._iv = iv;
    this._generation += 1;
    clearTimeout(this._timer);
    this._timer = null;
    this._stopWatchdog();
    this._cleanup();

    this._manualClose = false;
    this._delay = RECONNECT_BASE_MS;
    this._attempts = 0;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._open();
    }, 150);
  }

  destroy() {
    this._manualClose = true;
    clearTimeout(this._timer);
    this._timer = null;
    this._stopWatchdog();
    if (this._ws) {
      try {
        this._ws.onopen = this._ws.onmessage = this._ws.onerror = this._ws.onclose = null;
        this._ws.close(1000);
      } catch (e) {}
      this._ws = null;
    }
  }

  _url() {
    const s = encodeURIComponent(this._sym.toLowerCase());
    const i = encodeURIComponent(this._iv);
    const base = ENDPOINTS[endpointIdx];
    endpointIdx = (endpointIdx + 1) % ENDPOINTS.length;
    return `${base}?streams=!miniTicker@arr/${s}@kline_${i}`;
  }

  _startWatchdog() {
    this._stopWatchdog();
    this._lastMsgAt = monotonicNow();
    this._watchdogTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN
        && monotonicNow() - this._lastMsgAt > WATCHDOG_STALE_MS) {
        this._manualClose = true;
        this._ws.onopen = this._ws.onmessage = this._ws.onerror = this._ws.onclose = null;
        this._ws.close();
        this._setDot(false);
        this._scheduleReconnect();
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  _stopWatchdog() {
    clearInterval(this._watchdogTimer);
    this._watchdogTimer = null;
  }

  _scheduleReconnect() {
    clearTimeout(this._timer);
    this._timer = null;
    this._attempts += 1;
    if (this._attempts > RECONNECT_MAX_ATTEMPTS) {
      this._setDot(false, true);
      return;
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this._delay = Math.min(this._delay * 1.5, RECONNECT_MAX_MS);
      this._open();
    }, this._delay);
  }

  _attachCallbacks(ws, gen) {
    ws.onopen = () => {
      if (this._generation !== gen) {
        try { ws.close(1000); } catch (e) {}
        return;
      }
      this._delay = RECONNECT_BASE_MS;
      this._attempts = 0;
      this._setDot(true);
      this._startWatchdog();
    };

    ws.onmessage = ({ data }) => {
      if (this._generation !== gen) return;
      this._lastMsgAt = monotonicNow();
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const { stream, data: d } = msg;

      if (stream === '!miniTicker@arr') {
        if (Array.isArray(d)) {
          const tracked = new Set([...SYMS, this._sym, ...this._extraMiniSymbols]);
          d.forEach(item => this._onMini(item, tracked));
        }
      } else if (stream.includes('@kline_')) {
        this._onKline(d);
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      if (this._generation !== gen) return;
      this._setDot(false);
      this._stopWatchdog();
      if (this._manualClose) return;
      
      if (this._ws === ws) this._ws = null;
      this._scheduleReconnect();
    };
  }

  _open() {
    if (!this._sym || !this._iv) return;
    this._manualClose = false;
    const gen = this._generation;
    const ws = new WebSocket(this._url());
    this._ws = ws;
    this._attachCallbacks(ws, gen);
  }

  _setDot(online, failed = false) {
    state.network.wsConnected = Boolean(online);
    const dot = document.querySelector('.sdot');
    if (!dot) return;
    if (failed) {
      dot.style.background = 'var(--red)';
      dot.title = 'انقطع الاتصال، أعد تحميل الصفحة';
      const stTxt = document.getElementById('stTxt');
      if (stTxt) stTxt.textContent = 'انقطع الاتصال، أعد تحميل الصفحة';
    } else {
      dot.style.background = online ? 'var(--green)' : 'var(--red)';
      dot.title = '';
    }
  }

  _requestRedraw() {
    if (this._redrawChart && !this._rafPending) {
      this._rafPending = true;
      requestAnimationFrame(() => {
        this._rafPending = false;
        if (this._redrawChart) this._redrawChart();
      });
    }
  }

  _onMini(d, trackedSymbols) {
    const sym = d.s;
    if (!trackedSymbols.has(sym)) return;

    const price = +d.c;
    const open24 = +d.o;
    const chg = open24 > 0 ? ((price - open24) / open24) * 100 : 0;

    state.prices[sym] = { price, chg, ts: Date.now() };
    this._onMiniTicker?.(sym, price, chg);

    if (sym === this._sym && state.chartCandles.length > 0) {
      if (state.livePrice !== price) {
        state.livePrice = price;
        this._requestRedraw();
      }
    }

    if (!this._chipCache) this._chipCache = new Map();
    let chip = this._chipCache.get(sym);
    if (!chip) {
      chip = getPriceChip(sym);
      this._chipCache.set(sym, chip);
    }

    if (chip.price && chip.change) {
      chip.price.textContent = `$${fmt(price, price > 10 ? 2 : 4)}`;
      chip.change.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`;
      chip.change.style.color = chg >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  _onKline(d) {
    const k = d.k;
    if (!k || k.s !== this._sym || k.i !== this._iv) return;

    if (k.x === true) {
      clearKlineCache(k.s, k.i);
      if (this._onKlineClose) this._onKlineClose(k.s, k.i);
    }

    if (state.chartCandles.length > 0) {
      const live = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, closed: k.x };
      const last = state.chartCandles[state.chartCandles.length - 1];
      if (last.t === k.t) {
        state.chartCandles[state.chartCandles.length - 1] = live;
      } else if (k.t > last.t) {
        const maxCandles = Number.isInteger(state.candleLimit) && state.candleLimit > 0
          ? state.candleLimit
          : state.chartCandles.length;
        if (state.chartCandles.length >= maxCandles) {
          state.chartCandles = maxCandles <= 1
            ? [live]
            : [...state.chartCandles.slice(-(maxCandles - 1)), live];
        } else {
          state.chartCandles.push(live);
        }
      }
      this._requestRedraw();
    }
  }

  _cleanup() {
    if (!this._ws) return;
    const old = this._ws;
    this._ws = null;
    this._manualClose = true;
    old.onopen = old.onmessage = old.onerror = old.onclose = () => {};
    try {
      if (old.readyState === WebSocket.CONNECTING) {
        old.onopen = () => { try { old.close(1000); } catch (e) {} };
      } else if (old.readyState === WebSocket.OPEN) {
        old.close(1000);
      }
    } catch (e) {}
  }
}

export const wsManager = new BinanceWebSocket();
