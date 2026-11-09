(function (global) {
  const {describe,it,expect}=global.AtlasFlowTests;
  const CHART=global.CreptoChart;
  describe("Production chart interactions",()=>{
    it("delete hit testing selects the correct zone",()=>{
      const zone={x:10,y:20,w:30,h:40};
      expect(CHART.findDeleteZone([zone],15,25)).toBe(zone);
      expect(CHART.findDeleteZone([zone],0,0)).toBe(undefined);
    });
    it("price conversion clamps at the chart boundaries",()=>{
      const metrics={pad:{t:10},chH:100,min:50,max:150,range:100,y:p=>160-p};
      expect(CHART.yToPrice(metrics,0)).toBe(150);
      expect(CHART.yToPrice(metrics,200)).toBe(50);
      expect(CHART.findLevelAtY(metrics,[100],60)).toBe(0);
      expect(CHART.findLevelAtY(metrics,[100],80)).toBe(-1);
    });
  });
})(window);
