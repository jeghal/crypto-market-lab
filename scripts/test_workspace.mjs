import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import '../shared/market-core.js';
const core=globalThis.BinanceCore;
let count=0;
async function check(name,fn){await fn();count++;console.log(`PASS ${name}`);}
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
