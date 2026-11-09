(function(global){
  const {describe,it,expect}=global.AtlasFlowTests;
  const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const checklist=()=>document.getElementById("chartAutoChecklist");
  function snapshot({confirmation=true,side=false,noise=false}={}){
    const now=Date.now();
    return {symbol:"BTCUSDT",interval:"1d",mtf:{},candles:[
      {t:now-3600000,o:98,h:99.5,l:97,c:99,v:10},
      {t:now,o:confirmation?99:100,h:noise?110:100.1,l:noise?90:98.9,c:confirmation?100:99.2,v:20}],
      ema7:[99,side?98:99.7],ema21:[98,98.5],ema50:[97,98],
      sr:{supports:[{price:99}],resistances:[{price:105}]},
      tradePlan:{direction:"long",entry:100,stop:99,target:103,rr:3}};
  }
  async function render(detail){
    document.dispatchEvent(new CustomEvent("content:tab-change",{detail:{label:"الرئيسية"}}));
    document.dispatchEvent(new CustomEvent("chart:snapshot",{detail}));
    await nextPaint();
  }
  describe("Production assistant decisions via chart events",()=>{
    it("follows a confirmed low-noise trend at support",async()=>{
      await render(snapshot()); expect(checklist().querySelector('.decision-badge').textContent).toBe("FOLLOW");
    });
    it("waits when price action has not confirmed",async()=>{
      await render(snapshot({confirmation:false})); expect(checklist().querySelector('.decision-badge').textContent).toBe("WAIT");
    });
    it("excludes a structure with no clear EMA trend",async()=>{
      await render(snapshot({side:true})); expect(checklist().querySelector('.decision-badge').textContent).toBe("EXCLUDE");
    });
    it("excludes excessive candle noise",async()=>{
      await render(snapshot({noise:true})); expect(checklist().querySelector('.decision-badge').textContent).toBe("EXCLUDE");
    });
    it("does not issue a decision while data is loading",async()=>{
      await render({...snapshot(),fetching:true});
      expect(checklist().textContent).toContain("جاري تحليل");
      expect(checklist().querySelector('.decision-badge')).toBeNull();
    });
  });
})(window);
