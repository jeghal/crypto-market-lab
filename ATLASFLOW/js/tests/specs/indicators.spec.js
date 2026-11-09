(function initAtlasFlowIndicatorSpecs(global) {
  const { describe, it, expect } = global.AtlasFlowTests;
  const CHART = global.CreptoChart || {};

  describe("Indicator Logic (indicators.js)", () => {
    it("EMA: calculation should handle steady growth", () => {
      const data = [10, 10, 10, 20, 20, 20];
      const res = CHART.ema(data, 3);
      expect(res.length).toBe(6);
      expect(res[5] > res[0]).toBeTruthy(); // Trend should be up
    });

    it("EMA: empty input has no values", () => {
      expect(CHART.ema([], 7)).toEqual([]);
    });

    it("S/R: should identify local peaks with enough data", () => {
      const candles = Array.from({length: 20}, (_, i) => ({
        h: i === 10 ? 100 : 50,
        l: i === 10 ? 90 : 40,
        c: i === 10 ? 95 : 45
      }));
      const sr = CHART.sr(candles);
      expect(sr.resistances.length).toBeGreaterThan(0);
      expect(sr.resistances[0].price).toBe(100);
    });

    it("Trade Plan: correct RR for Long", () => {
      const candles = Array.from({ length: 14 }, () => ({ h: 101, l: 99, c: 100 }));
      const srL = { supports: [{ price: 90 }], resistances: [{ price: 120 }] };
      const planL = CHART.tradePlan(candles, srL);
    
      expect(planL.direction).toBe("long");
      expect(planL.rr).toBe(2);
      expect(planL.stop).toBe(90);
      expect(planL.target).toBe(120);
    });
    
    it("Trade Plan: should support Short when structure is bearish", () => {
      const candles = Array.from({ length: 14 }, (_, i) => {
        const c = 114 - i;
        return { h: c + 1, l: c - 1, c };
      });
      const lastClose = candles[candles.length - 1].c; // 101
      const srS = {
        supports: [{ price: lastClose - 11 }],     // 90
        resistances: [{ price: lastClose + 9 }],   // 110
      };
      const planS = CHART.tradePlan(candles, srS);
    
      expect(planS.direction).toBe("short");
      expect(planS.rr).toBeCloseTo(11 / 9, 2);
      expect(planS.stop).toBe(110);
      expect(planS.target).toBe(90);
    });

    it("normalizeTradePlan: handle missing values safely", () => {
      const p = { entry: 100, stop: 90, target: 120, rr: 2 };
      const res = CHART.normalizeTradePlan(p);

      expect(res.direction).toBe("long");
      expect(res.entry).toBe(100);
      expect(res.rr).toBe(2);
      expect(res.stop).toBe(90);
      expect(res.target).toBe(120);
      expect(CHART.normalizeTradePlan(null)).toBeNull();
    });
  });
})(window);
