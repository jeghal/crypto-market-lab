export function last(arr, offset = 1) {
  return arr.at(-offset);
}

export function getDpr() {
  return window.devicePixelRatio || 1;
}

export function fmt(value, decimals = 2) {
  return Number(value).toLocaleString('en', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatVolume(value) {
  const absValue = Math.abs(Number(value));
  if (absValue >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
  return fmt(value, 0);
}

export function formatUiTime(date) {
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatUiDate(date) {
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function formatUiDateTime(date) {
  return `${formatUiDate(date)} ${formatUiTime(date).slice(0, 5)}`;
}

export function activateTab(buttons, nextButton) {
  buttons.forEach(button => button.classList.remove('active'));
  nextButton.classList.add('active');
}

export function getChartRangeLabel(candles, interval) {
  if (!candles?.length) return '';

  const firstDate = new Date(candles[0].t);
  const lastDate = new Date(last(candles).t);
  const useTime = interval === '5m' || interval === '15m' || interval === '1h' || interval === '4h';
  const formatPoint = useTime ? formatUiDateTime : formatUiDate;

  return `من ${formatPoint(firstDate)} إلى ${formatPoint(lastDate)}`;
}

function formatDurationUnit(value, one, two, many) {
  if (value === 1) return `${value} ${one}`;
  if (value === 2) return `${value} ${two}`;
  return `${value} ${many}`;
}

export function getChartDurationLabel(candles) {
  if (!candles?.length) return '';

  const firstTs = candles[0]?.t;
  const lastTs = last(candles)?.t;
  if (!Number.isFinite(firstTs) || !Number.isFinite(lastTs) || lastTs <= firstTs) {
    return 'أقل من دقيقة';
  }

  let remainingMinutes = Math.max(1, Math.round((lastTs - firstTs) / 60_000));
  const parts = [];
  const units = [
    ['سنة', 'سنتين', 'سنوات', 365 * 24 * 60],
    ['شهر', 'شهرين', 'أشهر', 30 * 24 * 60],
    ['يوم', 'يومين', 'أيام', 24 * 60],
    ['ساعة', 'ساعتين', 'ساعات', 60],
    ['دقيقة', 'دقيقتين', 'دقائق', 1],
  ];

  units.forEach(([one, two, many, size]) => {
    if (parts.length >= 2) return;
    const amount = Math.floor(remainingMinutes / size);
    if (amount <= 0) return;
    parts.push(formatDurationUnit(amount, one, two, many));
    remainingMinutes -= amount * size;
  });

  return parts.join(' و ') || 'أقل من دقيقة';
}

export function formatCandleTimestamp(timestamp, interval) {
  const date = new Date(timestamp);
  const useTime = interval === '5m' || interval === '15m' || interval === '1h' || interval === '4h';
  return useTime ? formatUiDateTime(date) : formatUiDate(date);
}
