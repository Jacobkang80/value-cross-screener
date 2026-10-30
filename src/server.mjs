import {rankCandidates,signal} from './engine.mjs';
export const MARKET_URL=m=>`https://stock.naver.com/api/domestic/market/stock/default?tradeType=KRX&marketType=${m}&orderType=marketSum&startIdx=0&pageSize=5000`;
export const VIX_URL='https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
export const INDEX_URL='https://m.stock.naver.com/api/index/KOSPI/price?pageSize=5&page=1';
export function number(x){const v=typeof x==='number'?x:Number(String(x??'').replaceAll(',','').replace('%',''));return x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(v)?v:null;}
export function ordinary(rows){return rows.filter(s=>s.type==='ST'&&/^[0-9]{5}0$/.test(s.itemcode??'')&&!/스팩/.test(s.itemname??''));}
export function normalized(rows,market){return ordinary(rows).filter(s=>s.tradeStopYn==='N').map(s=>({code:s.itemcode,name:s.itemname,market,pbr:number(s.pbr),per:number(s.per),roe:number(s.roe),valuationPrice:number(s.nowPrice),source:MARKET_URL(market),fundamentalPeriod:'네이버 제공 ROE · 결산기간 미제공'}));}
export function aggregate(rows,market){
 const result={market,officialIndex:false,basis:'수집 보통주 합산 참고값 · KRX 공식 지수 아님',source:MARKET_URL(market)};
 for(const k of ['per','pbr']){const a=ordinary(rows).filter(s=>number(s[k])>0&&number(s.marketSum)>0),cap=a.reduce((v,s)=>v+number(s.marketSum),0),den=a.reduce((v,s)=>v+number(s.marketSum)/number(s[k]),0);result[k]=den>0?cap/den:null;result[k+'Count']=a.length;}
 return result;
}
export function completedDate(rows,now=new Date()){
 const kst=new Date(now.getTime()+9*3600000),today=kst.toISOString().slice(0,10),settled=kst.getUTCHours()*60+kst.getUTCMinutes()>=16*60+30;
 const dates=rows.map(r=>String(r.localTradedAt??'').slice(0,10)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&(settled?d<=today:d<today));
 if(!dates.length)throw Error('완료된 거래일 확인 불가');return dates.sort().at(-1);
}
export function parseBars(xml,asOf){
 const rows=new Map();
 for(const match of xml.matchAll(/<item\s+data="([^"]+)"/g)){const a=match[1].split('|'),raw=a[0];if(!/^\d{8}$/.test(raw))continue;const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`,close=number(a[4]);if(date<=asOf&&close>0)rows.set(date,{date,close,volume:number(a[5])});}
 const bars=[...rows.values()].sort((a,b)=>a.date.localeCompare(b.date));
 if(bars.length<81)throw Error(`일봉 부족: ${bars.length}/81`);
 if(bars.at(-1).date!==asOf)throw Error(`최신 일봉 없음: ${bars.at(-1).date}`);return bars;
}
export function parseVix(csv,now=new Date()){
 const rows=csv.trim().split(/\r?\n/).slice(1).map(line=>{const a=line.split(','),m=a[0]?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?{asOf:`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`,value:number(a[4])}:null;}).filter(r=>r&&r.value>0&&r.asOf<=now.toISOString().slice(0,10)).sort((a,b)=>a.asOf.localeCompare(b.asOf));
 if(!rows.length)throw Error('VIX 종가 확인 불가');return {...rows.at(-1),status:'ok',source:VIX_URL};
}
export function parseOfficial(raw,asOf){
 const rows=raw.output??raw.OutBlock_1??[],result=[];
 for(const [market,name] of [['KOSPI','코스피'],['KOSDAQ','코스닥']]){
 const row=rows.find(r=>String(r.IDX_NM??r.ISU_ABBRV??'').replaceAll(' ','')===name);
 if(row&&number(row.PER)>0&&number(row.PBR)>0)result.push({market,per:number(row.PER),pbr:number(row.PBR),asOf,officialIndex:true,source:'https://data.krx.co.kr/',basis:'KRX 지수 PER·PBR'});
 }return result;
}
export function createCollector(fetcher=fetch,nowFn=()=>new Date()){
 const memo=new Map(),pending=new Map();
 async function cached(key,ttl,fn){const old=memo.get(key);if(old&&Date.now()-old.time<ttl)return old.value;if(pending.has(key))return pending.get(key);const p=fn().then(value=>{if(memo.size>256)memo.clear();memo.set(key,{time:Date.now(),value});return value;}).finally(()=>pending.delete(key));pending.set(key,p);return p;}
 async function request(url,options={}){let r;try{r=await fetcher(url,{...options,signal:options.signal??AbortSignal.timeout(15000),headers:{'User-Agent':'SeokwooStockScreener/1.0','Referer':'https://stock.naver.com/',...options.headers}});}catch(e){throw Error(e.message+(e.cause?.code?' ('+e.cause.code+')':''));}if(!r.ok)throw Error(`공급자 HTTP ${r.status}`);return r;}
 async function listings(m){return cached('list:'+m,600000,async()=>{const rows=await (await request(MARKET_URL(m))).json();if(!Array.isArray(rows)||rows.length<500||rows.length>=5000)throw Error('시장 목록 불완전');if(new Set(rows.map(s=>s.itemcode)).size!==rows.length)throw Error('시장 목록 중복');return {rows,collectedAt:nowFn().toISOString()};});}
 async function date(){return cached('date',120000,async()=>completedDate(await (await request(INDEX_URL)).json(),nowFn()));}
 async function vix(){try{return await cached('vix',1800000,async()=>({...parseVix(await (await request(VIX_URL)).text(),nowFn()),collectedAt:nowFn().toISOString()}));}catch(e){return {value:null,status:'error',error:e.message,source:VIX_URL};}}
 async function official(asOf){try{return await cached('krx:'+asOf,3600000,async()=>{
 const body=new URLSearchParams({bld:'dbms/MDC/STAT/standard/MDCSTAT00701',locale:'ko_KR',trdDd:asOf.replaceAll('-',''),idxIndMidclssCd:'01',share:'1',money:'1',csvxls_isNo:'false'});
 const r=await request('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd',{method:'POST',body,signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':'https://data.krx.co.kr/'}});
 const values=parseOfficial(await r.json(),asOf);return {values,status:values.length===2?'ok':'unavailable'};
 });}catch(e){return {values:[],status:'unavailable',error:e.message};}}
 async function chart(s,asOf){const url=`https://fchart.stock.naver.com/sise.nhn?symbol=${s.code}&timeframe=day&count=100&requestType=0`;
 try{const bars=await cached('bars:'+s.code+':'+asOf,86400000,async()=>parseBars(await (await request(url)).text(),asOf)),prices=bars.map(r=>r.close);return {...s,prices,dates:bars.map(r=>r.date),volumes:bars.map(r=>r.volume),priceStatus:'ok',priceSource:url,asOf,crossToday:signal({prices})!==null};}
 catch(e){return {...s,prices:[],priceStatus:e.message.startsWith('일봉 부족')?'insufficient':'error',priceError:e.message,priceSource:url,asOf};}
 }
 return async function collect(metric='pbr'){
 if(!['pbr','per','roe'].includes(metric))throw Error('지원하지 않는 정렬');
 const now=nowFn(),errors=[],stocks=[],markets=[],counts={};
 const [asOf,v,groups]=await Promise.all([date(),vix(),Promise.all(['KOSPI','KOSDAQ'].map(async market=>{try{return {market,...await listings(market)};}catch(e){errors.push({market,error:e.message});return {market,rows:[],collectedAt:null};}}))]);
 const krxPromise=official(asOf);
 for(const g of groups){if(!g.rows.length)continue;const valid=normalized(g.rows,g.market).filter(s=>['pbr','per','roe'].every(k=>s[k]>0)),candidates=rankCandidates(valid,metric,10);
 counts[g.market]={listed:g.rows.length,valid:valid.length,candidates:candidates.length};
 markets.push({...aggregate(g.rows,g.market),asOf,collectedAt:g.collectedAt});
 // Rank before fetching bars. At most ten symbols per market, six requests at a time.
 for(let i=0;i<candidates.length;i+=6)stocks.push(...await Promise.all(candidates.slice(i,i+6).map(s=>chart({...s,fundamentalsCollectedAt:g.collectedAt},asOf))));
 }
 const krx=await krxPromise;
 return {schemaVersion:3,mode:'collected',rankMetric:metric,candidateLimit:10,asOf,collectedAt:now.toISOString(),markets,officialMarkets:krx.values,officialStatus:krx.status,vix:v,stocks,counts,errors,status:errors.length||stocks.some(s=>s.priceStatus!=='ok')?'partial':'complete',method:{rankFirst:true,dailyBarLimitPerMarket:10,barCount:100,cacheMinutes:10,multipleFormula:'PER × PBR',dateRule:'한국 16:30 이전에는 전 거래일 완료 일봉',roe:'네이버 제공값; PBR/PER로 대체하지 않음'},sheetAutoSave:false};
 };
}
export function createHandler(page,fetcher=fetch){
 const collect=createCollector(fetcher),active=new Map(),memory=new Map();
 return async function handle(request,env,ctx){
 const url=new URL(request.url);
 if(url.pathname==='/api/screen'){
 const metric=url.searchParams.get('metric')??'pbr';if(!['pbr','per','roe'].includes(metric))return Response.json({error:'지원하지 않는 정렬'},{status:400});
 const cacheKey=new Request(`${url.origin}/api/screen?metric=${metric}`),edge=globalThis.caches?.default;
 const hit=edge?await edge.match(cacheKey):null;if(hit)return hit;
 const old=memory.get(metric);if(old&&Date.now()-old.time<600000)return Response.json(old.value,{headers:{'Cache-Control':'private, no-store'}});
 try{if(!active.has(metric))active.set(metric,collect(metric).finally(()=>active.delete(metric)));const result=await active.get(metric),complete=result.status==='complete'&&result.vix.status==='ok';
 if(complete)memory.set(metric,{time:Date.now(),value:result});
 const response=Response.json(result,{headers:{'Cache-Control':complete?'max-age=0, s-maxage=600':'no-store'}});
 if(complete&&edge&&ctx?.waitUntil)ctx.waitUntil(edge.put(cacheKey,response.clone()));return response;
 }catch(e){return Response.json({error:e.message,collectedAt:new Date().toISOString()},{status:502,headers:{'Cache-Control':'no-store'}});}
 }
 if(url.pathname==='/health')return Response.json({ok:true,version:3});
 if(url.pathname!=='/'&&url.pathname!=='/index.html')return new Response('Not found',{status:404});
 return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 };
}
