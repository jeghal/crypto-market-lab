import { state } from './state.js';

const FNG_URL = 'https://api.alternative.me/fng/?limit=2';
const CG_URL = 'https://api.coingecko.com/api/v3/global';
const FNG_INTERVAL_MS = 15 * 60_000;
const DOM_INTERVAL_MS = 10 * 60_000;
const SENTIMENT_FETCH_TIMEOUT_MS = 15_000;

let _fngCtrl = null;
let _domCtrl = null;
let _fngTimer = null;
let _domTimer = null;
let _started = false;

// Arc length for viewBox 0 0 140 76, radius 58: Math.PI * 58 ≈ 182.2
const ARC_LEN = 182.2;

function clearRuntimeInterval(timerKey) {
  const timerId = state.runtime.timers[timerKey];
  if (!timerId) return;
  clearInterval(timerId);
  state.runtime.timers[timerKey] = null;
}

function logSourceFailure(source, error) {
  if (error?.name === 'AbortError') return;
  const details = Number.isFinite(error?.status)
    ? `HTTP ${error.status}`
    : error?.message ?? String(error);
  console.warn(`[sentiment] ${source} failed: ${details}`, error);
}

async function fetchJsonWithTimeout(url, { label, getController, setController } = {}) {
  getController?.()?.abort();

  const controller = new AbortController();
  let timedOut = false;
  setController?.(controller);

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SENTIMENT_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = new Error(`${label} request failed with HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError' && timedOut) {
      const timeoutError = new Error(`${label} request timed out after ${SENTIMENT_FETCH_TIMEOUT_MS}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (getController?.() === controller) {
      setController?.(null);
    }
  }
}

function getFngMeta(value) {
  if (value <= 24) return { label: 'مخاوف شديدة', color: '#ff3a5c' };
  if (value <= 44) return { label: 'مخاوف', color: '#ff8c00' };
  if (value <= 55) return { label: 'محايد', color: '#ffc107' };
  if (value <= 74) return { label: 'جشع', color: '#7ecb20' };
  return { label: 'جشع شديد', color: '#00e896' };
}

async function fetchFearGreed() {
  const json = await fetchJsonWithTimeout(FNG_URL, {
    label: 'Alternative.me Fear & Greed',
    getController: () => _fngCtrl,
    setController: (value) => { _fngCtrl = value; },
  });

  const today = json?.data?.[0];
  const yesterday = json?.data?.[1];
  if (!today) {
    throw new Error('Alternative.me Fear & Greed returned no rows');
  }

  return {
    value: +today.value,
    prevValue: yesterday ? +yesterday.value : null,
    delta: yesterday ? +today.value - +yesterday.value : null,
    timestamp: +today.timestamp * 1000,
  };
}

function renderFearGreed(data) {
  const arc = document.getElementById('fngArc');
  const needle = document.getElementById('fngNeedle');
  const valEl = document.getElementById('fngValue');
  const lblEl = document.getElementById('fngLabel');
  const deltaEl = document.getElementById('fngDelta');
  if (!arc) return;

  const meta = getFngMeta(data.value);
  const ratio = data.value / 100;

  arc.setAttribute('stroke-dasharray', `${ratio * ARC_LEN} ${ARC_LEN}`);
  arc.setAttribute('stroke', meta.color);

  const angle = (ratio - 0.5) * 180;
  if (needle) needle.style.transform = `rotate(${angle}deg)`;

  if (valEl) {
    valEl.textContent = data.value;
    valEl.style.color = meta.color;
  }
  if (lblEl) {
    lblEl.textContent = meta.label;
    lblEl.style.color = meta.color;
  }
  if (deltaEl && data.delta !== null) {
    const sign = data.delta >= 0 ? '+' : '';
    deltaEl.textContent = `${sign}${data.delta} مقارنة بالأمس`;
    deltaEl.style.color = data.delta >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

async function fetchBtcDominance() {
  const json = await fetchJsonWithTimeout(CG_URL, {
    label: 'CoinGecko global market',
    getController: () => _domCtrl,
    setController: (value) => { _domCtrl = value; },
  });

  const btcDominance = json?.data?.market_cap_percentage?.btc;
  const totalMarketCap = json?.data?.total_market_cap?.usd;
  if (!Number.isFinite(btcDominance) || !Number.isFinite(totalMarketCap)) {
    throw new Error('CoinGecko global market returned an unexpected payload');
  }

  return { btcDominance, totalMarketCap };
}

function renderDominance(data) {
  const pctEl = document.getElementById('domPct');
  const barEl = document.getElementById('domBar');
  const mcapEl = document.getElementById('domMcap');
  if (!pctEl) return;

  const pct = data.btcDominance.toFixed(1);
  pctEl.textContent = `${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;
  if (mcapEl) {
    const t = (data.totalMarketCap / 1e12).toFixed(2);
    mcapEl.textContent = `$${t}T`;
  }
}

async function refreshFng() {
  try {
    renderFearGreed(await fetchFearGreed());
  } catch (error) {
    logSourceFailure('Fear & Greed index', error);
  }
}

async function refreshDominance() {
  try {
    renderDominance(await fetchBtcDominance());
  } catch (error) {
    logSourceFailure('BTC dominance', error);
  }
}

export function initSentiment() {
  if (_started) return;
  _started = true;

  refreshFng();
  refreshDominance();

  _fngTimer = setInterval(refreshFng, FNG_INTERVAL_MS);
  _domTimer = setInterval(refreshDominance, DOM_INTERVAL_MS);
  state.runtime.timers.sentimentFearGreedIntervalId = _fngTimer;
  state.runtime.timers.sentimentDominanceIntervalId = _domTimer;
}

export function destroySentiment() {
  _started = false;

  clearRuntimeInterval('sentimentFearGreedIntervalId');
  clearRuntimeInterval('sentimentDominanceIntervalId');
  _fngTimer = null;
  _domTimer = null;

  _fngCtrl?.abort();
  _domCtrl?.abort();
  _fngCtrl = null;
  _domCtrl = null;
}
