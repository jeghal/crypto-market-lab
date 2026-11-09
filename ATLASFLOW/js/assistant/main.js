(function (global) {
  const ASSISTANT = global.AtlasFlowAssistant || {};
  const SETTINGS_KEY = "assistant_settings_v10";

  const A = {
    snapshot: null,
    activeTabId: "general", // Context: general | sl | tp | correlation | noentry
  };

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function getMetricRow(label, value, extraClass = "") {
    return `
      <div class="metric-row">
        <div class="metric-l">${label}</div>
        <div class="metric-v ${extraClass}">${value}</div>
      </div>
    `;
  }

  function renderAssistant(s) {
    const dashboard = document.getElementById("assistantDashboard");
    if (!dashboard || !s) return;

    const cfg = loadSettings();
    const vm = ASSISTANT.getDecisionForTab(A.activeTabId, s, cfg);
    if (!vm) return;

    dashboard.innerHTML = `
      <div id="decisionArea" class="decision-wrap card-p mb-15 state-${vm.state}">
        <div class="main-state-badge">${vm.state.toUpperCase()}</div>
        <div class="assistant-title mb-5">${vm.title}</div>
        <div class="main-msg">${vm.message}</div>
        <div class="reasons-list mt-10">
          ${vm.reasons.map(r => `<div class="reason-chip">${r}</div>`).join("")}
        </div>
      </div>
      
      <div class="analysis-grid mb-15">
        <div class="metric-card">
          <div class="metric-title">تحليل الحركة</div>
          ${getMetricRow("الاتجاه", s.trend.toUpperCase(), `trend-${s.trend}`)}
          ${getMetricRow("الموقع", s.timingSide.toUpperCase())}
          ${getMetricRow("الضجيج", s.noiseLevel.toUpperCase())}
        </div>
        <div class="metric-card">
          <div class="metric-title">إدارة الصفقة</div>
          ${getMetricRow("الـ RR", (s.rr || 0).toFixed(2), (s.rr || 0) >= 2 ? "pass" : "fail")}
          ${getMetricRow("بُعد الوقف", `${(s.stopDistPct || 0).toFixed(1)}%`)}
          ${getMetricRow("بُعد الهدف", `${(s.targetDistPct || 0).toFixed(1)}%`)}
        </div>
      </div>

      <div class="checklist-wrap card-p mb-15">
        <div class="tabs-checklist mb-15" id="assistantTabs">
          <div class="tab-btn ${A.activeTabId === 'general' ? 'active' : ''}" data-atab="general">عام</div>
          <div class="tab-btn ${A.activeTabId === 'sl' ? 'active' : ''}" data-atab="sl">الوقف</div>
          <div class="tab-btn ${A.activeTabId === 'tp' ? 'active' : ''}" data-atab="tp">الهدف</div>
          <div class="tab-btn ${A.activeTabId === 'correlation' ? 'active' : ''}" data-atab="correlation">الربط</div>
          <div class="tab-btn ${A.activeTabId === 'noentry' ? 'active' : ''}" data-atab="noentry">المنع</div>
        </div>
        <div class="checklist-content">
          ${(vm.checklist || []).map(it => `
            <div class="check-item">
              <span class="check-icon ${it.pass ? 'check-pass' : 'check-fail'}">${it.pass ? '✔' : '✘'}</span>
              <span class="txt">${it.label}</span>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="mtf-grid">
        ${["1d", "4h", "1h", "15m"].map(iv => {
          const m = s.mtf?.[iv];
          return `
            <div class="mtf-card ${m?.stale ? 'stale' : ''}">
              <div class="mtf-header">
                <span class="iv-label">${iv.toUpperCase()}</span>
                <div class="trend-dot bg-${m?.trend || 'side'}"></div>
              </div>
              <div class="mtf-v">${m?.price ? m.price.toFixed(2) : '—'}</div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    // Bind Assistant internal tabs
    dashboard.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        A.activeTabId = btn.dataset.atab;
        renderAssistant(A.snapshot);
      });
    });

    // Update the main container's status indicator if needed
    const statusEl = document.getElementById("atlasStatus");
    if (statusEl) {
      statusEl.textContent = vm.state.toUpperCase();
      statusEl.className = `assistant-status state-${vm.state}`;
    }
  }

  // === Sync with Main Guide Tabs ===
  const GUIDE_TO_ASSISTANT_MAP = {
    "main": "general",
    "d1": "correlation",
    "h4": "general",
    "h1": "general",
    "confirm": "general",
    "m15": "general",
    "sl": "sl",
    "tp": "tp",
    "correlation": "correlation",
    "no-trade": "noentry"
  };

  document.addEventListener("content:tab-change", (e) => {
    const guideId = e.detail.id;
    const mapped = GUIDE_TO_ASSISTANT_MAP[guideId];
    if (mapped) {
      A.activeTabId = mapped;
      if (A.snapshot) renderAssistant(A.snapshot);
    }
  });

  document.addEventListener("chart:snapshot", (e) => {
    if (!e.detail) return;
    A.snapshot = ASSISTANT.readAnalysisSnapshot(e.detail, loadSettings());
    renderAssistant(A.snapshot);
  });

  global.AtlasFlowAssistantMain = { renderAssistant };
})(window);
