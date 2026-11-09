(function (global) {
  const ASSISTANT = global.AtlasFlowAssistant || {};

  // --- Layer 1: Helpers (Shared Analysis Logic) ---

  const isRROk = (s, cfg) => (s.rr || 0) >= (cfg.rrMin || 2);
  const isStopSafe = (s, cfg) => {
    if (!s.stopDistPct || !s.noiseLevel) return false;
    const threshold = s.noiseLevel === "high" ? 6 : 3;
    const correctSide = s.direction === "long" ? s.timingSide === "support" : s.timingSide === "resistance";
    return s.stopDistPct < 15 && correctSide;
  };

  const isTrendStrong = (s) => s.trend !== "side";
  
  const getAlignmentScore = (s) => {
    if (!s.mtf) return 0;
    let score = 0;
    const frames = ["1d", "4h", "1h", "15m"];
    frames.forEach(f => {
      if (s.mtf[f]?.trend === s.trend) score += 0.25;
    });
    return score;
  };

  // --- Layer 2: Tab Builders ---

  function buildGeneralDecision(s, cfg) {
    const rrPass = isRROk(s, cfg);
    const trendPass = isTrendStrong(s);
    const confirmPass = s.confirmation;
    const posPass = !s.inMiddle;

    let state = "wait";
    if (trendPass && confirmPass && posPass && rrPass) state = "follow";
    else if (!trendPass || s.alignmentBias === "clash") state = "exclude";

    return {
      state,
      title: "التحليل العام للمركز",
      message: state === "follow" ? "الصفقة متكاملة الأركان وقابلة للمتابعة." : 
               state === "exclude" ? "سيولة السوق متضاربة أو الاتجاه ضعيف حالياً." : "بنية الصفقة جيدة لكن ينقصها التأكيد أو التوقيت.",
      reasons: [
        trendPass ? "الاتجاه متوافق" : "تذبذب في الاتجاه العام",
        confirmPass ? "تم رصد تأكيد فني" : "انتظار إشارة تأكيد (Price Action)",
        posPass ? "السعر عند منطقة حاسمة" : "السعر في منتصف النطاق"
      ],
      checklist: [
        { label: "التوافق مع الاتجاه", pass: trendPass },
        { label: "وجود تأكيد فني", pass: confirmPass },
        { label: "جودة العائد (RR)", pass: rrPass },
        { label: "موقع التنفيذ", pass: posPass }
      ]
    };
  }

  function buildSLDecision(s, cfg) {
    const safe = isStopSafe(s, cfg);
    const correctSide = s.direction === "long" ? s.timingSide === "support" : s.timingSide === "resistance";
    
    let state = safe ? "follow" : (correctSide ? "wait" : "exclude");

    return {
      state,
      title: "إدارة وقف الخسارة (SL)",
      message: safe ? "مكان الوقف منطقي ومحمي خلف مستوى فني." : 
               !correctSide ? "تحذير: الوقف غير مناسب للاتجاه الحالي." : "الوقف قد يكون قريباً جداً من 'ضجيج' السوق الحالي.",
      reasons: [
        correctSide ? "التموضع خلف مستوى فني" : "الوقف مكشوف فنياً",
        s.stopDistPct < 10 ? "مسافة الوقف مثالية" : "مسافة الوقف واسعة نسبياً",
        s.noiseLevel !== "high" ? "تذبذب السوق مستقر" : "تذبذب عالٍ يهدد الوقف"
      ],
      checklist: [
        { label: "خلف مستوى دعم/مقاومة", pass: correctSide },
        { label: "خارج منطقة الضجيج", pass: safe },
        { label: "ضمن حدود المخاطرة", pass: s.stopDistPct < 15 }
      ]
    };
  }

  function buildTPDecision(s, cfg) {
    const rrPass = isRROk(s, cfg);
    const reachable = s.targetDistPct > 3 && s.targetDistPct < 25;
    
    let state = (rrPass && reachable) ? "follow" : (rrPass ? "wait" : "exclude");

    return {
      state,
      title: "إدارة الأهداف (TP)",
      message: state === "follow" ? "الهدف واقعي وهناك مساحة كافية للحركة." : 
               !rrPass ? "العائد المتوقع لا يستحق المخاطرة." : "الهدف بعيد جداً أو يصطدم بعائق قريب.",
      reasons: [
        rrPass ? `معدل عائد جيد (${(s.rr||0).toFixed(1)})` : "معدل العائد ضعيف",
        reachable ? "المسافة للهدف منطقية" : "الهدف مبالغ فيه أو ضيق",
        s.timingSide !== (s.direction === "long" ? "resistance" : "support") ? "المسار مفتوح" : "عائق سعري قريب"
      ],
      checklist: [
        { label: "RR أعلى من الحد الأدنى", pass: rrPass },
        { label: "مساحة حركة كافية", pass: reachable },
        { label: "المسار خالٍ من العوائق", pass: true }
      ]
    };
  }

  function buildCorrelationDecision(s) {
    const score = getAlignmentScore(s);
    let state = score >= 0.75 ? "follow" : (score >= 0.5 ? "wait" : "exclude");
    
    const d1 = s.mtf?.["1d"]?.trend === s.trend;
    const h4 = s.mtf?.["4h"]?.trend === s.trend;
    const m15 = s.mtf?.["15m"]?.trend === s.trend;

    return {
      state,
      title: "ربط الفريمات (MTF)",
      message: state === "follow" ? "توافق ممتاز بين أغلب الفريمات الزمنية." : 
               state === "exclude" ? "تضارب حاد بين الفريمات الكبرى والصغرى." : "التوافق جزئي، انتظر تأكيد الفريم الأصغر.",
      reasons: [
        d1 ? "D1 يدعم الاتجاه" : "D1 مخالف أو عرضي",
        h4 ? "H4 متوافق" : "H4 غير مستقر",
        m15 ? "تأكيد لحظي M15" : "M15 لم يؤكد بعد"
      ],
      checklist: [
        { label: "توافق D1 (الصورة الكبرى)", pass: d1 },
        { label: "توافق H4 (التوقيت)", pass: h4 },
        { label: "تأكيد M15 (التنفيذ)", pass: m15 }
      ]
    };
  }

  function buildNoEntryDecision(s, cfg) {
    const reasons = [];
    if (!isTrendStrong(s)) reasons.push("الاتجاه غير واضح (عرضي)");
    if (!s.confirmation) reasons.push("غياب التأكيد الفني (No Action)");
    if (s.inMiddle) reasons.push("السعر في منتصف النطاق");
    if (!isRROk(s, cfg)) reasons.push("نسبة العائد للمخاطرة ضعيفة");
    if (s.alignmentBias === "clash") reasons.push("تضارب حاد بين الفريمات");

    const state = reasons.length > 0 ? "exclude" : "wait";

    return {
      state,
      title: "لماذا لا يجب الدخول الآن؟",
      message: reasons.length > 0 ? `تجنب الدخول بسبب: ${reasons[0]}` : "لا يوجد سبب قاطع للمنع، لكن انتظر فرصة أفضل.",
      reasons: reasons.length > 0 ? reasons.slice(0, 3) : ["انتظار فرصة ذات جودة أعلى"],
      checklist: reasons.map(r => ({ label: r, pass: false }))
    };
  }

  // --- Layer 3: Router ---

  ASSISTANT.getDecisionForTab = function (tabId, s, cfg) {
    if (!s) return null;
    const builders = {
      general: buildGeneralDecision,
      sl: buildSLDecision,
      tp: buildTPDecision,
      correlation: buildCorrelationDecision,
      noentry: buildNoEntryDecision
    };
    const builder = builders[tabId] || builders.general;
    return builder(s, cfg);
  };

  global.AtlasFlowAssistant = ASSISTANT;
})(window);
