(function initAtlasFlowAssistantConfig(global) {
  const SHARED = global.AtlasFlowShared || {};

  const DEF_CFG = {
    srNearPct: 1.4,
    wickMax: 0.72,
    rrMin: 1.5,
    rrStrong: 1.8,
    stopMinPct: 0.2,
    stopMaxPct: 4,
    targetRoomMinPct: 0.35,
  };

  const CFG_PROFILES = {
    balanced: { ...DEF_CFG },
    conservative: {
      srNearPct: 1.05,
      wickMax: 0.64,
      rrMin: 1.9,
      rrStrong: 2.2,
      stopMinPct: 0.3,
      stopMaxPct: 3.1,
      targetRoomMinPct: 0.55,
    },
    aggressive: {
      srNearPct: 1.9,
      wickMax: 0.82,
      rrMin: 1.25,
      rrStrong: 1.55,
      stopMinPct: 0.15,
      stopMaxPct: 5.2,
      targetRoomMinPct: 0.25,
    },
  };

  const PROFILE_FIELDS = ["srNearPct", "wickMax", "rrMin", "rrStrong", "stopMinPct", "stopMaxPct", "targetRoomMinPct"];

  function normalizeCfg(raw) {
    const r = raw || {};
    const c = SHARED.clamp || ((v, min, max) => Math.max(min, Math.min(max, v)));
    
    const parse = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };

    return {
      srNearPct: c(parse(r.srNearPct) || DEF_CFG.srNearPct, 0.1, 5),
      wickMax: c(parse(r.wickMax) || DEF_CFG.wickMax, 0.3, 0.95),
      rrMin: c(parse(r.rrMin) || DEF_CFG.rrMin, 0.5, 5),
      rrStrong: c(parse(r.rrStrong) || DEF_CFG.rrStrong, 1.5, 6),
      stopMinPct: c(parse(r.stopMinPct) || DEF_CFG.stopMinPct, 0.05, 3),
      stopMaxPct: c(parse(r.stopMaxPct) || DEF_CFG.stopMaxPct, 0.1, 10),
      targetRoomMinPct: c(parse(r.targetRoomMinPct) || DEF_CFG.targetRoomMinPct, 0.1, 5),
    };
  }

  function cfgDistance(a, b) {
    let sum = 0;
    PROFILE_FIELDS.forEach((k) => {
      sum += Math.abs(Number(a?.[k]) - Number(b?.[k]));
    });
    return sum;
  }

  function detectProfileByCfg(cfg) {
    const ranked = ["balanced", "conservative", "aggressive"].map((key) => ({
      key,
      dist: cfgDistance(normalizeCfg(CFG_PROFILES[key]), cfg),
    }));
    ranked.sort((x, y) => x.dist - y.dist);
    return ranked[0]?.key || "balanced";
  }

  function profileLabel(profile) {
    if (profile === "conservative") return "محافظ";
    if (profile === "aggressive") return "هجومي";
    return "متوازن";
  }

  global.AtlasFlowAssistant = {
    ...(global.AtlasFlowAssistant || {}),
    DEF_CFG,
    CFG_PROFILES,
    PROFILE_FIELDS,
    normalizeCfg,
    detectProfileByCfg,
    profileLabel,
  };
})(window);
