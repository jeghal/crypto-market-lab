/* Shared source. Run node scripts/sync_shared.mjs after editing. */
(function (global) {
  const abortError = () => new DOMException('Aborted', 'AbortError');
  function wait(ms, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const done = () => { signal?.removeEventListener('abort', cancel); resolve(); };
      const timer = setTimeout(done, Math.max(0, ms));
      function cancel() { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(abortError()); }
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }
  async function requestJson(url, { signal, retries = 1, retryDelayMs = 1500, timeoutMs = 12000, onRetry, ...options } = {}) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (signal?.aborted) throw abortError();
      const controller = new AbortController();
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel, { once: true });
      const timer = timeoutMs > 0 ? setTimeout(cancel, timeoutMs) : null;
      let failure;
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          const header = response.headers?.get('Retry-After');
          const seconds = header ? Number(header) : NaN;
          const dateDelay = header ? Date.parse(header) - Date.now() : NaN;
          error.retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000
            : Number.isFinite(dateDelay) && dateDelay > 0 ? dateDelay : retryDelayMs * (attempt + 1);
          throw error;
        }
        return await response.json();
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (controller.signal.aborted) {
          failure = new Error(`Request timed out after ${timeoutMs}ms`);
          failure.name = 'TimeoutError';
        } else failure = error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
      const retryable = failure.status == null || [408,425,429,500,502,503,504].includes(failure.status);
      if (attempt === retries || !retryable) throw failure;
      const delayMs = failure.status === 429 ? failure.retryAfterMs : retryDelayMs * (attempt + 1);
      onRetry?.({ status: failure.status, attempt: attempt + 1, delayMs });
      await wait(delayMs, signal);
    }
    throw new Error('No request attempts configured');
  }
  function toFiniteNumber(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  const roundTo = (value, digits = 8) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  function step(value, size, mode) {
    if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return null;
    const ratio = value / size;
    const near = Math.round(ratio);
    const normalized = Math.abs(ratio - near) <= Number.EPSILON * Math.max(1, Math.abs(ratio)) * 4 ? near : ratio;
    return roundTo(Math[mode](normalized) * size, 12);
  }
  const floorToStep = (value, size) => step(value, size, 'floor');
  const ceilToStep = (value, size) => step(value, size, 'ceil');
  const roundToStep = (value, size) => step(value, size, 'round');
  function ema(values, period, { seed = 'sma' } = {}) {
    if (!Number.isInteger(period) || period < 1) throw new RangeError('EMA period must be a positive integer');
    const out = Array(values.length).fill(null);
    if (!values.length) return out;
    const factor = 2 / (period + 1);
    let start, previous;
    if (seed === 'first') { previous = values[0]; out[0] = previous; start = 1; }
    else {
      if (values.length < period) return out;
      previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
      out[period - 1] = previous;
      start = period;
    }
    for (let i = start; i < values.length; i++) { previous = values[i] * factor + previous * (1 - factor); out[i] = previous; }
    return out;
  }
  function atr(candles, period = 14) {
    if (!Number.isInteger(period) || period < 1) throw new RangeError('ATR period must be a positive integer');
    const out = Array(candles.length).fill(null);
    if (candles.length < period) return out;
    const ranges = candles.map((c, i) => i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i-1].c), Math.abs(c.l - candles[i-1].c)));
    let previous = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
    out[period-1] = previous;
    for (let i = period; i < ranges.length; i++) { previous = (previous * (period-1) + ranges[i]) / period; out[i] = previous; }
    return out;
  }
  global.BinanceCore = Object.freeze({ requestJson, wait, toFiniteNumber, roundTo, floorToStep, ceilToStep, roundToStep, ema, atr });
})(globalThis);
