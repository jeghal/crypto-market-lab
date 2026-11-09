import { SYMS } from './config.js';
import { showToast } from './notifications.js';

const WL_KEY = 'td_watchlist_v1';
const WL_MAX = 20;
const SYMBOL_RE = /^[A-Z0-9]{2,20}USDT$/;

function normalizeSymbol(sym) {
  const normalized = String(sym ?? '').trim().toUpperCase();
  return SYMBOL_RE.test(normalized) ? normalized : null;
}

function sanitizeWatchlist(symbols) {
  const seen = new Set();
  return (Array.isArray(symbols) ? symbols : [])
    .map(normalizeSymbol)
    .filter((sym) => {
      if (!sym || seen.has(sym) || SYMS.includes(sym)) return false;
      seen.add(sym);
      return true;
    })
    .slice(0, WL_MAX);
}

export function loadWatchlist() {
  try {
    const raw = localStorage.getItem(WL_KEY);
    if (raw) {
      const sanitized = sanitizeWatchlist(JSON.parse(raw));
      localStorage.setItem(WL_KEY, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch (error) {
    console.warn('Watchlist load error:', error);
  }
  return [];
}

function saveWatchlist(symbols) {
  try {
    localStorage.setItem(WL_KEY, JSON.stringify(symbols));
  } catch (error) {
    console.warn('Watchlist save error:', error);
    showToast('تعذّر حفظ القائمة المفضلة', 'error');
  }
}

/**
 * Adds a symbol to the watchlist.
 * Returns the updated array, or null if symbol is invalid / already present.
 */
export function addToWatchlist(sym, verifiedSymbols = null) {
  const normalized = normalizeSymbol(sym);
  const list = loadWatchlist();

  if (!normalized) {
    showToast('الرمز غير صالح. استخدم زوجاً مثل DOGEUSDT', 'error');
    return null;
  }

  // Optional server-side validation against exchangeInfo
  if (verifiedSymbols && !verifiedSymbols.includes(normalized)) {
    showToast(`الرمز ${normalized} غير موجود على منصة بينانس`, 'error');
    return null;
  }

  if (SYMS.includes(normalized)) {
    showToast(`${normalized} موجود بالفعل في القائمة الثابتة`, 'info');
    return null;
  }
  if (list.includes(normalized)) {
    showToast(`${normalized} موجود بالفعل في قائمتك`, 'info');
    return null;
  }
  if (list.length >= WL_MAX) {
    showToast(`الحدث الأقصى ${WL_MAX} رمزًا`, 'info');
    return null;
  }

  const updated = [...list, normalized];
  saveWatchlist(updated);
  return updated;
}

export function removeFromWatchlist(sym) {
  const normalized = normalizeSymbol(sym);
  const updated = loadWatchlist().filter(s => s !== normalized);
  saveWatchlist(updated);
  return updated;
}

/** Returns all symbols: fixed SYMS + custom watchlist */
export function getAllSymbols() {
  return [...SYMS, ...loadWatchlist()];
}
