import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../shared/market-core.js';
import { captureSignal, evaluateRecord, journalStats, readJournal, writeJournal, MODEL } from '../trading-dashboard/dashboard/signal-journal.js';
const core=globalThis.BinanceCore;
let count=0;
async function check(name,fn){await fn();count++;console.log(`PASS ${name}`);}
const store=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};};
const start=1800000;
const signal={signal:true,bearSignal:false,sym:'BTCUSDT',price:100,sl:95,tp:110,analysisCandleTime:900000,condCount:7,chartIv:'1d'};
const capture=()=>captureSignal(signal,[],start-1)[0];
const candle=(t,values={})=>({t,o:100,h:104,l:99,c:102,...values});
await check('Shared EMA preserves both historical seed policies',()=>{
 assert.deepEqual(core.ema([1,2,3,4],3),[null,null,2,3]);
 assert.deepEqual(core.ema([1,2,3],3,{seed:'first'}),[1,1.5,2.25]);
 assert.throws(()=>core.ema([1],0),RangeError);
});
await check('Step rounding respects boundaries and decimal steps',()=>{
 assert.equal(core.floorToStep(0.3,0.1),0.3);assert.equal(core.ceilToStep(0.3,0.1),0.3);
 assert.equal(core.floorToStep(10.09,1),10);assert.equal(core.ceilToStep(10.09,1),11);
 assert.equal(core.toFiniteNumber(null),null);
});
await check('Journal records actionable purchases once per candle and profile',()=>{
 const records=captureSignal(signal,[],start-1);assert.equal(records.length,1);
 assert.equal(captureSignal({...signal,price:101},records,start+1).length,1);
 assert.equal(captureSignal({...signal,signal:false},[],start).length,0);
 assert.equal(captureSignal({...signal,bearSignal:true},[],start).length,0);
 assert.equal(captureSignal({...signal,sl:101},[],start).length,0);
});
await check('Journal ignores the partial candle in which a signal was observed',()=>{
 const record=capture();const result=evaluateRecord(record,[candle(start-MODEL.intervalMs,{h:120}),candle(start)],start+MODEL.intervalMs);
 assert.equal(result.status,'pending');assert.equal(result.enteredAt,start);
});
await check('Target results include entry and exit fees and slippage',()=>{
 const result=evaluateRecord(capture(),[candle(start,{h:111})],start+MODEL.intervalMs);
 assert.equal(result.status,'target');
 const expected=(110*(1-.0005)*(1-.001)/(100*(1+.0005)*(1+.001))-1)*100;
 assert.ok(Math.abs(result.netReturnPct-expected)<1e-10);
});
await check('A gap down through the stop uses the worse opening price',()=>{
 const result=evaluateRecord(capture(),[candle(start),candle(start+MODEL.intervalMs,{o:90,h:94,l:88,c:91})],start+2*MODEL.intervalMs);
 assert.equal(result.status,'stop');assert.equal(result.exit,90*(1-.0005));assert.ok(result.netReturnPct< -10);
});
await check('Both levels in the same candle are unresolved, never a claimed win',()=>{
 const result=evaluateRecord(capture(),[candle(start,{h:111,l:94})],start+MODEL.intervalMs);
 assert.equal(result.status,'ambiguous');assert.equal(result.netReturnPct,null);
 assert.equal(journalStats([result]).completed,0);
});
await check('Missing history stays pending and is excluded from performance',()=>{
 const result=evaluateRecord(capture(),[candle(start+MODEL.intervalMs,{h:111})],start+2*MODEL.intervalMs);
 assert.equal(result.status,'pending');assert.equal(result.evaluationWarning,'missing_history');
});
await check('Evaluation ignores unclosed future bars',()=>{
 const result=evaluateRecord(capture(),[candle(start,{h:111})],start+MODEL.intervalMs-1);
 assert.equal(result.status,'pending');
});
await check('Expired positions close after the configured complete horizon',()=>{
 const record={...capture(),model:{...MODEL,horizonBars:2}};
 const result=evaluateRecord(record,[candle(start),candle(start+MODEL.intervalMs,{c:103})],start+2*MODEL.intervalMs);
 assert.equal(result.status,'expired');assert.equal(result.exitedAt,start+2*MODEL.intervalMs);
});
await check('Opening outside the plan is skipped without a fabricated fill',()=>{
 const result=evaluateRecord(capture(),[candle(start,{o:112,h:114,l:111,c:113})],start+MODEL.intervalMs);
 assert.equal(result.status,'skipped_gap');assert.equal(journalStats([result]).completed,0);
});
await check('Storage failures do not break market analysis',()=>{
 assert.equal(writeJournal([capture()],{setItem(){throw new Error('quota');}}),false);
 assert.deepEqual(readJournal({getItem:()=>'{broken'}),[]);
 const storage=store();assert.equal(writeJournal([capture()],storage),true);assert.equal(readJournal(storage).length,1);
});
await check('Summary reports net outcomes and flags insufficient samples',()=>{
 const records=[{status:'target',netReturnPct:5},{status:'stop',netReturnPct:-2},{status:'ambiguous',netReturnPct:null},{status:'pending'}];
 const stats=journalStats(records);assert.equal(stats.winRate,50);assert.equal(stats.meanNetReturnPct,1.5);assert.equal(stats.sufficientSample,false);
});
await check('Shared request cancellation remains observable',async()=>{
 const original=globalThis.fetch;const controller=new AbortController();controller.abort();
 try{globalThis.fetch=()=>{throw new Error('must not fetch');};await assert.rejects(core.requestJson('mock',{signal:controller.signal}),{name:'AbortError'});}
 finally{globalThis.fetch=original;}
});
await check('Shared request times out and does not leave retries hanging',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError'))));
 await assert.rejects(core.requestJson('mock',{timeoutMs:5,retries:0}),{name:'TimeoutError'});}
 finally{globalThis.fetch=original;}
});
await check('Shared request does not retry nontransient HTTP errors',async()=>{
 const original=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return {ok:false,status:400,headers:{get:()=>null}};};await assert.rejects(core.requestJson('mock',{retries:3}),{status:400});assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});
// Compatibility check: each project bundle contains the same shared runtime.
await check('Independent projects retain a self-contained runtime',()=>{
 for(const rel of ['trading-dashboard/dashboard/market-core.js','ATLASFLOW/js/core/market-core.js','data_pipeline/assets/js/market-core.js','trading-dashboard/radar/assets/js/market-core.js']){
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../'+rel,import.meta.url),'utf8'),context);
  assert.equal(typeof context.BinanceCore.ema,'function');assert.equal(context.BinanceCore.floorToStep(10.09,1),10);
 }
});
await check('Execution precision handles step sizes expressed with negative exponents',()=>{
 const context=vm.createContext({});
 vm.runInContext(fs.readFileSync(new URL('../data_pipeline/assets/js/market-core.js',import.meta.url),'utf8'),context);
 vm.runInContext(fs.readFileSync(new URL('../data_pipeline/assets/js/transforms.js',import.meta.url),'utf8'),context);
 assert.equal(vm.runInContext('countDecimals(1e-8)',context),8);
 const result=vm.runInContext('buildExecutionCheck("BTCUSDT","now",70000,{tickSize:"0.01",stepSize:"0.00000001",minQty:"0.00000001",maxQty:"100",minNotional:"5"})',context);
 assert.ok(result.rounded_quantity>0);
 assert.equal(result.precision.quantity_decimals,8);
 assert.equal(result.status,'valid_at_reference_price');
});
console.log(`Workspace tests: ${count} passed`);
