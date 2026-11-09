import fs from 'node:fs';
import '../shared/market-core.js';
const report={startedAt:new Date().toISOString(),mode:'read-only public market endpoints',checks:[]};
const get=(base,path,params={})=>{const url=new URL(base+path);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);return globalThis.BinanceCore.requestJson(url,{timeoutMs:10000,retries:0});};
const base='https://data-api.binance.vision';
async function check(name,fn){const start=Date.now();try{const details=await fn();report.checks.push({name,ok:true,latencyMs:Date.now()-start,details});console.log('PASS '+name);}catch(error){report.checks.push({name,ok:false,latencyMs:Date.now()-start,error:error.message,status:error.status});console.log('FAIL '+name+': '+error.message);}}
let serverTime;
await check('Public data server time',async()=>{const data=await get(base,'/api/v3/time');if(!Number.isFinite(data.serverTime))throw new Error('Invalid server time');serverTime=data.serverTime;return new Date(serverTime).toISOString();});
await check('Dashboard API connectivity',async()=>{const data=await get('https://api.binance.com','/api/v3/time');if(!Number.isFinite(data.serverTime))throw new Error('Invalid server time');return 'api.binance.com reachable';});
await check('BTC Spot symbol and execution rules',async()=>{const data=await get(base,'/api/v3/exchangeInfo',{symbol:'BTCUSDT'});const s=data.symbols?.find(s=>s.symbol==='BTCUSDT');if(s?.status!=='TRADING'||!s.filters.some(f=>f.filterType==='LOT_SIZE'))throw new Error('Missing active Spot rules');return {symbol:s.symbol,status:s.status};});
await check('Chronological, closed, recent 15m candles',async()=>{const rows=await get(base,'/api/v3/klines',{symbol:'BTCUSDT',interval:'15m',limit:220});if(!Array.isArray(rows)||rows.length<200)throw new Error('Insufficient candles');const closed=rows.filter(c=>c[6]<(serverTime||Date.now()));if(!closed.every((c,i)=>!i||c[0]>closed[i-1][0]))throw new Error('Nonmonotonic candles');if((serverTime||Date.now())-closed.at(-1)[6]>1800000)throw new Error('Stale candle response');return {closed:closed.length,lastClose:new Date(closed.at(-1)[6]).toISOString()};});
await check('Consistent bid and ask',async()=>{const book=await get(base,'/api/v3/ticker/bookTicker',{symbol:'BTCUSDT'});if(!(Number(book.bidPrice)>0&&Number(book.askPrice)>=Number(book.bidPrice)))throw new Error('Invalid book ticker');return {symbol:book.symbol,spreadPct:(Number(book.askPrice)-Number(book.bidPrice))/Number(book.askPrice)*100};});
await check('Public websocket receives a market tick',()=>new Promise((resolve,reject)=>{
  const ws=new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@miniTicker');
  const timer=setTimeout(()=>{ws.close();reject(new Error('No market tick within 10 seconds'));},10000);
  ws.onmessage=event=>{clearTimeout(timer);try{const tick=JSON.parse(event.data);ws.close();if(tick.s!=='BTCUSDT'||!(Number(tick.c)>0))throw new Error('Invalid websocket tick');resolve({symbol:tick.s,received:true});}catch(error){reject(error);}};
  ws.onerror=()=>{clearTimeout(timer);ws.close();reject(new Error('Websocket connection failed'));};
}));
report.finishedAt=new Date().toISOString();report.passed=report.checks.every(c=>c.ok);
const folder=new URL('../_Reports/',import.meta.url);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(new URL('live-check.json',folder),JSON.stringify(report,null,2));
console.log(`Live checks: ${report.checks.filter(c=>c.ok).length}/${report.checks.length}`);
if(!report.passed)process.exitCode=1;
