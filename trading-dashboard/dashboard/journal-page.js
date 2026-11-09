import './market-core.js';
import { readJournal, writeJournal, evaluateRecord, journalStats, MODEL } from './signal-journal.js';
const statusNames={pending:'معلّقة',target:'بلغت الهدف',stop:'بلغت الوقف',expired:'انتهت المدة',ambiguous:'غير محسومة',skipped_gap:'تجاوز الافتتاح حدود الخطة'};
const message=document.getElementById('journalMessage');
const number=value=>Number.isFinite(value)?value.toLocaleString('en',{maximumFractionDigits:6}):'—';
function render(){
  const records=readJournal();const stats=journalStats(records);
  const root=document.getElementById('journalStats');root.replaceChildren();
  for(const text of [`الإشارات: ${stats.total}`,`المكتملة: ${stats.completed}`,`المعلّقة: ${stats.pending}`,`غير المحسومة: ${stats.ambiguous}`,`افتتاح غير صالح: ${stats.skipped}`,`نسبة النتائج الموجبة: ${number(stats.winRate)}%`,`متوسط العائد الصافي: ${number(stats.meanNetReturnPct)}%`]){
    const item=document.createElement('span');item.textContent=text;root.append(item);
  }
  document.getElementById('sampleNote').textContent=stats.sufficientSample?'النتائج وصفية للعينة المسجلة، وليست ضماناً للأداء القادم.':'العينة غير كافية للاستنتاج: اجمع 30 نتيجة مكتملة على الأقل، ثم افحص اختلاف الظروف وتكاليف التنفيذ.';
  const rows=document.getElementById('journalRows');rows.replaceChildren();
  for(const record of [...records].reverse()){
    const row=document.createElement('tr');
    const cells=[new Date(record.observedAt).toLocaleString('ar'),record.symbol,(statusNames[record.status]||record.status)+(record.evaluationWarning==='missing_history'?' — التاريخ غير مكتمل':''),number(record.referencePrice),number(record.entry),number(record.stop),number(record.target),Number.isFinite(record.netReturnPct)?number(record.netReturnPct)+'%':'—'];
    for(const value of cells){const td=document.createElement('td');td.textContent=value;row.append(td);} rows.append(row);
  }
  if(!records.length)message.textContent='لا توجد إشارات مسجلة بعد. اترك لوحة التداول مفتوحة ليبدأ التسجيل عند تحقق إشارة شراء.';
}
function download(name,type,data){const url=URL.createObjectURL(new Blob([data],{type}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.getElementById('exportJournal').addEventListener('click',()=>download('signal-journal.json','application/json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),model:MODEL,records:readJournal()},null,2)));
document.getElementById('exportCsv').addEventListener('click',()=>{
  const keys=['id','symbol','profile','observedAt','status','referencePrice','entry','stop','target','exit','netReturnPct'];
  const escape=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
  const rows=[keys.join(','),...readJournal().map(record=>keys.map(key=>escape(record[key])).join(','))];
  download('signal-journal.csv','text/csv;charset=utf-8','\ufeff'+rows.join('\n'));
});
document.getElementById('evaluateJournal').addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;let processed=0;let failed=0;
  try{
    const pending=readJournal().filter(r=>r.status==='pending');
    for(const record of pending){
      const model=record.model||MODEL;const start=(Math.floor(record.observedAt/model.intervalMs)+1)*model.intervalMs;
      const end=Math.min(start+model.horizonBars*model.intervalMs-1,Math.floor(Date.now()/model.intervalMs)*model.intervalMs-1);
      if(end<start)continue;
      message.textContent=`تقييم ${record.symbol} (${++processed}/${pending.length})...`;
      try{
        const url=new URL('https://data-api.binance.vision/api/v3/klines');
        for(const [key,value]of Object.entries({symbol:record.symbol,interval:'15m',startTime:start,endTime:end,limit:1000}))url.searchParams.set(key,value);
        const raw=await globalThis.BinanceCore.requestJson(url,{retries:1});
        const candles=raw.map(c=>({t:+c[0],o:+c[1],h:+c[2],l:+c[3],c:+c[4]}));
        // Read again so signals captured in another tab are retained.
        const records=readJournal().map(r=>r.id===record.id?evaluateRecord(r,candles):r);
        if(!writeJournal(records))throw new Error('تعذّر الحفظ في المتصفح');
      }catch{failed++;}
    }
    render();message.textContent=`اكتمل فحص ${processed} سجل. تعذّر تقييم ${failed}. السجلات ذات التاريخ غير المكتمل تبقى معلّقة.`;
  }finally{button.disabled=false;}
});
window.addEventListener('storage',render);render();
