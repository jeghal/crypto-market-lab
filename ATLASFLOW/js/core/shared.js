(function initCreptoShared(global) {
  function migrateStorageKey(newKey, legacyKey) {
    const hasNew = localStorage.getItem(newKey) !== null;
    const legacy = localStorage.getItem(legacyKey);
    if (!hasNew && legacy !== null) localStorage.setItem(newKey, legacy);
  }

  function normalizeSymbol(input) {
    const cleaned = String(input || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");

    if (!cleaned) return "";
    if (cleaned.endsWith("USDT")) return cleaned;
    return `${cleaned}USDT`;
  }

  function isValidSymbol(symbol) {
    return /^[A-Z0-9]{2,20}USDT$/.test(String(symbol || ""));
  }

  function symbolLabel(symbol) {
    return String(symbol || "").replace(/USDT$/, "");
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function normalizeIntervalLabel(interval) {
    const v = String(interval || "").trim();
    if (!v) return "1d";
    if (v === "1M") return "1m";
    const low = v.toLowerCase();
    if (low === "1mo") return "1m";
    return low;
  }

  function toApiInterval(interval) {
    const iv = normalizeIntervalLabel(interval);
    return iv === "1m" ? "1M" : iv;
  }

  function fromApiInterval(interval) {
    return normalizeIntervalLabel(interval);
  }

  function intervalToMs(iv) {
    const v = String(iv || "").toLowerCase();
    if (v === "5m") return 5 * 60 * 1000;
    if (v === "15m") return 15 * 60 * 1000;
    if (v === "1min") return 60 * 1000;
    if (v === "1h") return 60 * 60 * 1000;
    if (v === "4h") return 4 * 60 * 60 * 1000;
    if (v === "1d") return 24 * 60 * 60 * 1000;
    if (v === "1w") return 7 * 24 * 60 * 60 * 1000;
    // Here "1m" means monthly timeframe (1M in UI), not 1 minute.
    if (v === "1m") return 30 * 24 * 60 * 60 * 1000;
    return NaN;
  }

  global.CreptoShared = {
    ...(global.CreptoShared || {}),
    migrateStorageKey,
    normalizeSymbol,
    isValidSymbol,
    symbolLabel,
    clamp,
    normalizeIntervalLabel,
    toApiInterval,
    fromApiInterval,
    intervalToMs,
  };
})(window);
