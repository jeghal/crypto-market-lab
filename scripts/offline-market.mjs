import fs from 'node:fs';
import path from 'node:path';
const nativeTimer=globalThis.setTimeout;
globalThis.setTimeout=(fn,ms,...args)=>nativeTimer(fn,[60,10000].includes(ms)?0:ms,...args);
globalThis.fetch=async input=>{
  const value=String(input);
  if(!/^https?:/.test(value)){
    const file=path.resolve(process.cwd(),decodeURIComponent(value));
    return new Response(fs.existsSync(file)?fs.readFileSync(file):'',{status:fs.existsSync(file)?200:404});
  }
  const url=new URL(value);const p=url.searchParams;const now=Date.now();const symbol=p.get('symbol')||'BTCUSDT';let data;
  if(url.pathname.endsWith('/time'))data={serverTime:now};
  else if(url.pathname.endsWith('/exchangeInfo'))data={symbols:JSON.parse(p.get('symbols')||'["BTCUSDT","ETHUSDT","SOLUSDT"]').map(s=>({symbol:s,status:'TRADING',quoteAsset:'USDT',baseAssetPrecision:8,quoteAssetPrecision:8,filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'},{filterType:'LOT_SIZE',stepSize:'0.00000001',minQty:'0.00000001',maxQty:'100000'},{filterType:'NOTIONAL',minNotional:'5'}]}))};
  else if(url.pathname.endsWith('/klines')){
    const duration={'1d':86400000,'4h':14400000,'1h':3600000,'15m':900000}[p.get('interval')];const end=Math.floor(now/duration)*duration;
    data=Array.from({length:Number(p.get('limit'))},(_,i)=>{const t=end-(Number(p.get('limit'))-i-1)*duration;const c=100+Math.sin(i/5)*3;return [t,'100',String(Math.max(100,c)+1),String(Math.min(100,c)-1),String(c),'1000',t+duration-1,'100000',100,'500','50000','0'];});
  }else if(url.pathname.endsWith('/ticker/bookTicker'))data={symbol,bidPrice:'99.99',askPrice:'100.01',bidQty:'100',askQty:'100'};
  else if(url.pathname.endsWith('/ticker/24hr'))data={symbol,lastPrice:'100',priceChangePercent:'2',highPrice:'105',lowPrice:'95',quoteVolume:'100000000',volume:'1000000',count:100000};
  else if(url.pathname.endsWith('/depth'))data={lastUpdateId:1,bids:Array.from({length:10},(_,i)=>[String(99.99-i/100),'10']),asks:Array.from({length:10},(_,i)=>[String(100.01+i/100),'10'])};
  else if(url.pathname.endsWith('/aggTrades'))data=Array.from({length:3},(_,i)=>({a:Number(p.get('startTime'))+i,p:'100',q:'1',T:Number(p.get('startTime'))+i,m:i%2===0}));
  else throw new Error('Unmocked market request: '+url.pathname);
  return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
};
