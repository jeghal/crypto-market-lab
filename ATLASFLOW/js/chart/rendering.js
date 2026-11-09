(function initAtlasFlowChartRendering(global) {
  const SHARED = global.AtlasFlowShared || {};
  const CHART = global.AtlasFlowChart || {};
  const clamp = SHARED.clamp;

  function getFullscreenCanvasHeight(host) {
    const fullEl = document.fullscreenElement;
    const cardEl = host.closest(".card-chart");
    if (!fullEl || !cardEl || !fullEl.contains(cardEl)) return null;
    const head = cardEl.querySelector(".chart-head");
    const controls = cardEl.querySelector(".chart-ctrls");
    const styles = getComputedStyle(cardEl);
    const gap = parseFloat(styles.rowGap || styles.gap || "0") || 0;
    const paddingTop = parseFloat(styles.paddingTop || "0") || 0;
    const paddingBottom = parseFloat(styles.paddingBottom || "0") || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight || 0;
    const cardRect = cardEl.getBoundingClientRect();
    if (cardRect.height < 10) return null;
    const cardHeight = Math.min(cardRect.height, viewportHeight > 0 ? viewportHeight : cardRect.height);
    const headHeight = head?.getBoundingClientRect().height ?? 0;
    const controlsHeight = controls?.getBoundingClientRect().height ?? 0;
    const gapsCount = (head ? 1 : 0) + (controls ? 1 : 0);
    const available = cardHeight - paddingTop - paddingBottom - headHeight - controlsHeight - gap * gapsCount;
    return Math.max(Math.floor(available), 180);
  }

  function resize(canvas, ctx, S) {
    const host = canvas.parentElement;
    if (!host) return null;
    const dpr = window.devicePixelRatio || 1;
    const fullscreenHeight = getFullscreenCanvasHeight(host);
    const inFullscreenChart = Number.isFinite(fullscreenHeight);
    if (document.fullscreenElement && !inFullscreenChart) return null;
    const r = host.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width));
    const h = inFullscreenChart ? fullscreenHeight : Math.max(220, Math.floor(r.height));
    const pw = Math.floor(w * dpr);
    const ph = Math.floor(h * dpr);
    if (inFullscreenChart) {
      host.style.height = `${h}px`;
      host.style.minHeight = "0px";
    } else {
      host.style.height = "";
      host.style.minHeight = "";
    }
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function draw(canvas, ctx, S, options = {}) {
    const { priceLabel, fmtAxisDate, symbolLabel } = options;
    const sz = resize(canvas, ctx, S);
    if (!sz) return;
    const { w, h } = sz;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#121c2a";
    ctx.fillRect(0, 0, w, h);

    if (!S.candles.length) {
      ctx.fillStyle = "#8aa3bd";
      ctx.font = "13px Share Tech Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText(S.fetching ? "تحميل الشارت..." : "لا توجد بيانات", w / 2, h / 2);
      return;
    }

    // Status
    ctx.save();
    ctx.font = "10px Share Tech Mono, monospace";
    ctx.textAlign = "right";
    let statusText = "LIVE";
    let statusColor = "#00ff88";
    if (S.wsStatus === "retrying" || S.wsStatus === "error" || S.wsStatus === "connecting") { 
      statusText = "RECONNECTING..."; statusColor = "#ffaa00"; 
    }
    else if (!S.ws && !S.fetching) { statusText = "OFFLINE"; statusColor = "#ff4444"; }
    else if (S.fetching) { statusText = "LOADING..."; statusColor = "#0088ff"; }
    ctx.fillStyle = statusColor;
    ctx.fillText(statusText, w - 8, 15);
    if (statusText === "LIVE") {
      ctx.globalAlpha = 0.4 + (Math.sin(Date.now() / 400) + 1) * 0.3;
      ctx.beginPath();
      ctx.arc(w - ctx.measureText(statusText).width - 15, 11, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const volZone = S.layers.vol ? Math.max(58, Math.floor(h * 0.18)) : 0;
    const vpPad = S.layers.vp ? 64 : 0;
    const pad = { t: 20, r: 74, b: 24 + volZone, l: 8 + vpPad };
    const chW = w - pad.l - pad.r;
    const chH = h - pad.t - pad.b;
    const step = chW / S.candles.length;
    const bodyW = Math.max(2, step * 0.66);

    let min = S.seriesBounds?.candleMin;
    let max = S.seriesBounds?.candleMax;
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = Infinity; max = -Infinity;
      S.candles.forEach((c) => { min = Math.min(min, c.l); max = Math.max(max, c.h); });
    }
    const mergeBounds = CHART.mergeBounds;
    if (S.layers.ema) {
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema7));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema21));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.ema50));
    }
    if (S.layers.vwap) ({ min, max } = mergeBounds(min, max, S.seriesBounds?.vwap));
    if (S.layers.bb) {
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbU));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbM));
      ({ min, max } = mergeBounds(min, max, S.seriesBounds?.bbL));
    }
    S.levels.forEach((p) => { min = Math.min(min, p); max = Math.max(max, p); });
    if (S.tradePlan) {
      min = Math.min(min, S.tradePlan.stop, S.tradePlan.entry, S.tradePlan.target);
      max = Math.max(max, S.tradePlan.stop, S.tradePlan.entry, S.tradePlan.target);
    }
    if (min === max) { min *= 0.999; max *= 1.001; } else { const rg = (max - min) * 0.08; min -= rg; max += rg; }
    const range = max - min || 1;

    const y = (p) => pad.t + chH * (1 - (p - min) / range);
    const x = (i) => pad.l + step * i + step / 2;
    const xr = (r) => pad.l + clamp(r, 0, 1) * chW;

    const line = (arr, color, lw, dash = null, sampled = true) => {
      if (!Array.isArray(arr) || !arr.length) return;
      ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
      ctx.beginPath();
      let started = false;
      const stride = sampled ? Math.max(1, Math.ceil(2 / Math.max(step, 0.001))) : 1;
      for (let i = 0; i < arr.length; i += stride) {
        const v = arr[i]; if (!Number.isFinite(v)) continue;
        const xi = x(i); const yi = y(v);
        if (!started) { ctx.moveTo(xi, yi); started = true; } else ctx.lineTo(xi, yi);
      }
      if (stride > 1) {
        const li = arr.length - 1; const lv = arr[li];
        if (Number.isFinite(lv)) {
          const xi = x(li); const yi = y(lv);
          if (!started) { ctx.moveTo(xi, yi); started = true; } else ctx.lineTo(xi, yi);
        }
      }
      if (started) ctx.stroke();
      ctx.setLineDash([]);
    };

    const rightBadges = [];
    const currentPrice = Number.isFinite(S.realtimePrice) ? S.realtimePrice : S.candles[S.candles.length - 1]?.c;

    const reserveBadgeY = (rawY, bh = 16) => {
      const top = pad.t + bh / 2;
      const bottom = h - pad.b - bh / 2;
      let badgeY = clamp(rawY, top, bottom);
      if (Number.isFinite(currentPrice) && Math.abs(badgeY - y(currentPrice)) < bh + 2) {
        badgeY = clamp(badgeY + bh + 2, top, bottom);
      }
      rightBadges.forEach((py) => {
        if (Math.abs(badgeY - py) < bh + 2) badgeY = clamp(py + bh + 2, top, bottom);
      });
      rightBadges.push(badgeY);
      return badgeY;
    };

    const drawRightBadge = (text, price, borderColor, fillColor = "rgba(7,15,28,0.75)", textColor = borderColor) => {
      if (!Number.isFinite(price)) return;
      const py = y(price);
      if (py < pad.t || py > h - pad.b) return;
      ctx.save();
      ctx.font = "10px Share Tech Mono, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(text).width;
      const bh = 16; const bw = tw + 10;
      const badgeY = reserveBadgeY(py, bh);
      const bx = w - pad.r + 4; const by = badgeY - bh / 2;
      ctx.strokeStyle = borderColor; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w - pad.r, py); ctx.lineTo(bx, badgeY); ctx.stroke();
      ctx.fillStyle = fillColor; ctx.strokeStyle = borderColor;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4);
      else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = textColor; ctx.fillText(text, bx + 5, badgeY);
      ctx.restore();
    };

    const getLastFinite = (arr) => {
      for (let i = arr.length - 1; i >= 0; i -= 1) if (Number.isFinite(arr[i])) return arr[i];
      return NaN;
    };

    // Grid
    if (S.layers.grid) {
      const priceBadgeY = Number.isFinite(currentPrice) ? y(currentPrice) : -9999;
      const skipZone = 14;
      ctx.strokeStyle = "rgba(20,32,47,0.85)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      for (let i = 0; i <= 6; i += 1) {
        const yi = pad.t + (chH / 6) * i;
        ctx.beginPath(); ctx.moveTo(pad.l, yi); ctx.lineTo(w - pad.r, yi); ctx.stroke();
        if (Math.abs(yi - priceBadgeY) > skipZone) {
          const price = max - (range / 6) * i;
          ctx.fillStyle = "rgba(45,68,96,0.72)"; ctx.font = "10px Share Tech Mono, monospace"; ctx.textAlign = "left";
          ctx.fillText(priceLabel(price), w - pad.r + 6, yi + 3);
        }
      }
      const verticalLines = Math.max(3, Math.min(8, Math.floor(S.candles.length / 10)));
      ctx.strokeStyle = "rgba(20,32,47,0.45)";
      for (let i = 1; i < verticalLines; i += 1) {
        const xi = pad.l + chW * (i / verticalLines);
        ctx.beginPath(); ctx.moveTo(xi, pad.t); ctx.lineTo(xi, h - pad.b); ctx.stroke();
        const ci = Math.min(S.candles.length - 1, Math.round((i / verticalLines) * S.candles.length));
        const ts = S.candles[ci]?.t;
        if (ts) {
          const { line1, line2 } = fmtAxisDate(ts, S.interval);
          ctx.fillStyle = "rgba(45,68,96,0.7)"; ctx.font = "9px Share Tech Mono, monospace"; ctx.textAlign = "center";
          ctx.fillText(line1, xi, h - pad.b + 10);
          if (line2) ctx.fillText(line2, xi, h - pad.b + 20);
        }
      }
      ctx.setLineDash([]);
    }

    // Indicators...
    if (S.layers.vp && S.vp) {
      const aX = 8; const aW = Math.max(16, pad.l - aX - 8);
      const profile = S.vp.arr; const totalVol = profile.reduce((sum, v) => sum + v, 0); const poc = profile.indexOf(S.vp.max);
      let vaLow = poc; let vaHigh = poc; let vaVol = profile[poc] || 0; const targetVA = totalVol * 0.7;
      while (vaVol < targetVA && (vaLow > 0 || vaHigh < profile.length - 1)) {
        const below = vaLow > 0 ? profile[vaLow - 1] : -1; const above = vaHigh < profile.length - 1 ? profile[vaHigh + 1] : -1;
        if (below >= above && below >= 0) vaLow -= 1; else if (above >= 0) vaHigh += 1; else break;
        vaVol += Math.max(below, above);
      }
      profile.forEach((vv, i) => {
        const p0 = S.vp.lo + i * S.vp.step; const p1 = p0 + S.vp.step;
        const y0 = y(p1); const y1 = y(p0);
        const ratio = vv / S.vp.max; const ww = Math.max(1, aW * ratio);
        const inVA = i >= vaLow && i <= vaHigh;
        const alpha = inVA ? (0.14 + ratio * 0.30) : (0.08 + ratio * 0.20);
        ctx.fillStyle = `rgba(${inVA ? 90 : 57}, ${inVA ? 220 : 190}, 255, ${alpha})`;
        ctx.fillRect(aX + aW - ww, y0, ww, Math.max(1, y1 - y0));
      });
      const pocPrice = S.vp.lo + ((poc + 0.5) / profile.length) * (S.vp.hi - S.vp.lo);
      const pocY = y(pocPrice); ctx.strokeStyle = "rgba(57,213,255,0.86)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pad.l, pocY); ctx.lineTo(w - pad.r, pocY); ctx.stroke();
      const vahPrice = S.vp.lo + ((vaHigh + 1) / profile.length) * (S.vp.hi - S.vp.lo);
      const valPrice = S.vp.lo + (vaLow / profile.length) * (S.vp.hi - S.vp.lo);
      const vahY = y(vahPrice); const valY = y(valPrice);
      ctx.fillStyle = "rgba(57,213,255,0.05)"; ctx.fillRect(pad.l, vahY, chW, valY - vahY);
      ctx.strokeStyle = "rgba(57,213,255,0.55)"; ctx.setLineDash([2, 5]);
      ctx.beginPath(); ctx.moveTo(pad.l, vahY); ctx.lineTo(w - pad.r, vahY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.l, valY); ctx.lineTo(w - pad.r, valY); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (S.layers.fib) {
      S.fib.forEach((f) => {
        const yi = y(f.price); ctx.strokeStyle = "rgba(255,184,48,0.45)"; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(pad.l, yi); ctx.lineTo(w - pad.r, yi); ctx.stroke(); ctx.setLineDash([]);
      });
    }

    if (S.layers.sr) {
      const drawSRLine = (level, kind) => {
        const yi = y(level.price); const color = kind === "S" ? "rgba(0,232,150,0.82)" : "rgba(255,95,125,0.82)";
        if (yi < pad.t || yi > h - pad.b) return;
        ctx.strokeStyle = color; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(pad.l, yi); ctx.lineTo(w - pad.r, yi); ctx.stroke(); ctx.setLineDash([]);
        const label = `${kind} ${priceLabel(level.price)}`; ctx.font = "10px Share Tech Mono, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width; const bh = 14; const bw = tw + 8;
        const leftPad = S.layers.vp ? 76 : 6; const bx = pad.l + leftPad; const by = yi - bh / 2;
        ctx.fillStyle = "rgba(7,15,28,0.86)"; ctx.strokeStyle = color;
        ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
        ctx.fill(); ctx.stroke(); ctx.fillStyle = color; ctx.fillText(label, bx + 4, yi);
      };
      S.sr.resistances.forEach((l) => drawSRLine(l, "R"));
      S.sr.supports.forEach((l) => drawSRLine(l, "S"));
    }

    if (S.layers.tradeZones && S.tradePlan) {
      const ye = y(S.tradePlan.entry); const ys = y(S.tradePlan.stop); const yt = y(S.tradePlan.target);
      ctx.fillStyle = "rgba(255,58,92,0.08)"; ctx.fillRect(pad.l, Math.min(ye, ys), chW, Math.abs(ye - ys));
      ctx.fillStyle = "rgba(0,232,150,0.08)"; ctx.fillRect(pad.l, Math.min(ye, yt), chW, Math.abs(yt - ye));
    }

    if (S.layers.vol) {
      const vt = h - volZone + 8; const vh = volZone - 14; const maxV = Math.max(...S.candles.map((c) => c.v || 0), 1);
      S.candles.forEach((c, i) => {
        const hh = Math.max(1, ((c.v || 0) / maxV) * vh);
        ctx.fillStyle = c.c >= c.o ? "rgba(0,232,150,0.24)" : "rgba(255,58,92,0.24)";
        ctx.fillRect(x(i) - bodyW / 2, vt + vh - hh, bodyW, hh);
      });
    }

    if (S.layers.bb) {
      const upperPts = []; const lowerPts = [];
      S.bbU.forEach((v, i) => {
        if (!Number.isFinite(v) || !Number.isFinite(S.bbL[i])) return;
        upperPts.push([x(i), y(v)]); lowerPts.push([x(i), y(S.bbL[i])]);
      });
      if (upperPts.length) {
        ctx.beginPath(); ctx.moveTo(upperPts[0][0], upperPts[0][1]);
        upperPts.slice(1).forEach(([xp, yp]) => ctx.lineTo(xp, yp));
        lowerPts.slice().reverse().forEach(([xp, yp]) => ctx.lineTo(xp, yp));
        ctx.closePath(); ctx.fillStyle = "rgba(255,184,48,0.04)"; ctx.fill();
      }
      line(S.bbU, "rgba(255,184,48,0.75)", 1.1);
      line(S.bbL, "rgba(255,184,48,0.75)", 1.1);
      const lastU = getLastFinite(S.bbU); const lastL = getLastFinite(S.bbL);
      if (Number.isFinite(lastU)) drawRightBadge(`BBU ${priceLabel(lastU)}`, lastU, "rgba(255,184,48,0.82)", "rgba(255,184,48,0.12)", "rgba(255,184,48,0.9)");
      if (Number.isFinite(lastL)) drawRightBadge(`BBL ${priceLabel(lastL)}`, lastL, "rgba(255,184,48,0.82)", "rgba(255,184,48,0.12)", "rgba(255,184,48,0.9)");
    }

    // Candles
    const lastIdx = S.candles.length - 1;
    S.candles.forEach((c, i) => {
      const xi = x(i); const yo = y(c.o); const yh = y(c.h); const yl = y(c.l); const yc = y(c.c);
      const up = c.c >= c.o; const bodyTop = Math.min(yo, yc); const bodyHeight = Math.max(1.2, Math.abs(yo - yc));
      const isLive = i === lastIdx;
      ctx.strokeStyle = up ? "#00e896" : "#ff3a5c"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xi, yh); ctx.lineTo(xi, yl); ctx.stroke();
      ctx.fillStyle = up ? "rgba(0,232,150,0.92)" : "rgba(255,58,92,0.92)";
      ctx.strokeStyle = isLive ? "rgba(255,215,0,0.9)" : (up ? "#00e896" : "#ff3a5c");
      ctx.lineWidth = isLive ? 1.6 : 1;
      if (isLive) { ctx.shadowColor = "rgba(255,215,0,0.55)"; ctx.shadowBlur = 8; }
      ctx.fillRect(xi - bodyW / 2, bodyTop, bodyW, bodyHeight); ctx.strokeRect(xi - bodyW / 2, bodyTop, bodyW, bodyHeight);
      ctx.shadowBlur = 0;
    });

    if (S.layers.ema) {
      line(S.ema7, "rgba(0,220,255,0.96)", 1.35);
      line(S.ema21, "rgba(247,147,26,0.9)", 1.2);
      line(S.ema50, "rgba(255,184,48,0.88)", 1.15);
    }
    if (S.layers.vwap) {
      line(S.vwap, "rgba(197,130,255,0.95)", 1.2, [7, 4]);
      const lastVwap = getLastFinite(S.vwap);
      if (Number.isFinite(lastVwap)) drawRightBadge(`VWAP ${priceLabel(lastVwap)}`, lastVwap, "rgba(197,130,255,0.92)", "rgba(197,130,255,0.12)", "rgba(217,165,255,0.95)");
    }

    if (S.layers.trade && S.tradePlan) {
      const ye = y(S.tradePlan.entry); const ys = y(S.tradePlan.stop); const yt = y(S.tradePlan.target);
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "rgba(247,147,26,0.92)"; ctx.beginPath(); ctx.moveTo(pad.l, ye); ctx.lineTo(w - pad.r, ye); ctx.stroke();
      ctx.strokeStyle = "rgba(255,58,92,0.92)"; ctx.beginPath(); ctx.moveTo(pad.l, ys); ctx.lineTo(w - pad.r, ys); ctx.stroke();
      ctx.strokeStyle = "rgba(0,232,150,0.92)"; ctx.beginPath(); ctx.moveTo(pad.l, yt); ctx.lineTo(w - pad.r, yt); ctx.stroke();
      ctx.setLineDash([]);
      drawRightBadge(`TP ${priceLabel(S.tradePlan.target)}`, S.tradePlan.target, "rgba(0,232,150,0.9)", "rgba(0,232,150,0.14)", "rgba(0,232,150,0.96)");
      drawRightBadge(`ENTRY ${priceLabel(S.tradePlan.entry)}`, S.tradePlan.entry, "rgba(247,147,26,0.92)", "rgba(247,147,26,0.16)", "rgba(255,176,90,0.98)");
      drawRightBadge(`SL ${priceLabel(S.tradePlan.stop)}`, S.tradePlan.stop, "rgba(255,58,92,0.92)", "rgba(255,58,92,0.14)", "rgba(255,130,150,0.96)");
    }

    if (Number.isFinite(currentPrice)) {
      const py = y(currentPrice); if (py >= pad.t && py <= h - pad.b) {
        ctx.strokeStyle = "rgba(247,147,26,0.48)"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke(); ctx.setLineDash([]);
        const lbl = priceLabel(currentPrice); ctx.font = "bold 10px Share Tech Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(lbl).width; const bw = tw + 14; const bh = 20; const bx = w - pad.r + 4; const by = py - bh / 2;
        ctx.fillStyle = "#f7931a"; ctx.strokeStyle = "rgba(247,147,26,0.6)";
        ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 8); else ctx.rect(bx, by, bw, bh);
        ctx.fill(); ctx.stroke(); ctx.fillStyle = "#07101c"; ctx.fillText(lbl, bx + bw / 2, by + bh / 2);
      }
    }

    // Hover / Cursor
    if (S.hoverIndex != null && S.hoverIndex >= 0 && S.hoverY >= 0) {
      const hoverY = clamp(S.hoverY, pad.t, h - pad.b);
      const hoverPrice = max - ((hoverY - pad.t) / chH) * range;
      ctx.strokeStyle = "rgba(126,184,255,0.28)"; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, hoverY); ctx.lineTo(w - pad.r, hoverY); ctx.stroke(); ctx.setLineDash([]);
      const lbl = priceLabel(hoverPrice); ctx.font = "bold 10px Share Tech Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(lbl).width; const bw = tw + 12; const bh = 18; const bx = w - pad.r + 4; const by = clamp(hoverY - bh / 2, pad.t, h - pad.b - bh);
      ctx.fillStyle = "rgba(7,15,28,0.92)"; ctx.strokeStyle = "rgba(126,184,255,0.5)";
      ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 8); else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke(); ctx.fillStyle = "#b9d5ff"; ctx.fillText(lbl, bx + bw / 2, by + bh / 2);
    }

    S.deleteZones = [];
    S.levels.forEach((p, i) => {
      const rawY = y(p); const chartTop = pad.t; const chartBottom = pad.t + chH; const yi = clamp(rawY, chartTop + 1, chartBottom - 1);
      const active = i === S.hoverLevel || i === S.dragLevel;
      ctx.strokeStyle = active ? "rgba(255,220,50,0.95)" : "rgba(255,220,50,0.6)"; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(pad.l, yi); ctx.lineTo(w - pad.r, yi); ctx.stroke(); ctx.setLineDash([]);
      const arrow = rawY < chartTop ? " \u25B2" : rawY > chartBottom ? " \u25BC" : ""; const label = `${priceLabel(p)}${arrow}`;
      ctx.font = "10px Share Tech Mono, monospace"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width; const bw = Math.ceil(tw + 28); const bh = 16; const bx = w - pad.r + 6; const by = yi - bh / 2;
      ctx.fillStyle = active ? "rgba(255,220,50,0.20)" : "rgba(255,220,50,0.08)"; ctx.strokeStyle = active ? "rgba(255,220,50,0.8)" : "rgba(255,220,50,0.35)";
      ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
      ctx.fill(); ctx.stroke(); ctx.fillStyle = active ? "rgba(255,230,60,1)" : "rgba(255,220,50,0.92)"; ctx.fillText(label, bx + 6, yi);
      const dx = bx + bw - 14; const dy = yi - 6; const dw = 12; const dh = 12;
      ctx.fillStyle = active ? "rgba(255,95,125,0.85)" : "rgba(120,60,60,0.45)";
      ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(dx, dy, dw, dh, 2); else ctx.rect(dx, dy, dw, dh);
      ctx.fill(); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText("x", dx + 6, yi);
      S.deleteZones.push({ index: i, x: dx, y: dy, w: dw, h: dh });
    });

    ctx.textBaseline = "alphabetic";
    S.trendlines.forEach((tl, i) => { ctx.strokeStyle = "rgba(57,213,255,0.9)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xr(tl.r1), y(tl.p1)); ctx.lineTo(xr(tl.r2), y(tl.p2)); ctx.stroke(); if (S.layers.tl) { ctx.fillStyle = "rgba(57,213,255,0.9)"; ctx.font = "9px Share Tech Mono, monospace"; ctx.fillText(`TL${i + 1}`, xr(tl.r2) + 3, y(tl.p2) - 3); } });
    if (S.layers.tl && S.pendingTL && S.cursorTL) { ctx.strokeStyle = "rgba(57,213,255,0.65)"; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(xr(S.pendingTL.r), y(S.pendingTL.p)); ctx.lineTo(xr(S.cursorTL.r), y(S.cursorTL.p)); ctx.stroke(); ctx.setLineDash([]); }

    if (S.hoverIndex != null && S.hoverIndex >= 0 && S.hoverIndex < S.candles.length) {
      const crossX = x(S.hoverIndex); ctx.strokeStyle = "rgba(0,200,255,0.18)"; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(crossX, pad.t); ctx.lineTo(crossX, h - pad.b); ctx.stroke(); ctx.setLineDash([]);
      const ts = S.candles[S.hoverIndex]?.t;
      if (ts) {
        const { line1, line2 } = fmtAxisDate(ts, S.interval); const label = line2 ? `${line1}  ${line2}` : line1;
        ctx.font = "10px Share Tech Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const tw = ctx.measureText(label).width; const bw = tw + 10; const bh = 16; const bx = clamp(crossX - bw / 2, pad.l, w - pad.r - bw); const by = h - pad.b + 2;
        ctx.fillStyle = "rgba(7,15,28,0.88)"; ctx.strokeStyle = "rgba(0,200,255,0.45)"; ctx.lineWidth = 1;
        ctx.beginPath(); if (typeof ctx.roundRect === "function") ctx.roundRect(bx, by, bw, bh, 4); else ctx.rect(bx, by, bw, bh);
        ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(0,200,255,0.92)"; ctx.fillText(label, bx + bw / 2, by + bh / 2);
      }
    }
    ctx.fillStyle = "#e6f1ff"; ctx.font = "11px Share Tech Mono, monospace"; ctx.textAlign = "left"; ctx.fillText(`${symbolLabel(S.symbol)}/USDT`, pad.l + 4, 14);

    S.metrics = { pad, chW, chH, step, min, max, range, x, y };
  }

  global.AtlasFlowChart = {
    ...(global.AtlasFlowChart || {}),
    resize,
    draw,
  };
})(window);
