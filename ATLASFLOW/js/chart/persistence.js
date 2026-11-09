(function initAtlasFlowChartPersistence(global) {
  const PREFS_KEY = "crypto_chart_prefs_v1";
  const LEVELS_KEY = "crypto_chart_levels_v1";

  function savePrefs(S) {
    if (!S) return;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ layers: S.layers }));
  }

  function loadPrefs(S, parseJsonFn) {
    if (!S || !parseJsonFn) return;
    const p = parseJsonFn(PREFS_KEY, {}, (x) => !!x && typeof x === "object" && (!("layers" in x) || (!!x.layers && typeof x.layers === "object")));
    if (p.layers && typeof p.layers === "object") {
      Object.keys(S.layers).forEach((k) => {
        if (typeof p.layers[k] === "boolean") S.layers[k] = p.layers[k];
      });
    }
  }

  function saveLevels(S, parseJsonFn) {
    if (!S || !parseJsonFn) return;
    const key = `${S.symbol}__${S.interval}`;
    const all = parseJsonFn(LEVELS_KEY, {}, (v) => !!v && typeof v === "object" && !Array.isArray(v));
    all[key] = [...new Set(S.levels.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).slice(0, 20);
    localStorage.setItem(LEVELS_KEY, JSON.stringify(all));
  }

  function loadLevels(S, parseJsonFn) {
    if (!S || !parseJsonFn) return;
    const key = `${S.symbol}__${S.interval}`;
    const all = parseJsonFn(LEVELS_KEY, {}, (v) => !!v && typeof v === "object" && !Array.isArray(v));
    const arr = all[key];
    S.levels = Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite).slice(0, 20) : [];
    S.hoverLevel = -1;
    S.dragLevel = -1;
  }

  global.AtlasFlowChart = {
    ...(global.AtlasFlowChart || {}),
    savePrefs,
    loadPrefs,
    saveLevels,
    loadLevels,
  };
})(window);
