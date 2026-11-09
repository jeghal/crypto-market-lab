export function getAllowedCandleLimits(selectEl) {
  const options = Array.from(selectEl?.options ?? []);
  const allowed = options
    .map((opt) => Number.parseInt(opt.value, 10))
    .filter((v) => Number.isFinite(v) && v > 0);
  return allowed.length ? allowed : [50, 100, 150];
}

export function normalizeCandleLimit(value, selectEl, fallback) {
  const allowed = getAllowedCandleLimits(selectEl);
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    const fallbackParsed = Number.parseInt(fallback, 10);
    return Number.isFinite(fallbackParsed) ? fallbackParsed : allowed[0];
  }

  let best = allowed[0];
  let bestDistance = Math.abs(parsed - best);
  for (const option of allowed) {
    const distance = Math.abs(parsed - option);
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}
