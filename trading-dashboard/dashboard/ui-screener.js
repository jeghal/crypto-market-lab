import { BEAR_SIGNAL_PILLS, SIGNAL_PILLS } from './config.js';
import { el } from './dom.js';

let screenerRows = [];
let sortKey = 'condCount';
let sortAsc = false;

const DEFAULT_SCREENER_COLUMNS = [
  ['sym', 'العملة'],
  ['price', 'السعر'],
  ['condCount', 'الإشارة'],
  ['trend', 'الترند'],
  ['stochKPct', 'Stoch'],
  ['macdDir', 'MACD'],
  ['rr', 'R:R'],
];

const MOMENTUM_COLUMNS = ['الزوج', 'التغير%', 'دخول', 'نوع', 'فريم', 'تأكيد', 'حالة'];

function setScreenerColumns(columns, sortable = true) {
  const headRow = el.screenerBody?.closest('table')?.querySelector('thead tr');
  if (!headRow) return;
  headRow.replaceChildren(
    ...columns.map((column) => {
      const th = document.createElement('th');
      if (Array.isArray(column)) {
        const [sort, label] = column;
        th.textContent = label;
        if (sortable) th.dataset.sort = sort;
      } else {
        th.textContent = column;
      }
      return th;
    }),
  );
}

function makeTextCell(text, style = {}) {
  const node = document.createElement('span');
  node.textContent = text;
  Object.assign(node.style, style);
  return node;
}

function getScreenerSortValue(row, key) {
  if (key === 'condCount') {
    if (row.signal && row.bearSignal) return Math.max(row.condCount ?? -Infinity, row.bearCondCount ?? -Infinity);
    if (row.bearSignal) return row.bearCondCount;
  }
  if (key === 'rr') {
    return row.signal && !row.bearSignal ? row.rr : null;
  }
  return row[key];
}

function applyScreenerSort(rows) {
  return [...rows].sort((a, b) => {
    const av = getScreenerSortValue(a, sortKey) ?? (sortAsc ? 'zzz' : -Infinity);
    const bv = getScreenerSortValue(b, sortKey) ?? (sortAsc ? 'zzz' : -Infinity);
    if (typeof av === 'string') return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortAsc ? av - bv : bv - av;
  });
}

function getScreenerSignalMeta(row) {
  if (row.signal && row.bearSignal) {
    return {
      icon: '▲▼',
      iconColor: 'var(--yellow)',
      countText: `${row.condCount}/${SIGNAL_PILLS.length} · ${row.bearCondCount}/${BEAR_SIGNAL_PILLS.length}`,
    };
  }
  if (row.bearSignal) {
    return {
      icon: '▼',
      iconColor: 'var(--red)',
      countText: `${row.bearCondCount}/${BEAR_SIGNAL_PILLS.length}`,
    };
  }
  return {
    icon: row.signal ? '▲' : '✕',
    iconColor: row.signal ? 'var(--green)' : 'var(--muted)',
    countText: `${row.condCount}/${SIGNAL_PILLS.length}`,
  };
}

function makeTableCell(text, style = {}) {
  const cell = document.createElement('td');
  cell.textContent = text;
  Object.assign(cell.style, style);
  return cell;
}

function makeCenteredMessageRow(colspan, message) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  cell.style.textAlign = 'center';
  cell.style.color = 'var(--muted)';
  cell.style.padding = '10px';
  cell.textContent = message;
  row.append(cell);
  return row;
}

function makeSkeletonRow(colspan) {
  const row = document.createElement('tr');
  row.className = 'scr-skeleton';
  const cell = document.createElement('td');
  cell.colSpan = colspan;
  const line = document.createElement('div');
  line.className = 'skeleton-line';
  cell.append(line);
  row.append(cell);
  return row;
}

function buildScreenerRowNode(row) {
  const tr = document.createElement('tr');
  tr.className = row.signal ? 'scr-row is-signal' : row.bearSignal ? 'scr-row is-bear-signal' : 'scr-row';
  tr.dataset.sym = row.sym;

  if (row.error) {
    const errorCell = makeTableCell('Error', { color: 'var(--muted)' });
    errorCell.colSpan = 6;
    tr.append(
      makeTableCell(row.sym.replace('USDT', ''), { color: 'var(--accent)', fontFamily: 'var(--mono)' }),
      errorCell,
    );
    return tr;
  }

  const signalMeta = getScreenerSignalMeta(row);
  const trendColor = row.trend === 'bull' ? 'var(--green)' : 'var(--red)';
  const trendArrow = row.trend === 'bull' ? '▲' : '▼';
  const sk = row.stochKPct;
  const skColor = sk != null && sk < 20 ? 'var(--green)' : sk != null && sk > 80 ? 'var(--red)' : 'var(--muted)';
  const macdColor = row.macdDir === 'bull' ? 'var(--green)' : 'var(--red)';
  const macdArrow = row.macdDir === 'bull' ? '▲' : '▼';
  const priceFmt = row.price != null ? `$${row.price > 10 ? row.price.toFixed(2) : row.price.toFixed(4)}` : '—';
  const rr = row.signal && !row.bearSignal && Number.isFinite(row.rr) && row.rr > 0 ? row.rr : null;
  const rrColor = row.bearSignal && !row.signal
    ? 'var(--muted)'
    : rr == null
      ? 'var(--muted)'
      : row.rrOk ? 'var(--green)' : 'var(--accent)';
  const rrTxt = row.bearSignal && !row.signal ? '— بيع' : rr == null ? '--' : `${row.rrOk ? 'OK' : 'NO'} 1:${rr.toFixed(2)}`;

  const signalCell = document.createElement('td');
  signalCell.style.textAlign = 'center';
  signalCell.append(
    makeTextCell(signalMeta.icon, { color: signalMeta.iconColor }),
    document.createTextNode(' '),
    makeTextCell(signalMeta.countText, { color: 'var(--muted)', fontSize: '9px' }),
  );

  tr.append(
    makeTableCell(row.sym.replace('USDT', ''), { color: 'var(--accent)', fontFamily: 'var(--mono)' }),
    makeTableCell(priceFmt, { fontFamily: 'var(--mono)', textAlign: 'right' }),
    signalCell,
    makeTableCell(trendArrow, { color: trendColor, textAlign: 'center' }),
    makeTableCell(sk != null ? sk.toFixed(0) : '—', {
      color: skColor,
      fontFamily: 'var(--mono)',
      textAlign: 'center',
    }),
    makeTableCell(macdArrow, { color: macdColor, textAlign: 'center' }),
    makeTableCell(rrTxt, { color: rrColor, fontFamily: 'var(--mono)', textAlign: 'center' }),
  );

  return tr;
}

export function sortScreener(key) {
  if (sortKey === key) sortAsc = !sortAsc;
  else { sortKey = key; sortAsc = key === 'sym'; }
  renderScreener(screenerRows);
}

export function renderScreener(rows, emptyMessage = 'لا توجد نتائج حالياً') {
  if (!el.screenerBody) return;
  setScreenerColumns(DEFAULT_SCREENER_COLUMNS, true);
  screenerRows = rows;
  if (!rows.length) {
    el.screenerBody.replaceChildren(makeCenteredMessageRow(7, emptyMessage));
    return;
  }
  const sorted = applyScreenerSort(rows);
  // Update sort indicator on headers
  const ths = el.screenerBody.closest('table')?.querySelectorAll('th[data-sort]');
  ths?.forEach((th) => {
    const arrow = th.dataset.sort === sortKey ? (sortAsc ? ' ↑' : ' ↓') : '';
    th.textContent = th.textContent.replace(/ [↑↓]$/, '') + arrow;
  });
  el.screenerBody.replaceChildren(...sorted.map(buildScreenerRowNode));
}

function buildMomentumRowNode(row) {
  const tr = document.createElement('tr');
  tr.className = 'scr-row is-momentum';
  tr.dataset.sym = row.symbol;

  const entry = Number(row.entry);
  const entryText = Number.isFinite(entry) ? `$${entry.toFixed(entry > 1 ? 2 : 4)}` : '--';
  const change = Number(row.candleChangePct);
  const changeText = Number.isFinite(change) ? `+${change.toFixed(2)}%` : '--';

  tr.append(
    makeTableCell(row.symbol.replace('USDT', ''), { color: 'var(--accent)', fontFamily: 'var(--mono)' }),
    makeTableCell(changeText, { color: 'var(--green)', fontFamily: 'var(--mono)', textAlign: 'center' }),
    makeTableCell(entryText, { fontFamily: 'var(--mono)', textAlign: 'right' }),
    makeTableCell('لحظي', { color: 'var(--yellow)', textAlign: 'center' }),
    makeTableCell('5m', { color: 'var(--muted)', fontFamily: 'var(--mono)', textAlign: 'center' }),
    makeTableCell('اختراق', { color: 'var(--green)', textAlign: 'center' }),
    makeTableCell('مراقبة', { color: 'var(--accent)', textAlign: 'center' }),
  );

  return tr;
}

export function renderMomentumScreener(rows, emptyMessage = 'لا توجد انفجارات لحظية الآن') {
  if (!el.screenerBody) return;
  setScreenerColumns(MOMENTUM_COLUMNS, false);
  screenerRows = [];
  if (!rows.length) {
    el.screenerBody.replaceChildren(makeCenteredMessageRow(7, emptyMessage));
    return;
  }
  el.screenerBody.replaceChildren(...rows.map(buildMomentumRowNode));
}

export function setScreenerLoading(loading) {
  const btns = document.querySelectorAll('.scr-mode-btn');
  btns.forEach(btn => {
    btn.disabled = loading;
    if (loading && btn.classList.contains('active')) {
      if (!btn.dataset.origText) btn.dataset.origText = btn.textContent;
      btn.textContent = '...';
    } else if (!loading && btn.dataset.origText) {
      btn.textContent = btn.dataset.origText;
      delete btn.dataset.origText;
    }
  });

  // Show skeleton rows only when the table is empty (first load)
  if (loading && el.screenerBody && !el.screenerBody.querySelector('.scr-row')) {
    el.screenerBody.replaceChildren(...Array.from({ length: 6 }, () => makeSkeletonRow(7)));
  }
}

export function renderCoilScreener(rows) {
  const body = document.getElementById('coilBody');
  if (!body) return;
  if (!rows.length) {
    body.replaceChildren(makeCenteredMessageRow(6, 'لا توجد إعدادات ضغط حالياً'));
    return;
  }
  // Sort by score descending
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  body.replaceChildren(
    ...sorted.filter(Boolean).map((row) => {
      const tr = document.createElement('tr');
      tr.className = row.coil ? 'scr-row coil-active' : 'scr-row';
      tr.dataset.sym = row.sym;

      const sym = `${row.sym.replace('USDT', '')}${row.coil ? ' 🎯' : ''}`;
      const pFmt = row.price > 10 ? row.price.toFixed(2) : row.price.toFixed(4);
      const biasC = row.bias === 'bull' ? 'var(--green)' : 'var(--red)';
      const biasA = row.bias === 'bull' ? '▲' : '▼';
      const bbwPct = row.bbwPct !== null ? `${(row.bbwPct * 100).toFixed(0)}%` : '—';
      const bbwC = row.sqzScore >= 35 ? 'var(--green)' : row.sqzScore > 0 ? 'var(--yellow)' : 'var(--muted)';
      const gapPct = Number.isFinite(row.gapToRes) ? `${(row.gapToRes * 100).toFixed(1)}%` : '—';
      const gapC = row.resScore >= 25 ? 'var(--green)' : row.resScore > 0 ? 'var(--yellow)' : 'var(--muted)';
      const scoreC = row.score >= 60 ? 'var(--green)' : row.score >= 40 ? 'var(--yellow)' : 'var(--muted)';

      const scoreCell = makeTableCell(String(row.score), {
        color: scoreC,
        fontFamily: 'var(--mono)',
        textAlign: 'center',
        fontWeight: 'bold',
      });

      tr.append(
        makeTableCell(sym, { color: 'var(--accent)', fontFamily: 'var(--mono)' }),
        makeTableCell(`$${pFmt}`, { fontFamily: 'var(--mono)', textAlign: 'right' }),
        makeTableCell(biasA, { color: biasC, textAlign: 'center' }),
        makeTableCell(bbwPct, { color: bbwC, fontFamily: 'var(--mono)', textAlign: 'center' }),
        makeTableCell(gapPct, { color: gapC, fontFamily: 'var(--mono)', textAlign: 'center' }),
        scoreCell,
      );
      return tr;
    }),
  );
}
