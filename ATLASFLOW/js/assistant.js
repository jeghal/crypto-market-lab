(function initContentAssistant() {
  const autoNote = document.getElementById("chartAutoNote");
  const autoChecklist = document.getElementById("chartAutoChecklist");
  const assistantConfig = document.getElementById("assistantConfig");
  const profileSelect = document.getElementById("assistantProfileSelect");
  const profileApplyBtn = document.getElementById("assistantProfileApply");
  if (!autoNote && !autoChecklist) return;

  const CFG_KEY = "crypto_assistant_cfg_v1";
  const CFG_KEY_LEGACY = "crepto_assistant_cfg_v1";
  const PROFILE_KEY = "crypto_assistant_profile_v1";
  const PROFILE_KEY_LEGACY = "crepto_assistant_profile_v1";
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

  const A = {
    activeTabLabel: "",
    snapshot: null,
    renderQueued: false,
    lastPresetNote: "",
    cfg: { ...DEF_CFG },
    profile: "balanced",
  };
  const SHARED = window.CreptoShared || {};
  const migrateStorageKey = SHARED.migrateStorageKey || function migrateStorageKeyFallback(newKey, legacyKey) {
    const hasNew = localStorage.getItem(newKey) !== null;
    const legacy = localStorage.getItem(legacyKey);
    if (!hasNew && legacy !== null) localStorage.setItem(newKey, legacy);
  };
  const intervalToMs = SHARED.intervalToMs || function intervalToMsFallback(iv) {
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
  };
  const clamp = SHARED.clamp || function clampFallback(v, min, max) {
    return Math.max(min, Math.min(max, v));
  };

  migrateStorageKey(CFG_KEY, CFG_KEY_LEGACY);
  migrateStorageKey(PROFILE_KEY, PROFILE_KEY_LEGACY);

  function makeCheck(ok, text, decision = null) {
    return { ok, text, decision };
  }

  function latestFinite(arr) {
    if (!Array.isArray(arr)) return NaN;
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (Number.isFinite(arr[i])) return arr[i];
    }
    return NaN;
  }

  function intervalLabel(iv) {
    const v = String(iv || "");
    if (!v) return "-";
    return v.toUpperCase();
  }

  function trendLabel(trend) {
    if (trend === "bull") return "صاعد";
    if (trend === "bear") return "هابط";
    return "عرضي";
  }

  function getCoreConfidence(s) {
    const checks = [
      s.trend !== "side",
      !s.inMiddle,
      s.confirmation,
      Number.isFinite(s.rr) && s.rr >= A.cfg.rrMin,
      s.avgWick < A.cfg.wickMax && s.notHesitant,
    ];
    const score = checks.filter(Boolean).length;
    const level = score >= 4 ? "مرتفعة" : score >= 3 ? "متوسطة" : "ضعيفة";
    return { score, level };
  }

  function parseFinite(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function normalizeCfg(raw) {
    const r = raw || {};
    const srNearPct = clamp(parseFinite(r.srNearPct) || DEF_CFG.srNearPct, 0.1, 5);
    const wickMax = clamp(parseFinite(r.wickMax) || DEF_CFG.wickMax, 0.3, 0.95);
    const rrMin = clamp(parseFinite(r.rrMin) || DEF_CFG.rrMin, 0.5, 5);
    const rrStrong = clamp(parseFinite(r.rrStrong) || DEF_CFG.rrStrong, rrMin, 6);
    const stopMinPct = clamp(parseFinite(r.stopMinPct) || DEF_CFG.stopMinPct, 0.05, 3);
    const stopMaxPct = clamp(parseFinite(r.stopMaxPct) || DEF_CFG.stopMaxPct, stopMinPct + 0.05, 10);
    const targetRoomMinPct = clamp(parseFinite(r.targetRoomMinPct) || DEF_CFG.targetRoomMinPct, 0.1, 5);
    return { srNearPct, wickMax, rrMin, rrStrong, stopMinPct, stopMaxPct, targetRoomMinPct };
  }

  function loadCfg() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
      return normalizeCfg(parsed || DEF_CFG);
    } catch {
      return { ...DEF_CFG };
    }
  }

  function saveCfg() {
    localStorage.setItem(CFG_KEY, JSON.stringify(A.cfg));
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, String(profile || "balanced"));
  }

  function loadProfile() {
    try {
      const profile = String(localStorage.getItem(PROFILE_KEY) || "").toLowerCase();
      if (profile === "balanced" || profile === "conservative" || profile === "aggressive") return profile;
    } catch {}
    return "";
  }

  function profileLabel(profile) {
    if (profile === "conservative") return "محافظ";
    if (profile === "aggressive") return "هجومي";
    return "متوازن";
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

  function syncProfileSelect() {
    if (!profileSelect) return;
    const v = A.profile || detectProfileByCfg(A.cfg);
    profileSelect.value = v in CFG_PROFILES ? v : "balanced";
  }

  function syncCfgInputs() {
    syncProfileSelect();
  }

  function isNearSupport(s) {
    return Number.isFinite(s.distSupPct) && s.distSupPct <= A.cfg.srNearPct;
  }

  function isNearResistance(s) {
    return Number.isFinite(s.distResPct) && s.distResPct <= A.cfg.srNearPct;
  }

  function isLowNoise(s) {
    return s.avgWick < A.cfg.wickMax && s.notHesitant;
  }

  function isRrOk(s) {
    return Number.isFinite(s.rr) && s.rr >= A.cfg.rrMin;
  }

  function isRrStrong(s) {
    return Number.isFinite(s.rr) && s.rr >= A.cfg.rrStrong;
  }

  function isStopDistOk(s) {
    return Number.isFinite(s.stopDistPct) && s.stopDistPct >= A.cfg.stopMinPct && s.stopDistPct <= A.cfg.stopMaxPct;
  }

  function isTargetRoomOk(s) {
    return Number.isFinite(s.targetDistPct) && s.targetDistPct >= A.cfg.targetRoomMinPct;
  }

  function isStopSideValid(s) {
    if (!Number.isFinite(s.stop) || !Number.isFinite(s.entry)) return false;
    if (s.direction === "short") return s.stop > s.entry;
    return s.stop < s.entry;
  }

  function isTargetSideValid(s) {
    if (!Number.isFinite(s.target) || !Number.isFinite(s.entry)) return false;
    if (s.direction === "short") return s.target < s.entry;
    return s.target > s.entry;
  }

  function getAutoPresetForTab(tabLabel) {
    const label = String(tabLabel || "");
    const base = {
      grid: true,
      ema: true,
      vwap: false,
      bb: false,
      vol: true,
      sr: true,
      tl: false,
      fib: false,
      vp: false,
      trade: false,
      tradeZones: false,
    };

    if (label.includes("الرئيسية")) return { interval: "1d", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات النظرة العامة (D1)." };
    if (label.includes("فريم D1")) return { interval: "1d", layers: { ...base }, note: "تم تطبيق إعدادات فلترة الأصل على D1." };
    if (label.includes("فريم H4")) return { interval: "4h", layers: { ...base }, note: "تم تطبيق إعدادات صلاحية التوقيت على H4." };
    if (label.includes("فريم H1")) return { interval: "1h", layers: { ...base }, note: "تم تطبيق إعدادات المستوى الحاسم على H1." };
    if (label.includes("H1 أو M15")) return { interval: "1h", layers: { ...base }, note: "تم تطبيق إعدادات التأكيد (H1/M15)." };
    if (label.includes("فريم M15")) return { interval: "15m", layers: { ...base }, note: "تم تطبيق إعدادات التنفيذ الدقيق على M15." };
    if (label.includes("Stop Loss")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات الوقف (SL)." };
    if (label.includes("Take Profit")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات الهدف (TP)." };
    if (label.includes("ربط الفريمات")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات الربط بين الفريمات." };
    if (label.includes("لا تدخل")) return { interval: "1h", layers: { ...base }, note: "تم تطبيق وضع التحقق قبل الدخول." };
    if (label.includes("الأخطاء الشائعة")) return { interval: "1h", layers: { ...base }, note: "تم تطبيق إعدادات مراجعة الأخطاء." };
    if (label.includes("التسلسل العملي")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات التسلسل العملي." };
    if (label.includes("النسخة المختصرة")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات النسخة المختصرة." };
    if (label.includes("النموذج الذهني")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات النموذج الذهني." };
    if (label.includes("الجدول النهائي")) return { interval: "1h", layers: { ...base, trade: true, tradeZones: true }, note: "تم تطبيق إعدادات الجدول النهائي." };
    return null;
  }

  function getSnapshotForInterval(interval) {
    const key = String(interval || "").toLowerCase();
    const mtf = A.snapshot?.mtf;
    if (mtf && typeof mtf === "object") {
      const snap = mtf[key];
      if (snap) return snap;
    }
    if (String(A.snapshot?.interval || "").toLowerCase() === key) return A.snapshot;
    return null;
  }

  function readAnalysisSnapshot(sourceSnapshot = A.snapshot) {
    const p = sourceSnapshot;
    if (!p || !Array.isArray(p.candles) || !p.candles.length) return null;

    const last = p.candles[p.candles.length - 1];
    const prev = p.candles[p.candles.length - 2];

    const ema7 = latestFinite(p.ema7);
    const ema21 = latestFinite(p.ema21);
    const ema50 = latestFinite(p.ema50);
    const trendBull = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 > ema21 && ema21 > ema50 && last.c > ema21;
    const trendBear = Number.isFinite(ema7) && Number.isFinite(ema21) && Number.isFinite(ema50) && ema7 < ema21 && ema21 < ema50 && last.c < ema21;
    const trend = trendBull ? "bull" : trendBear ? "bear" : "side";

    const lookback = p.candles.slice(-Math.min(80, p.candles.length));
    let hi = -Infinity;
    let lo = Infinity;
    lookback.forEach((c) => {
      if (c.h > hi) hi = c.h;
      if (c.l < lo) lo = c.l;
    });
    const range = Math.max(hi - lo, 1e-9);
    const pos = (last.c - lo) / range;
    const inMiddle = pos > 0.4 && pos < 0.6;

    const supports = (p.sr?.supports || [])
      .map((x) => Number(x.price))
      .filter((x) => Number.isFinite(x) && x < last.c)
      .sort((a, b) => b - a);
    const resistances = (p.sr?.resistances || [])
      .map((x) => Number(x.price))
      .filter((x) => Number.isFinite(x) && x > last.c)
      .sort((a, b) => a - b);

    const nearestSupport = supports[0];
    const nearestResistance = resistances[0];
    const distSupPct = Number.isFinite(nearestSupport) ? Math.abs((last.c - nearestSupport) / last.c) * 100 : NaN;
    const distResPct = Number.isFinite(nearestResistance) ? Math.abs((nearestResistance - last.c) / last.c) * 100 : NaN;

    const wickWindow = p.candles.slice(-Math.min(20, p.candles.length));
    const avgWick = wickWindow.reduce((acc, c) => {
      const candleRange = Math.max(c.h - c.l, 1e-9);
      const body = Math.abs(c.c - c.o);
      return acc + (candleRange - body) / candleRange;
    }, 0) / Math.max(wickWindow.length, 1);

    const dojiCount = p.candles.slice(-5).filter((c) => {
      const candleRange = Math.max(c.h - c.l, 1e-9);
      return Math.abs(c.c - c.o) / candleRange < 0.2;
    }).length;
    const notHesitant = dojiCount <= 3;

    const bullBreak = !!(prev && last.c > prev.h && last.c > last.o);
    const bounceFromSupport = Number.isFinite(nearestSupport) && last.l <= nearestSupport * 1.002 && last.c > last.o;
    const confirmation = bullBreak || bounceFromSupport;

    const rr = Number(p.tradePlan?.rr);
    const direction = p.tradePlan?.direction === "short" ? "short" : "long";
    const entry = Number(p.tradePlan?.entry);
    const stop = Number(p.tradePlan?.stop);
    const target = Number(p.tradePlan?.target);
    const stopDistPct = Number.isFinite(entry) && Number.isFinite(stop) && entry > 0 ? Math.abs((entry - stop) / entry) * 100 : NaN;
    const targetDistPct = Number.isFinite(entry) && Number.isFinite(target) && entry > 0 ? Math.abs((target - entry) / entry) * 100 : NaN;

    return {
      trend,
      inMiddle,
      pos,
      distSupPct,
      distResPct,
      avgWick,
      confirmation,
      notHesitant,
      rr,
      direction,
      sourceInterval: String(p.interval || "").toLowerCase(),
      entry,
      stop,
      target,
      nearestSupport,
      nearestResistance,
      stopDistPct,
      targetDistPct,
    };
  }

  function getHomeDecision(s) {
    const hasTrend = s.trend !== "side";
    const nearSupport = isNearSupport(s);
    const nearResistance = isNearResistance(s);
    const timingOk = nearSupport || nearResistance;
    const rrOk = isRrOk(s);
    const lowNoise = isLowNoise(s);
    const structureOk = !s.inMiddle && lowNoise;
    const confirmationOk = s.confirmation;

    if (hasTrend && structureOk && timingOk && confirmationOk && rrOk) {
      return {
        state: "follow",
        text: "القرار الأولي: متابعة التحليل إلى D1 ثم H4.",
      };
    }

    if (!hasTrend || s.inMiddle || !lowNoise) {
      return {
        state: "exclude",
        text: "القرار الأولي: استبعاد الأصل حالياً (غياب وضوح كافٍ).",
      };
    }

    return {
      state: "wait",
      text: "القرار الأولي: انتظار تأكيد إضافي قبل المتابعة.",
    };
  }

  function getD1Decision(s) {
    const hasTrend = s.trend !== "side";
    const lowNoise = isLowNoise(s);
    const notMiddle = !s.inMiddle;
    const edgeScore = s.pos <= 0.3 || s.pos >= 0.7;

    if (hasTrend && lowNoise && notMiddle && edgeScore) {
      return {
        state: "follow",
        text: "حكم D1: الأصل صالح للمتابعة نحو H4.",
      };
    }

    if (!hasTrend || !lowNoise) {
      return {
        state: "exclude",
        text: "حكم D1: الأصل غير واضح على اليومي ويُستبعد حالياً.",
      };
    }

    return {
      state: "wait",
      text: "حكم D1: أصل مقبول جزئياً، الأفضل انتظار وضوح إضافي.",
    };
  }

  function getH4Decision(s) {
    const hasTrend = s.trend !== "side";
    const timingLevelOk = isNearSupport(s) || isNearResistance(s);
    const structureOk = !s.inMiddle && isLowNoise(s);
    const confirmationOk = s.confirmation;

    if (hasTrend && structureOk && timingLevelOk && confirmationOk) {
      return {
        state: "follow",
        text: "حكم H4: التوقيت صالح، انتقل لتحديد المستوى على H1.",
      };
    }

    if (!hasTrend || !structureOk) {
      return {
        state: "exclude",
        text: "حكم H4: التوقيت غير صالح حالياً، أوقف الفكرة مؤقتاً.",
      };
    }

    return {
      state: "wait",
      text: "حكم H4: أصل مقبول، لكن يحتاج تأكيد/تموضع أفضل قبل H1.",
    };
  }

  function getH1Decision(s) {
    const atEdge = s.pos <= 0.3 || s.pos >= 0.7;
    const levelNear = isNearSupport(s) || isNearResistance(s);
    const rrOk = isRrOk(s);
    const structureOk = !s.inMiddle && isLowNoise(s);

    if (atEdge && levelNear && rrOk && structureOk) {
      return {
        state: "follow",
        text: "حكم H1: المستوى الحاسم واضح، انتظر التأكيد النهائي.",
      };
    }

    if (!levelNear || s.inMiddle) {
      return {
        state: "exclude",
        text: "حكم H1: السعر خارج منطقة قرار جيدة، لا تبنِ الصفقة هنا.",
      };
    }

    return {
      state: "wait",
      text: "حكم H1: الفكرة محتملة، لكن تحتاج مستوى/تموضع أدق.",
    };
  }

  function getConfirmDecision(s) {
    const confirmationOk = s.confirmation;
    const lowNoise = isLowNoise(s);
    const rrOk = isRrOk(s);
    const notMiddle = !s.inMiddle;

    if (confirmationOk && lowNoise && rrOk && notMiddle) {
      return {
        state: "follow",
        text: "حكم التأكيد: الإشارة صالحة ويمكن الانتقال للتنفيذ.",
      };
    }

    if (!confirmationOk || !lowNoise) {
      return {
        state: "exclude",
        text: "حكم التأكيد: لا يوجد دليل فعلي كافٍ، لا دخول الآن.",
      };
    }

    return {
      state: "wait",
      text: "حكم التأكيد: توجد بوادر جيدة لكن يلزم تأكيد أقوى.",
    };
  }

  function getM15Decision(s) {
    const confirmationOk = s.confirmation;
    const stopDistOk = isStopDistOk(s);
    const rrStrong = isRrStrong(s);
    const notLate = isTargetRoomOk(s);

    if (confirmationOk && stopDistOk && rrStrong && notLate) {
      return {
        state: "follow",
        text: "حكم M15: التنفيذ صالح ويمكن الدخول المنضبط.",
      };
    }

    if (!confirmationOk || !stopDistOk) {
      return {
        state: "exclude",
        text: "حكم M15: التنفيذ غير صالح حالياً (تأكيد/وقف غير مناسب).",
      };
    }

    return {
      state: "wait",
      text: "حكم M15: الإشارة مقبولة جزئياً لكن يلزم تحسين نقطة التنفيذ.",
    };
  }

  function getStopLossDecision(s) {
    const stopValid = isStopSideValid(s);
    const stopDistOk = isStopDistOk(s);
    const nearLevel = s.direction === "short" ? isNearResistance(s) : isNearSupport(s);

    if (stopValid && stopDistOk && nearLevel) {
      return {
        state: "follow",
        text: "حكم SL: الوقف فني وصالح لإبطال الفكرة.",
      };
    }

    if (!stopValid || !stopDistOk) {
      return {
        state: "exclude",
        text: "حكم SL: الوقف غير صالح (اتجاه أو مسافة غير منطقية).",
      };
    }

    return {
      state: "wait",
      text: "حكم SL: الوقف مقبول جزئياً ويحتاج ربط أوضح بالبنية.",
    };
  }

  function getTakeProfitDecision(s) {
    const targetValid = isTargetSideValid(s);
    const hasLogicalZone = s.direction === "short" ? Number.isFinite(s.nearestSupport) : Number.isFinite(s.nearestResistance);
    const rrOk = isRrOk(s);
    const targetRoomOk = isTargetRoomOk(s);

    if (targetValid && hasLogicalZone && rrOk && targetRoomOk) {
      return {
        state: "follow",
        text: "حكم TP: الهدف فني وواقعي وقابل للوصول.",
      };
    }

    if (!targetValid || !rrOk || !targetRoomOk) {
      return {
        state: "exclude",
        text: "حكم TP: الهدف غير مناسب حالياً (الاتجاه/المسافة/RR).",
      };
    }

    return {
      state: "wait",
      text: "حكم TP: الهدف مقبول جزئياً ويحتاج مستوى مقاومة منطقي أوضح.",
    };
  }

  function getFramesAlignmentDecision(s) {
    const hasTrend = s.trend !== "side";
    const timingOk = isNearSupport(s) || isNearResistance(s);
    const levelOk = !s.inMiddle && (s.pos <= 0.3 || s.pos >= 0.7);
    const confirmOk = s.confirmation;
    const executionOk = isStopDistOk(s) && isRrOk(s);

    if (hasTrend && timingOk && levelOk && confirmOk && executionOk) {
      return {
        state: "follow",
        text: "حكم الربط: الفريمات متوافقة والصفقة مكتملة العناصر.",
      };
    }

    if (!hasTrend || !levelOk) {
      return {
        state: "exclude",
        text: "حكم الربط: التوافق غير كافٍ، لا تعتمد الفكرة حالياً.",
      };
    }

    return {
      state: "wait",
      text: "حكم الربط: جزء من الشروط متحقق، أكمل التحقق قبل التنفيذ.",
    };
  }

  function getNoEntryDecision(s) {
    const hasTrend = s.trend !== "side";
    const inMiddle = s.inMiddle;
    const confirmationMissing = !s.confirmation;
    const rrWeak = !isRrOk(s);
    const stopInvalid = !isStopDistOk(s);
    const noisy = !isLowNoise(s);

    const redFlagCount = [!hasTrend, inMiddle, confirmationMissing, rrWeak, stopInvalid, noisy].filter(Boolean).length;

    if (redFlagCount >= 2) {
      return {
        state: "exclude",
        text: "قرار لا تدخل: توجد إشارات منع كافية، الأفضل إلغاء الدخول الآن.",
        redFlagCount,
      };
    }

    if (redFlagCount === 1) {
      return {
        state: "wait",
        text: "قرار لا تدخل: يوجد تحذير واحد، انتظر وضوحاً أكبر قبل التنفيذ.",
        redFlagCount,
      };
    }

    return {
      state: "follow",
      text: "قرار لا تدخل: لا توجد إشارات منع قوية حالياً، الدخول مقبول بشروط.",
      redFlagCount,
    };
  }

  function getCommonMistakesDecision(s, snapshot) {
    const startedFromM15 = String(snapshot?.interval || "").toLowerCase() === "15m";
    const trendOnlyBias = s.trend !== "side" && s.inMiddle;
    const chasingEntry = Number.isFinite(s.targetDistPct) && s.targetDistPct < A.cfg.targetRoomMinPct;
    const weakRR = !isRrOk(s);
    const noConfirmation = !s.confirmation;
    const noisyStructure = !isLowNoise(s);

    const mistakes = [startedFromM15, trendOnlyBias, chasingEntry, weakRR, noConfirmation, noisyStructure].filter(Boolean).length;

    if (mistakes >= 3) {
      return {
        state: "exclude",
        text: "تشخيص الأخطاء: توجد أخطاء حرجة متعددة، أوقف التنفيذ وصحح المنهج.",
        count: mistakes,
      };
    }

    if (mistakes >= 1) {
      return {
        state: "wait",
        text: "تشخيص الأخطاء: توجد أخطاء تحتاج تصحيح قبل أي دخول.",
        count: mistakes,
      };
    }

    return {
      state: "follow",
      text: "تشخيص الأخطاء: الانضباط جيد ولا تظهر أخطاء تشغيلية واضحة.",
      count: mistakes,
    };
  }

  function getPracticalSequenceDecision(s) {
    const d1Ok = s.trend !== "side" && isLowNoise(s);
    const h4h1Ok = !s.inMiddle && (isNearSupport(s) || isNearResistance(s));
    const m15Ok = s.confirmation && isRrOk(s) && isStopDistOk(s);

    const stepsOk = [d1Ok, h4h1Ok, m15Ok].filter(Boolean).length;

    if (stepsOk === 3) {
      return {
        state: "follow",
        text: "حكم التسلسل: جميع المراحل متحققة والتنفيذ منضبط.",
        stepsOk,
      };
    }

    if (stepsOk <= 1) {
      return {
        state: "exclude",
        text: "حكم التسلسل: المنهج غير مكتمل حالياً، لا تنفذ الصفقة.",
        stepsOk,
      };
    }

    return {
      state: "wait",
      text: "حكم التسلسل: جزء كبير متحقق، أكمل المرحلة الناقصة قبل الدخول.",
      stepsOk,
    };
  }

  function getCompactDecision(s) {
    const d1Ok = s.trend !== "side" && isLowNoise(s);
    const h4Ok = isNearSupport(s) || isNearResistance(s);
    const h1Ok = !s.inMiddle && (s.pos <= 0.3 || s.pos >= 0.7);
    const m15Ok = s.confirmation && isRrOk(s);

    const score = [d1Ok, h4Ok, h1Ok, m15Ok].filter(Boolean).length;

    if (score === 4) {
      return {
        state: "follow",
        text: "النسخة المختصرة: كل العناصر الأربع متوافقة.",
        score,
      };
    }

    if (score <= 2) {
      return {
        state: "exclude",
        text: "النسخة المختصرة: الشروط الأساسية غير مكتملة.",
        score,
      };
    }

    return {
      state: "wait",
      text: "النسخة المختصرة: الوضع متوسط، يلزم شرط إضافي قبل التنفيذ.",
      score,
    };
  }

  function getMindsetDecision(s) {
    const q1 = s.trend !== "side" && isLowNoise(s);
    const q2 = isNearSupport(s) || isNearResistance(s);
    const q3 = !s.inMiddle && (s.pos <= 0.3 || s.pos >= 0.7);
    const q4 = s.confirmation;
    const q5 = isRrOk(s) && isStopDistOk(s) && isTargetRoomOk(s);

    const score = [q1, q2, q3, q4, q5].filter(Boolean).length;

    if (score === 5) {
      return {
        state: "follow",
        text: "النموذج الذهني: إجابات منضبطة بالكامل.",
        score,
      };
    }

    if (score <= 2) {
      return {
        state: "exclude",
        text: "النموذج الذهني: طريقة التفكير الحالية غير منضبطة.",
        score,
      };
    }

    return {
      state: "wait",
      text: "النموذج الذهني: هناك تحسن، لكن يلزم استكمال أسئلة الانضباط.",
      score,
    };
  }

  function getFinalTableDecision(s) {
    const trendOk = s.trend !== "side" && isLowNoise(s);
    const timingOk = isNearSupport(s) || isNearResistance(s);
    const levelOk = !s.inMiddle && (s.pos <= 0.3 || s.pos >= 0.7);
    const confirmOk = s.confirmation;
    const executionOk = isStopDistOk(s) && isTargetRoomOk(s) && isRrOk(s);

    const score = [trendOk, timingOk, levelOk, confirmOk, executionOk].filter(Boolean).length;

    if (score === 5) {
      return {
        state: "follow",
        text: "الجدول النهائي: الصفقة مكتملة المعايير وجاهزة للتنفيذ.",
        score,
      };
    }

    if (score <= 2) {
      return {
        state: "exclude",
        text: "الجدول النهائي: المعايير غير كافية، يفضّل عدم الدخول.",
        score,
      };
    }

    return {
      state: "wait",
      text: "الجدول النهائي: التقييم متوسط، استكمل الشروط قبل القرار.",
      score,
    };
  }

  function getMtfFrames() {
    return {
      d1: readAnalysisSnapshot(getSnapshotForInterval("1d")),
      h4: readAnalysisSnapshot(getSnapshotForInterval("4h")),
      h1: readAnalysisSnapshot(getSnapshotForInterval("1h")),
      m15: readAnalysisSnapshot(getSnapshotForInterval("15m")),
    };
  }

  function getMtfAlignment(frames) {
    const d1Ok = !!frames.d1 && frames.d1.trend !== "side" && isLowNoise(frames.d1);
    const h4Ok = !!frames.h4 && !frames.h4.inMiddle && (isNearSupport(frames.h4) || isNearResistance(frames.h4));
    const h1Ok = !!frames.h1 && !frames.h1.inMiddle && (frames.h1.pos <= 0.3 || frames.h1.pos >= 0.7);
    const m15Ok = !!frames.m15 && frames.m15.confirmation && isRrOk(frames.m15) && isStopDistOk(frames.m15);
    const score = [d1Ok, h4Ok, h1Ok, m15Ok].filter(Boolean).length;
    const complete = [frames.d1, frames.h4, frames.h1, frames.m15].every(Boolean);
    return { d1Ok, h4Ok, h1Ok, m15Ok, score, complete };
  }

  function buildChecklistForTab(tabLabel) {
    if (!A.snapshot || A.snapshot.fetching) {
      return [makeCheck(null, "جاري تحليل الشروط بعد تحميل البيانات...")];
    }

    const label = String(tabLabel || "");
    const preset = getAutoPresetForTab(label);
    const expectedInterval = String(preset?.interval || "");
    const currentInterval = String(A.snapshot?.interval || "");
    const frames = getMtfFrames();
    const expectedSourceSnapshot = expectedInterval ? getSnapshotForInterval(expectedInterval) : null;
    const expectedSnapshot = expectedSourceSnapshot ? readAnalysisSnapshot(expectedSourceSnapshot) : null;
    const currentSourceSnapshot = A.snapshot;
    const currentSnapshot = readAnalysisSnapshot(currentSourceSnapshot);
    const s = expectedSnapshot || currentSnapshot;
    if (!s) return [makeCheck(null, "لا توجد بيانات كافية للتحليل.")];

    const sourceInterval = String(s.sourceInterval || currentInterval || "");
    const hasTrend = s.trend !== "side";
    const nearSupport = isNearSupport(s);
    const nearResistance = isNearResistance(s);
    const atEdge = s.pos <= 0.3 || s.pos >= 0.7;
    const rrOk = isRrOk(s);
    const rrStrong = isRrStrong(s);
    const stopValid = isStopSideValid(s);
    const stopDistOk = isStopDistOk(s);
    const targetValid = isTargetSideValid(s);
    const lowNoise = isLowNoise(s);

    const pct = (v) => (Number.isFinite(v) ? `${v.toFixed(2)}%` : "-");
    const rrTxt = Number.isFinite(s.rr) ? s.rr.toFixed(2) : "-";
    const confidence = getCoreConfidence(s);

    const baseRows = [];
    if (A.snapshot?.mtfFetching) {
      baseRows.push(makeCheck(null, "جاري تحديث مقارنة الفريمات (D1/H4/H1/M15)...", "wait"));
    }

    if (expectedInterval && !expectedSnapshot) {
      baseRows.push(
        makeCheck(
          null,
          `تنبيه فريم: لا توجد بيانات كافية حالياً لفريم ${intervalLabel(expectedInterval)}.`,
          "wait"
        )
      );
    } else if (expectedInterval && currentInterval && expectedInterval !== currentInterval) {
      baseRows.push(makeCheck(null, `مصدر التحليل لهذا التبويب: ${intervalLabel(expectedInterval)} (من تعدد الفريمات).`));
    }

    const sourceSnapshot = getSnapshotForInterval(sourceInterval || expectedInterval || currentInterval) || currentSourceSnapshot;
    const sourceCandles = Array.isArray(sourceSnapshot?.candles) ? sourceSnapshot.candles : [];
    const lastCandleTs = Number(sourceCandles[sourceCandles.length - 1]?.t);
    const intervalMs = intervalToMs(sourceInterval || expectedInterval);
    if (Number.isFinite(lastCandleTs) && Number.isFinite(intervalMs) && intervalMs > 0) {
      const lagMs = Date.now() - lastCandleTs;
      if (lagMs > intervalMs * 3.2) {
        const lagIntervals = (lagMs / intervalMs).toFixed(1);
        baseRows.push(makeCheck(null, `تنبيه بيانات: آخر شمعة متأخرة (${lagIntervals} فريم تقريباً).`, "wait"));
      }
    }

    baseRows.push(
      makeCheck(
        null,
        `ملخص سريع: الاتجاه ${trendLabel(s.trend)} | موضع السعر ${Math.round(s.pos * 100)}% | RR ${rrTxt} | الثقة ${confidence.level} (${confidence.score}/5).`
      )
    );
    baseRows.push(makeCheck(null, `ملاحظة: هذا الحكم آلي مبني على الفريم ${intervalLabel(sourceInterval || expectedInterval || currentInterval)}.`));

    if (label.includes("الرئيسية")) {
      const mtf = getMtfAlignment(frames);
      const fallbackDecision = getHomeDecision(s);
      const decision = mtf.complete
        ? (mtf.score >= 4
            ? { state: "follow", text: "الحكم العام: توافق قوي بين D1/H4/H1/M15." }
            : mtf.score <= 1
              ? { state: "exclude", text: "الحكم العام: توافق ضعيف بين الفريمات، الأفضل الاستبعاد." }
              : { state: "wait", text: "الحكم العام: توافق جزئي بين الفريمات، انتظر اكتمال الشروط." })
        : fallbackDecision;
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(mtf.d1Ok, "D1: فلترة الأصل والاتجاه مقبولة."),
        makeCheck(mtf.h4Ok, "H4: التوقيت قريب من منطقة صالحة."),
        makeCheck(mtf.h1Ok, "H1: السعر عند مستوى حاسم وليس في المنتصف."),
        makeCheck(mtf.m15Ok, "M15: التأكيد والتنفيذ (SL/RR) مقبولان."),
        makeCheck(hasTrend, `الاتجاه واضح (${trendLabel(s.trend)}).`),
        makeCheck(!s.inMiddle && lowNoise, "السوق منظم (ليس في المنتصف وضجيج مقبول)."),
        makeCheck(nearSupport || nearResistance, `المستوى القريب صالح (دعم ${pct(s.distSupPct)} | مقاومة ${pct(s.distResPct)}).`),
        makeCheck(s.confirmation, "يوجد دليل فعلي (اختراق/ارتداد)."),
        makeCheck(rrOk, `نسبة RR الحالية مناسبة (${rrTxt}).`),
      ];
    }
    if (label.includes("فريم D1")) {
      const decision = getD1Decision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(hasTrend, "الاتجاه العام على D1 واضح وغير عرضي."),
        makeCheck(!s.inMiddle, `السعر ليس في منتصف النطاق (موضعه ${Math.round(s.pos * 100)}%).`),
        makeCheck(lowNoise, "البنية نظيفة (ذيول/تردد ضمن المقبول)."),
        makeCheck(s.pos <= 0.3 || s.pos >= 0.7, "تموضع السعر يميل للحافة وليس الوسط."),
      ];
    }
    if (label.includes("فريم H4")) {
      const decision = getH4Decision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(hasTrend, "توقيت H4 متماسك مع الاتجاه العام."),
        makeCheck(nearSupport || nearResistance, `السعر قرب مستوى صالح (دعم ${pct(s.distSupPct)} | مقاومة ${pct(s.distResPct)}).`),
        makeCheck(!s.inMiddle, "السعر ليس في وسط النطاق على H4."),
        makeCheck(s.confirmation, "ظهرت علامة دعم التوقيت (ارتداد/اختراق)."),
      ];
    }
    if (label.includes("فريم H1")) {
      const decision = getH1Decision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(atEdge, `السعر عند الحافة وليس المنتصف (الموضع ${Math.round(s.pos * 100)}%).`),
        makeCheck(nearSupport || nearResistance, "يوجد مستوى حاسم قريب يمكن البناء عليه."),
        makeCheck(!s.inMiddle, "السعر ليس في منتصف النطاق على H1."),
        makeCheck(rrOk, `RR على H1 مقبولة (${rrTxt}).`),
      ];
    }
    if (label.includes("H1 أو M15")) {
      const m15 = frames.m15;
      const m15Confirm = !!m15?.confirmation;
      const m15Exec = !!m15 && isRrOk(m15) && isStopDistOk(m15);
      const decision = getConfirmDecision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(s.confirmation, "التأكيد تحقق (اختراق/ارتداد)."),
        makeCheck(m15Confirm, "تأكيد M15 متوفر ويدعم إشارة H1."),
        makeCheck(m15Exec, "تنفيذ M15 (RR + SL) ضمن المعايير."),
        makeCheck(lowNoise, "السلوك السعري غير متردد قرب المستوى."),
        makeCheck(!s.inMiddle, "الإشارة ليست من منتصف النطاق."),
        makeCheck(rrOk, `RR بعد التأكيد ما زالت جيدة (${rrTxt}).`),
      ];
    }
    if (label.includes("فريم M15")) {
      const decision = getM15Decision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(s.confirmation, "إشارة الدخول على M15 واضحة."),
        makeCheck(stopDistOk, `الوقف غير مبالغ (مسافة الوقف ${pct(s.stopDistPct)}).`),
        makeCheck(isTargetRoomOk(s), `المسافة المتبقية للهدف منطقية (${pct(s.targetDistPct)}).`),
        makeCheck(rrStrong, `RR التنفيذ قوية (${rrTxt}).`),
      ];
    }
    if (label.includes("Stop Loss")) {
      const decision = getStopLossDecision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      const sideTxt = s.direction === "short" ? "أعلى الدخول" : "أسفل الدخول";
      const levelLinkOk = s.direction === "short" ? nearResistance : nearSupport;
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(stopValid, `الوقف موضوع في جهة إبطال الفكرة (${sideTxt}).`),
        makeCheck(stopDistOk, `مسافة الوقف تنفيذية (${pct(s.stopDistPct)}).`),
        makeCheck(levelLinkOk, "الوقف مرتبط ببنية سعرية قريبة."),
        makeCheck(!s.inMiddle, "الوقف ليس مبنياً على دخول من منتصف النطاق."),
      ];
    }
    if (label.includes("Take Profit")) {
      const decision = getTakeProfitDecision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      const hasLogicalZone = s.direction === "short" ? Number.isFinite(s.nearestSupport) : Number.isFinite(s.nearestResistance);
      return [
        ...baseRows,
        makeCheck(decisionState, decision.text, decision.state),
        makeCheck(targetValid, "الهدف في الاتجاه الصحيح بالنسبة لاتجاه الصفقة."),
        makeCheck(hasLogicalZone, s.direction === "short" ? `يوجد دعم منطقي أسفل السعر (${pct(s.distSupPct)}).` : `توجد مقاومة منطقية أعلى السعر (${pct(s.distResPct)}).`),
        makeCheck(isTargetRoomOk(s), `المسافة إلى الهدف منطقية (${pct(s.targetDistPct)}).`),
        makeCheck(rrOk, `العائد/المخاطرة يدعم الهدف (${rrTxt}).`),
      ];
    }
    if (label.includes("ربط الفريمات")) {
      const mtf = getMtfAlignment(frames);
      const decision = mtf.score >= 4
        ? { state: "follow", text: "حكم الربط: الفريمات الأربعة متوافقة.", score: mtf.score }
        : mtf.score <= 1
          ? { state: "exclude", text: "حكم الربط: ضعف واضح في التوافق بين الفريمات.", score: mtf.score }
          : { state: "wait", text: "حكم الربط: توافق جزئي، انتظر اكتمال الفريمات الناقصة.", score: mtf.score };
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (النتيجة: ${mtf.score}/4)`, decision.state),
        makeCheck(mtf.d1Ok, "عنصر D1 (الاتجاه/الفلترة) متحقق."),
        makeCheck(mtf.h4Ok, "عنصر H4 (التوقيت) متحقق."),
        makeCheck(mtf.h1Ok, "عنصر H1 (المستوى الحاسم) متحقق."),
        makeCheck(mtf.m15Ok, "عنصر M15 (التأكيد/التنفيذ) متحقق."),
      ];
    }
    if (label.includes("لا تدخل")) {
      const decision = getNoEntryDecision(s);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (عدد إشارات المنع: ${decision.redFlagCount})`, decision.state),
        makeCheck(hasTrend, "لا يوجد خلل واضح في الاتجاه العام."),
        makeCheck(!s.inMiddle, "السعر ليس في منتصف النطاق."),
        makeCheck(s.confirmation, "يوجد تأكيد فعلي قبل الدخول."),
        makeCheck(rrOk, `RR ليست ضعيفة (${rrTxt}).`),
        makeCheck(lowNoise, "الحركة ليست عشوائية بشكل مفرط."),
      ];
    }
    if (label.includes("الأخطاء الشائعة")) {
      const decision = getCommonMistakesDecision(s, A.snapshot);
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      const startedFromM15 = String(A.snapshot?.interval || "").toLowerCase() === "15m";
      const chasingEntry = Number.isFinite(s.targetDistPct) && s.targetDistPct < A.cfg.targetRoomMinPct;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (عدد الأخطاء: ${decision.count})`, decision.state),
        makeCheck(!startedFromM15, "لم يتم البدء مباشرة من M15."),
        makeCheck(!(hasTrend && s.inMiddle), "القرار ليس مبنياً على اتجاه فقط من منتصف النطاق."),
        makeCheck(!chasingEntry, "لا توجد مطاردة متأخرة للحركة."),
        makeCheck(s.confirmation, "لا يوجد دخول بدون تأكيد فعلي."),
        makeCheck(rrOk, `RR ليست ضعيفة (${rrTxt}).`),
      ];
    }
    if (label.includes("التسلسل العملي")) {
      const mtf = getMtfAlignment(frames);
      const stepsOk = [mtf.d1Ok, mtf.h4Ok && mtf.h1Ok, mtf.m15Ok].filter(Boolean).length;
      const decision = stepsOk === 3
        ? { state: "follow", text: "حكم التسلسل: جميع المراحل متحققة.", stepsOk }
        : stepsOk <= 1
          ? { state: "exclude", text: "حكم التسلسل: مراحل أساسية غير متحققة.", stepsOk }
          : { state: "wait", text: "حكم التسلسل: مرحلة واحدة ناقصة قبل التنفيذ.", stepsOk };
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      const d1Ok = mtf.d1Ok;
      const h4h1Ok = mtf.h4Ok && mtf.h1Ok;
      const m15Ok = mtf.m15Ok;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (مراحل متحققة: ${decision.stepsOk}/3)`, decision.state),
        makeCheck(d1Ok, "مرحلة D1: فلترة الأصل والاتجاه واضحة."),
        makeCheck(h4h1Ok, "مرحلة H4/H1: التوقيت والمستوى الحاسم مقبولان."),
        makeCheck(m15Ok, "مرحلة M15: التأكيد والتنفيذ (SL+RR) متحققان."),
      ];
    }
    if (label.includes("النسخة المختصرة")) {
      const mtf = getMtfAlignment(frames);
      const score = [mtf.d1Ok, mtf.h4Ok, mtf.h1Ok, mtf.m15Ok].filter(Boolean).length;
      const decision = score === 4
        ? { state: "follow", text: "النسخة المختصرة: كل العناصر الأربع متوافقة.", score }
        : score <= 2
          ? { state: "exclude", text: "النسخة المختصرة: الشروط الأساسية غير مكتملة.", score }
          : { state: "wait", text: "النسخة المختصرة: الوضع متوسط، يلزم شرط إضافي.", score };
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      const d1Ok = mtf.d1Ok;
      const h4Ok = mtf.h4Ok;
      const h1Ok = mtf.h1Ok;
      const m15Ok = mtf.m15Ok;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (النتيجة: ${decision.score}/4)`, decision.state),
        makeCheck(d1Ok, "D1: فلترة الاتجاه والأصل مقبولة."),
        makeCheck(h4Ok, "H4: التوقيت قريب من مستوى صالح."),
        makeCheck(h1Ok, "H1: السعر عند منطقة قرار واضحة."),
        makeCheck(m15Ok, "M15: التأكيد وRR مقبولان."),
      ];
    }
    if (label.includes("النموذج الذهني")) {
      const mtf = getMtfAlignment(frames);
      const q1 = mtf.d1Ok;
      const q2 = mtf.h4Ok;
      const q3 = mtf.h1Ok;
      const q4 = mtf.m15Ok;
      const q5 = rrOk && stopDistOk && isTargetRoomOk(s);
      const score = [q1, q2, q3, q4, q5].filter(Boolean).length;
      const decision = score === 5
        ? { state: "follow", text: "النموذج الذهني: إجابات منضبطة بالكامل.", score }
        : score <= 2
          ? { state: "exclude", text: "النموذج الذهني: طريقة التقييم غير مكتملة.", score }
          : { state: "wait", text: "النموذج الذهني: جيد جزئياً ويحتاج استكمال.", score };
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (النتيجة: ${decision.score}/5)`, decision.state),
        makeCheck(q1, "سؤال 1: هل الأصل صالح على D1؟"),
        makeCheck(q2, "سؤال 2: هل التوقيت مناسب على H4؟"),
        makeCheck(q3, "سؤال 3: هل السعر عند مستوى حاسم على H1؟"),
        makeCheck(q4, "سؤال 4: هل ظهر تأكيد فعلي على H1 أو M15؟"),
        makeCheck(q5, "سؤال 5: هل الوقف فني والهدف واقعي وRR جيدة؟"),
      ];
    }
    if (label.includes("الجدول النهائي")) {
      const mtf = getMtfAlignment(frames);
      const trendOk = mtf.d1Ok;
      const timingOk = mtf.h4Ok;
      const levelOk = mtf.h1Ok;
      const confirmOk = mtf.m15Ok;
      const executionOk = stopValid && targetValid && rrOk && stopDistOk && isTargetRoomOk(s);
      const score = [trendOk, timingOk, levelOk, confirmOk, executionOk].filter(Boolean).length;
      const decision = score === 5
        ? { state: "follow", text: "الجدول النهائي: الصفقة مكتملة المعايير.", score }
        : score <= 2
          ? { state: "exclude", text: "الجدول النهائي: المعايير غير كافية.", score }
          : { state: "wait", text: "الجدول النهائي: التقييم متوسط.", score };
      const decisionState = decision.state === "follow" ? true : decision.state === "exclude" ? false : null;
      return [
        ...baseRows,
        makeCheck(decisionState, `${decision.text} (النتيجة: ${decision.score}/5)`, decision.state),
        makeCheck(trendOk, "الاتجاه العام: متوافق."),
        makeCheck(timingOk, "صلاحية التوقيت: متوافقة."),
        makeCheck(levelOk, "المستوى الحاسم: واضح."),
        makeCheck(confirmOk, "التأكيد: متحقق."),
        makeCheck(executionOk, `التنفيذ (SL/TP/RR): ضمن المعايير (${rrTxt}).`),
      ];
    }

    return [
      ...baseRows,
      makeCheck(hasTrend, "الاتجاه العام واضح."),
      makeCheck(s.confirmation, "التأكيد حاضر."),
      makeCheck(rrOk, `RR مناسبة (${rrTxt}).`),
    ];
  }

  function renderChecklist() {
    if (!autoChecklist) return;
    const checks = buildChecklistForTab(A.activeTabLabel);
    const items = checks.map((c) => {
      const li = document.createElement("li");
      const txt = document.createElement("span");
      txt.className = "txt";
      txt.textContent = c.text;
      if (c.decision === "follow" || c.decision === "wait" || c.decision === "exclude") {
        const badge = document.createElement("span");
        badge.className = `decision-badge ${c.decision}`;
        badge.textContent = c.decision === "follow" ? "FOLLOW" : c.decision === "wait" ? "WAIT" : "EXCLUDE";
        li.append(badge, txt);
      } else {
        const mark = document.createElement("span");
        mark.className = c.ok === true ? "ok" : c.ok === false ? "warn" : "neutral";
        mark.textContent = c.ok === true ? "✓" : c.ok === false ? "✕" : "•";
        li.append(mark, txt);
      }
      return li;
    });
    autoChecklist.replaceChildren(...items);

    if (autoNote) {
      const decisionRow = checks.find((c) => c.decision === "follow" || c.decision === "wait" || c.decision === "exclude");
      const s = readAnalysisSnapshot();
      if (decisionRow && s) {
        const confidence = getCoreConfidence(s);
        const iv = intervalLabel(s.sourceInterval || A.snapshot?.interval || "");
        const rrTxt = Number.isFinite(s.rr) ? s.rr.toFixed(2) : "-";
        autoNote.textContent = `المساعد التلقائي: ${decisionRow.decision?.toUpperCase()} | الوضع ${profileLabel(A.profile)} | الثقة ${confidence.level} (${confidence.score}/5) | RR ${rrTxt} | فريم ${iv}`;
      } else {
        autoNote.textContent = `المساعد التلقائي: ${A.lastPresetNote || "مفعل"}`;
      }
    }
  }

  function queueRenderChecklist() {
    if (A.renderQueued) return;
    A.renderQueued = true;
    requestAnimationFrame(() => {
      A.renderQueued = false;
      renderChecklist();
    });
  }

  function applyCfg(nextCfg, { persist = true, announce = false } = {}) {
    A.cfg = normalizeCfg(nextCfg);
    A.profile = detectProfileByCfg(A.cfg);
    if (persist) saveCfg();
    if (persist) saveProfile(A.profile);
    syncCfgInputs();
    if (announce && autoNote) {
      autoNote.textContent = `المساعد التلقائي: تم تحديث الإعدادات (الوضع ${profileLabel(A.profile)}).`;
    }
    queueRenderChecklist();
  }

  function applyProfile(profile, { persist = true, announce = false } = {}) {
    const key = profile in CFG_PROFILES ? profile : "balanced";
    A.profile = key;
    applyCfg(CFG_PROFILES[key], { persist, announce: false });
    A.profile = key;
    if (persist) saveProfile(key);
    syncProfileSelect();
    if (announce && autoNote) {
      autoNote.textContent = `المساعد التلقائي: تم تفعيل الوضع ${profileLabel(key)}.`;
    }
    queueRenderChecklist();
  }

  function applyPresetFromTab(tabLabel, { silent = false } = {}) {
    A.activeTabLabel = String(tabLabel || "");
    const preset = getAutoPresetForTab(A.activeTabLabel);
    if (preset) {
      document.dispatchEvent(new CustomEvent("assistant:apply-preset", { detail: preset }));
      A.lastPresetNote = preset.note || "مفعل";
      if (autoNote) autoNote.textContent = silent ? "المساعد التلقائي: مفعل" : `المساعد التلقائي: ${A.lastPresetNote}`;
    } else if (autoNote) {
      A.lastPresetNote = "مفعل";
      autoNote.textContent = "المساعد التلقائي: مفعل";
    }
    queueRenderChecklist();
  }

  document.addEventListener("content:tab-change", (e) => {
    applyPresetFromTab(e.detail?.label || "");
  });

  document.addEventListener("chart:snapshot", (e) => {
    A.snapshot = e.detail || null;
    queueRenderChecklist();
  });

  document.addEventListener("chart:ready", () => {
    if (A.activeTabLabel) applyPresetFromTab(A.activeTabLabel, { silent: true });
  });

  if (profileApplyBtn) {
    profileApplyBtn.addEventListener("click", () => {
      const selected = profileSelect?.value || "balanced";
      applyProfile(selected, { persist: true, announce: true });
    });
  }

  A.cfg = loadCfg();
  const storedProfile = loadProfile();
  const detectedProfile = detectProfileByCfg(A.cfg);
  A.profile = storedProfile && storedProfile in CFG_PROFILES ? storedProfile : detectedProfile;
  A.cfg = normalizeCfg(A.cfg);
  syncCfgInputs();

  const initialTabLabel = document.querySelector(".panel.active")?.dataset?.tabLabel || "";
  if (assistantConfig) assistantConfig.open = false;
  if (initialTabLabel) applyPresetFromTab(initialTabLabel, { silent: true });
  else queueRenderChecklist();
})();

