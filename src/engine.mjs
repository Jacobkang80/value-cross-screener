export function sma(prices,n,end=prices.length-1){
 if(end<n-1)return null;const a=prices.slice(end-n+1,end+1);
 return a.length===n&&a.every(x=>Number.isFinite(x)&&x>0)?a.reduce((s,x)=>s+x,0)/n:null;
}
export function signal(stock){
 const p=stock.prices??[],a=sma(p,5),b=sma(p,80),c=sma(p,5,p.length-2),d=sma(p,80,p.length-2);
 return [a,b,c,d].every(Number.isFinite)&&a>b&&c<=d?{ma5:a,ma80:b,prev5:c,prev80:d,ago:0}:null;
}
export function multiple(per,pbr){return Number.isFinite(per)&&per>0&&Number.isFinite(pbr)&&pbr>0?per*pbr:null;}
export function rankCandidates(stocks,metric='pbr',limit=10){
 if(!['pbr','per','roe'].includes(metric))throw Error('지원하지 않는 정렬');
 return stocks.filter(s=>['pbr','per','roe'].every(k=>Number.isFinite(s[k])&&s[k]>0))
 .sort((a,b)=>(metric==='roe'?-1:1)*(a[metric]-b[metric])||a.pbr-b.pbr||a.per-b.per||b.roe-a.roe||a.code.localeCompare(b.code))
 .slice(0,limit).map((s,i)=>({...s,valueRank:i+1}));
}
export function screen(stocks,{market='ALL'}={}){
 return stocks.filter(s=>(market==='ALL'||s.market===market)&&s.priceStatus==='ok').map(s=>({...s,signal:signal(s)})).filter(s=>s.signal)
 .sort((a,b)=>a.valueRank-b.valueRank||a.market.localeCompare(b.market));
}
export function emptyState(data,selection={}){
 if(!data||data.mode!=='collected')return 'unavailable';
 if(screen(data.stocks,selection).length)return 'results';
 const selected=m=>!selection.market||selection.market==='ALL'||m===selection.market;
 return data.errors.some(e=>!e.market||selected(e.market))||data.stocks.some(s=>selected(s.market)&&s.priceStatus!=='ok')?'unavailable':'none';
}
