(function(global){
  const {describe,it,expect}=global.AtlasFlowTests;
  const CHART=global.CreptoChart;
  describe("Production websocket transport",()=>{
    it("disconnect marks intentional closure and detaches handlers",()=>{
      let closed=false;
      const socket={close(){closed=true;}};
      const S={ws:socket,wsIntentional:false};
      CHART.disconnectWs({S,intentional:true});
      expect(S.ws).toBeNull(); expect(S.wsIntentional).toBe(true); expect(closed).toBe(true);
      expect(socket.onmessage).toBeNull();
    });
    it("connect rejects candles for a different symbol",()=>{
      const original=global.WebSocket;
      let url="";
      global.WebSocket=function(value){url=value;this.close=()=>{};};
      const S={symbol:"BTCUSDT",interval:"1h",candles:[{t:1,c:100}]};
      try{
        CHART.connectWs({S,isValidSymbol:()=>true,disconnectWsFn:()=>{},toApiInterval:x=>x,
          normalizeSymbol:x=>x,fromApiInterval:x=>x,normalizeIntervalLabel:x=>x});
        expect(url).toContain("btcusdt@kline_1h");
        S.ws.onmessage({data:JSON.stringify({data:{k:{s:"ETHUSDT",i:"1h",t:1,c:"999"}}})});
        expect(S.candles[0].c).toBe(100);
        CHART.disconnectWs({S});
      }finally{global.WebSocket=original;}
    });
  });
})(window);
