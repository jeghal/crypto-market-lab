import { DEFAULT_ANALYSIS_PROFILE, IV_LABELS, resolveAnalysisProfileKey, SYMS } from './config.js';
import { showToast } from './notifications.js';
import { loadWatchlist } from './watchlist.js';

const KEY = 'td_v1';
const MIN_CANDLE_LIMIT = 10;
const MAX_CANDLE_LIMIT = 1000;

function manualLevelsContextKey(sym, iv) {
  return `${sym}__${iv}`;
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}

function save(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch }));
  } catch (err) {
    showToast(`تعذّر الحفظ: ${err?.message ?? 'localStorage unavailable'}`, 'error');
  }
}

function sanitizeCandleLimit(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(MIN_CANDLE_LIMIT, Math.min(MAX_CANDLE_LIMIT, parsed));
}

export function loadSettings(defaults) {
  const saved = load();
  const validSymbols = new Set([...SYMS, ...loadWatchlist()]);
  const validIntervals = new Set(Object.keys(IV_LABELS));
  const savedLayers = saved.layers ?? {};

  return {
    curSym: validSymbols.has(saved.curSym) ? saved.curSym : defaults.curSym,
    curIv: validIntervals.has(saved.curIv) ? saved.curIv : defaults.curIv,
    candleLimit: sanitizeCandleLimit(saved.candleLimit, defaults.candleLimit),
    layers: Object.fromEntries(
      Object.entries(defaults.layers).map(([key, defaultValue]) => [
        key,
        typeof savedLayers[key] === 'boolean' ? savedLayers[key] : defaultValue,
      ]),
    ),
  };
}

export const saveSym = sym => save({ curSym: sym });
export const saveIv = iv => save({ curIv: iv });
export const saveCandleLimit = n => save({ candleLimit: n });
export function saveLayer(key, value) {
  const saved = load();
  save({ layers: { ...(saved.layers ?? {}), [key]: value } });
}

export function loadAnalysisProfile() {
  const saved = load();
  return resolveAnalysisProfileKey(saved.analysisProfile ?? DEFAULT_ANALYSIS_PROFILE);
}

export function saveAnalysisProfile(profileKey) {
  save({ analysisProfile: resolveAnalysisProfileKey(profileKey) });
}

export function loadCollapsedCards() {
  const saved = load();
  const cards = saved.collapsedCards;
  if (!cards || typeof cards !== 'object' || Array.isArray(cards)) return {};
  return cards;
}

export function saveCollapsedCard(key, collapsed) {
  if (!key) return;
  const cards = loadCollapsedCards();
  save({ collapsedCards: { ...cards, [key]: !!collapsed } });
}

const VOL_THRESHOLD_DEFAULT = 15_000_000;

export function loadVolThreshold() {
  return VOL_THRESHOLD_DEFAULT;
}

export function loadManualLevels(sym, iv) {
  const saved = load();
  const byContext = saved.manualLevelsByContext ?? {};
  const contextKey = manualLevelsContextKey(sym, iv);
  const scoped = byContext[contextKey];
  if (Array.isArray(scoped)) return scoped;
  if (Object.keys(byContext).length) return [];
  return saved.manualLevels ?? [];
}
export function saveManualLevels(sym, iv, levels) {
  const saved = load();
  const byContext = saved.manualLevelsByContext ?? {};
  save({
    manualLevelsByContext: {
      ...byContext,
      [manualLevelsContextKey(sym, iv)]: levels,
    },
  });
}
