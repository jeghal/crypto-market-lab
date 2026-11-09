(function (global) {
  const { describe, it, expect } = global.AtlasFlowTests;
  const CHART = global.CreptoChart;
  describe("Production chart snapshots", () => {
    it("snapshot contains cloned candles and normalized plan", () => {
      const S = { symbol: "BTCUSDT", interval: "1h", candles: [{t:1,o:10,h:12,l:9,c:11,v:100}],
        ema7:[10], ema21:[10], ema50:[10], mtf:{}, sr:{supports:[],resistances:[]} };
      const detail=CHART.emitAssistantSnapshot({S, normalizeTradePlan:CHART.normalizeTradePlan});
      expect(detail.symbol).toBe("BTCUSDT");
      expect(detail.candles[0].c).toBe(11);
      detail.candles[0].c=99;
      expect(S.candles[0].c).toBe(11);
    });
    it("MTF refresh reuses current frame and loads the other three", async () => {
      const candles=Array.from({length:20},(_,i)=>({t:i,o:100,h:101,l:99,c:100,v:10}));
      const S={symbol:"BTCUSDT",interval:"1h",mtf:{},mtfReqId:0,candles};
      const requested=[];
      await CHART.refreshMtfSnapshots({S,symbol:S.symbol,isValidSymbol:()=>true,
        suggestedCandleLimit:()=>100,buildFrameSnapshot:CHART.buildFrameSnapshot,
        fetchFrameSnapshotFn:async(symbol,interval)=>{requested.push(interval); return {interval,candles};},
        emitAssistantSnapshotFn:()=>{}});
      expect(requested).toEqual(["1d","4h","15m"]);
      expect(Object.keys(S.mtf).sort()).toEqual(["15m","1d","1h","4h"]);
      expect(S.mtf["1h"].candles.length).toBe(20);
      expect(S.mtfFetching).toBe(false);
    });
  });
})(window);
