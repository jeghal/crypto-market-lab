import { BEAR_SIGNAL_PILLS, CFG, IV_LABELS, SIGNAL_PILLS, SYMS } from './config.js';
import { loadWatchlist, removeFromWatchlist } from './watchlist.js';
import { el } from './dom.js';
import { redrawChart } from './chart.js';
import { state } from './state.js';
import { renderCoilScreener, renderMomentumScreener, renderScreener, setScreenerLoading, sortScreener } from './ui-screener.js';
import { hideTooltip, renderTooltip, updateOHLC } from './ui-tooltip.js';
import {
  renderSignalCard,
  renderConditions,
  renderRsi,
  renderMacd,
  renderRiskLevels,
  renderOrderBook,
  renderSupportResistance,
  renderMtf,
  renderPatterns,
  renderChartMeta,
} from './ui-signal.js';
import { renderDecisionExplanation } from './ui-decision-explanation.js';
import { renderScenario } from './ui-scenario.js';
import {
  activateTab,
  fmt,
  formatUiDate,
  formatUiTime,
  getChartDurationLabel,
  getChartRangeLabel,
  last,
} from './utils.js';

export {
  hideTooltip,
  renderTooltip,
  updateOHLC,
  renderCoilScreener,
  renderMomentumScreener,
  renderScreener,
  setScreenerLoading,
  sortScreener,
};

export function updateStatus(text, type = 'info', countdown = null) {
  if (!el.statusText) return;
  el.statusText.textContent = text;
  el.statusText.className = `st-txt ${type}`;

  if (el.statusTime) {
    el.statusTime.textContent = formatUiTime(new Date());
  }

  if (el.countdown) {
    el.countdown.style.display = countdown ? 'block' : 'none';
    if (countdown) el.countdown.textContent = `(${countdown}s)`;
  }
}

/** Legacy alias if needed */
export const showStatus = updateStatus;

export function setLoading(loading) {
  if (el.refreshIcon) {
    el.refreshIcon.classList.toggle('spinning', loading);
  }
}

export function renderPriceTabs(prices) {
  if (!prices) return;
  [...SYMS, ...loadWatchlist()].forEach((sym) => {
    const data = prices[sym];
    const priceEl = document.getElementById(`p-${sym}`);
    const changeEl = document.getElementById(`c-${sym}`);
    if (!data) return;

    if (priceEl) {
      priceEl.textContent = `$${fmt(data.price, data.price > 10 ? 2 : 4)}`;
    }
    if (changeEl) {
      changeEl.textContent = `${data.chg >= 0 ? '+' : ''}${data.chg.toFixed(2)}%`;
      changeEl.className = `sc ${data.chg >= 0 ? 'up' : 'dn'}`;
      changeEl.style.color = data.chg >= 0 ? 'var(--green)' : 'var(--red)';
    }
  });
}

export function renderWatchlistTabs(nextWatchlist = null, activeSym = state.curSym) {
  if (!el.watchlistTabs) return;
  const watchlist = Array.isArray(nextWatchlist) ? nextWatchlist : loadWatchlist();
  el.watchlistTabs.replaceChildren(
    ...watchlist.map((sym) => {
      const item = document.createElement('div');
      item.className = 'wl-item';

      const btn = document.createElement('div');
      btn.className = activeSym === sym ? 'stab active wl-tab' : 'stab wl-tab';
      btn.dataset.sym = sym;
      btn.dataset.custom = 'true';
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');

      const name = document.createElement('span');
      name.className = 'sn';
      name.textContent = sym.replace('USDT', '');

      const price = document.createElement('span');
      price.className = 'sp';
      price.id = `p-${sym}`;
      price.textContent = '--';

      const change = document.createElement('span');
      change.className = 'sc';
      change.id = `c-${sym}`;
      change.textContent = '--';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'wl-remove';
      remove.dataset.sym = sym;
      remove.setAttribute('aria-label', `Remove ${sym}`);
      remove.textContent = 'x';
      remove.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const updated = removeFromWatchlist(sym);
        renderWatchlistTabs(updated, activeSym);
        el.watchlistTabs?.dispatchEvent(new CustomEvent('watchlist-remove', {
          bubbles: true,
          detail: { sym },
        }));
      });

      btn.append(name, price, change, remove);
      btn.removeChild(remove);
      item.append(btn, remove);
      return item;
    }),
  );
}

export function syncActiveSymbolTab(activeSym) {
  const allTabs = document.querySelectorAll('.stab');
  allTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.sym === activeSym);
  });

  if (el.chartSymbolSelect) {
    const allSyms = [...new Set([...SYMS, activeSym, ...loadWatchlist()])];
    el.chartSymbolSelect.replaceChildren(
      ...allSyms.map((sym) => {
        const opt = document.createElement('option');
        opt.value = sym;
        opt.textContent = sym;
        return opt;
      }),
    );
    el.chartSymbolSelect.value = activeSym;
  }
}

/** Alias for compatibility */
export const syncChartSymbolSelect = syncActiveSymbolTab;

export function render(result) {
  if (!result) return;
  state.lastResult = result;

  renderSignalCard(result);
  renderDecisionExplanation(result);
  renderConditions(result);
  renderRsi(result);
  renderMacd(result);
  renderRiskLevels(result);
  renderOrderBook(result);
  renderSupportResistance(result);
  renderMtf(result);
  renderPatterns(result);
  renderScenario(result);
  renderChartMeta(result);

  redrawChart();
}
