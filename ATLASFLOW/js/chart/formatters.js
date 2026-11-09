(function initCreptoChartFormatters(global) {
  const SHARED = global.CreptoShared || {};
  const normalizeIntervalLabel = SHARED.normalizeIntervalLabel || function normalizeIntervalLabelFallback(interval) {
    const v = String(interval || "").trim();
    if (!v) return "1d";
    if (v === "1M") return "1m";
    const low = v.toLowerCase();
    if (low === "1mo") return "1m";
    return low;
  };

  function priceLabel(v) {
    if (!Number.isFinite(v)) return "-";
    const d = v >= 100 ? 2 : v >= 1 ? 3 : 5;
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  }

  function formatSpan(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return "-";
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30 * DAY;
    const YEAR = 365 * DAY;

    if (ms < HOUR) {
      const mins = Math.max(1, Math.round(ms / MIN));
      return `${mins}m`;
    }
    if (ms < DAY) {
      const hours = Math.floor(ms / HOUR);
      const mins = Math.floor((ms % HOUR) / MIN);
      return mins ? `${hours}h ${mins}m` : `${hours}h`;
    }
    if (ms < WEEK) {
      const days = Math.floor(ms / DAY);
      const hours = Math.floor((ms % DAY) / HOUR);
      return hours ? `${days}d ${hours}h` : `${days}d`;
    }
    if (ms < MONTH) {
      const weeks = Math.floor(ms / WEEK);
      const days = Math.floor((ms % WEEK) / DAY);
      return days ? `${weeks}w ${days}d` : `${weeks}w`;
    }
    if (ms < YEAR) {
      const months = Math.floor(ms / MONTH);
      const weeks = Math.floor((ms % MONTH) / WEEK);
      return weeks ? `${months}mo ${weeks}w` : `${months}mo`;
    }

    const years = Math.floor(ms / YEAR);
    const months = Math.floor((ms % YEAR) / MONTH);
    return months ? `${years}y ${months}mo` : `${years}y`;
  }

  function fmtAxisDate(ts, iv) {
    const d = new Date(ts);
    const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const dm = `${d.getDate()}/${d.getMonth() + 1}`;
    const nIv = normalizeIntervalLabel(iv);
    if (nIv === "5m" || nIv === "15m" || nIv === "1h" || nIv === "4h") return { line1: hm, line2: dm };
    return { line1: dm, line2: null };
  }

  global.CreptoChart = {
    ...(global.CreptoChart || {}),
    priceLabel,
    formatSpan,
    fmtAxisDate,
  };
})(window);
