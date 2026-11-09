"""Deterministic public-market fixtures for the UI suite (no exchange connection)."""
import json
import math
import time
from urllib.parse import parse_qs, urlparse


def install_market_fixtures(context):
    controls = {'fail_klines': False, 'short_month': False}
    symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT',
               'DOGEUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT', 'SUIUSDT']

    def ticker(symbol):
        return dict(symbol=symbol, lastPrice='100', openPrice='95', highPrice='101',
                    lowPrice='90', priceChangePercent='5', quoteVolume='1000000000',
                    volume='10000000', count=100000, bidPrice='99.99', askPrice='100.01')

    def handle(route):
        url = urlparse(route.request.url)
        if url.hostname in {'localhost', '127.0.0.1'}:
            route.continue_()
            return
        if url.hostname in {'fonts.bunny.net', 'fonts.googleapis.com'}:
            route.fulfill(status=200, content_type='text/css', body='/* offline fonts */')
            return
        query = parse_qs(url.query)
        symbol = query.get('symbol', ['BTCUSDT'])[0]
        if url.path.endswith('/klines'):
            if controls['fail_klines']:
                route.fulfill(status=503,content_type='application/json',body='{}')
                return
            interval = query.get('interval', ['1h'])[0]
            duration = {'1M':2592000000,'1w':604800000,'1d':86400000,'4h':14400000,
                        '1h':3600000,'15m':900000,'5m':300000}.get(interval, 60000)
            count = int(query.get('limit', ['260'])[0])
            if controls['short_month'] and interval == '1M': count = 5
            end = int(time.time()*1000)//duration*duration
            if "endTime" in query: end = int(query["endTime"][0])//duration*duration
            payload = []
            for i in range(count):
                close = 100 + math.sin(i/5)*3 + math.cos(i/11)*2
                opened = close - math.sin(i/3)*0.6
                stamp = end-(count-1-i)*duration
                payload.append([stamp,str(opened),str(max(opened,close)+0.8),
                                str(min(opened,close)-0.8),str(close),str(1000+i%17*50),
                                stamp+duration-1,'100000',100,'500','50000','0'])
        elif url.path.endswith('/ticker/24hr'):
            requested=json.loads(query['symbols'][0]) if 'symbols' in query else symbols
            payload=ticker(symbol) if 'symbol' in query else [ticker(s) for s in requested]
        elif url.path.endswith('/ticker/bookTicker'):
            def book(s):
                return dict(symbol=s,bidPrice='99.99',askPrice='100.01',bidQty='100',askQty='100')
            payload=book(symbol) if 'symbol' in query else [book(s) for s in symbols]
        elif url.path.endswith('/ticker/price'):
            payload=dict(symbol=symbol,price='100')
        elif url.path.endswith('/exchangeInfo'):
            payload={'symbols':[dict(symbol=s,status='TRADING',quoteAsset='USDT',isSpotTradingAllowed=True) for s in symbols]}
        elif url.path.endswith('/global'):
            payload={'data':{'market_cap_percentage':{'btc':58.5},'total_market_cap':{'usd':2500000000000}}}
        elif '/fng' in url.path:
            payload={'data':[{'value':'55','value_classification':'Greed','timestamp':str(int(time.time()))}]}
        elif url.path.endswith('/time'):
            payload={'serverTime':int(time.time()*1000)}
        else:
            route.abort()
            return
        route.fulfill(status=200,content_type='application/json',body=json.dumps(payload))

    context.route('**/*', handle)
    # REST refreshes supply prices; a quiet local socket prevents live market traffic.
    context.add_init_script('''window.WebSocket = class extends EventTarget {
      static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
      constructor(){super();this.readyState=1;queueMicrotask(()=>{const event=new Event('open');this.onopen?.(event);this.dispatchEvent(event);});}
      close(){this.readyState=3;} send(){}
    };''')
    return controls
