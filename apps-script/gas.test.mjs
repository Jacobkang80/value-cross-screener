import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./Code.gs',import.meta.url),'utf8');
class Sheet{
 constructor(){this.rows=[];}
 getLastRow(){let n=this.rows.length;while(n&&this.rows[n-1].every(v=>v===''))n--;return n;}
 getRange(r,c,n,m){const self=this;return {
  setValues(a){assert.equal(a.length,n);a.forEach((line,i)=>{assert.equal(line.length,m);self.rows[r+i-1]??=[];line.forEach((v,j)=>self.rows[r+i-1][c+j-1]=v);});return this;},
  getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[r+i-1]?.[c+j-1]??''));},
  clearContent(){for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(self.rows[r+i-1])self.rows[r+i-1][c+j-1]='';return this;},
  setNumberFormat(){return this;},setBackground(){return this;},setFontWeight(){return this;}
 };}
 setFrozenRows(){}
 appendRow(r){this.rows.push(r);}
}
function quarterFixture(code,patch={}){
 const titles=['202506','202509','202512','202603','202606','202609'].map(key=>({key,isConsensus:key==='202609'?'Y':'N'}));
 const values={'202506':'-10','202509':'5','202512':'6','202603':'7','202606':'20','202609':'999999'};
 return {itemCode:code,financePeriodType:'quarter',financeInfo:{trTitleList:titles,rowList:[{title:'영업이익',columns:Object.fromEntries(Object.entries({...values,...patch}).map(([key,value])=>[key,{value}]))}]}};
}
function runtime({large=40}={}){
 const sheets=new Map([['기존자료',Object.assign(new Sheet(),{rows:[['보존','원본']]})]]),cache=new Map(),props=new Map(),calls=[],batches=[];
 let blocked='',failure=false;
 class FakeDate extends Date{constructor(...a){super(...(a.length?a:['2026-10-30T00:00:00Z']));}static now(){return Date.parse('2026-10-30T00:00:00Z');}}
 const ctx={Date:FakeDate,console,Logger:{log(){}},
  PropertiesService:{getScriptProperties:()=>({setProperty:(k,v)=>props.set(k,v),getProperty:k=>props.get(k)})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,put:(k,v)=>cache.set(k,v),removeAll:keys=>keys.forEach(k=>cache.delete(k))})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  SpreadsheetApp:{openById:()=>({getSheetByName:n=>sheets.get(n),insertSheet:n=>{const s=new Sheet();sheets.set(n,s);return s;}}),flush(){}},
  Utilities:{newBlob:t=>({getBytes:()=>Array.from(Buffer.from(t))}),formatDate:(date,zone,fmt)=>{const d=new Date(date.getTime()+(zone==='Asia/Seoul'?9:zone==='America/New_York'?-4:0)*3600000);return fmt==='HHmm'?'0900':d.toISOString().slice(0,10);}},
  HtmlService:{createHtmlOutput:html=>({html,setTitle(){return this;},addMetaTag(){return this;}})},
  UrlFetchApp:{fetchAll:opts=>{
   if(failure)throw Error('공급자 연결 실패');batches.push(opts.map(o=>o.url));
   return opts.map(o=>{
    calls.push(o.url);if(blocked&&o.url.includes(blocked))return {getResponseCode:()=>503,getContentText:()=>''};
    let body;
    if(o.url.includes('/market/stock/')){
     const offset=o.url.includes('KOSPI')?100000:200000;
     body=JSON.stringify(Array.from({length:550},(_,i)=>({type:'ST',itemcode:String(offset+i*10),itemname:'종목'+i,tradeStopYn:'N',pbr:i===2?-.1:1+i/10,per:i===0?-1:i===1?null:100+i,roe:1+i,marketSum:i===4?999999999999:i<large?1000000000000+i*10000000000:900000000000,nowPrice:100})));
    }else if(o.url.includes('VIX_History'))body='DATE,OPEN,HIGH,LOW,CLOSE\n10/28/2026,18,19,16,16.91\n';
    else if(o.url.includes('/finance/quarter')){const code=o.url.match(/stock\/(\d{6})/)[1];body=JSON.stringify(quarterFixture(code));}
    else throw Error('Unexpected fetch '+o.url);
    return {getResponseCode:()=>200,getContentText:()=>body};
   });
  }}
 };
 vm.createContext(ctx);new vm.Script(source).runInContext(ctx);return {ctx,sheets,cache,calls,batches,block:s=>blocked=s,fail:()=>failure=true};
}
test('one collection produces independently sorted eligible rankings and persists both',()=>{
 const r=runtime(),d=r.ctx.setup();assert.equal(r.calls.length,3);assert.equal(d.stocks.length,10);assert.equal(d.roeStocks.length,10);
 for(const m of ['KOSPI','KOSDAQ']){const a=d.stocks.filter(x=>x.market===m),b=d.roeStocks.filter(x=>x.market===m);assert.ok(a.every(x=>x.marketCap>=1e12&&x.per>0&&x.pbr>0&&x.multiple===x.per*x.pbr));assert.ok(a.every((x,i)=>!i||a[i-1].multiple<=x.multiple));assert.ok(b.every((x,i)=>x.roe>0&&(!i||b[i-1].roe>=x.roe)));}
 assert.equal(r.sheets.get('VC_선별순위').getLastRow(),21);r.ctx.getDashboard('multiple');assert.equal(r.calls.length,3);assert.ok(r.calls.every(x=>!x.includes('finance/quarter')));
});
test('boundary and invalid valuations excluded from both rankings',()=>{
 const r=runtime(),a={code:'000010',marketCap:1e12,pbr:.2,per:2,roe:20};for(const metric of ['multiple','roe']){const rows=r.ctx.rank_([a,{...a,code:'000020',per:-1},{...a,code:'000030',pbr:0},{...a,code:'000040',marketCap:1e12-1}],metric);assert.equal(rows.length,1);assert.equal(rows[0].multiple,.4);}
});
test('outage falls back to previously saved two ranking lists',()=>{const r=runtime();r.ctx.setup();r.cache.clear();r.fail();const d=r.ctx.getDashboard('multiple');assert.equal(d.stale,true);assert.equal(d.stocks.length,10);assert.equal(d.roeStocks.length,10);});
test('HTML matches deployed page and has no turnaround requests',()=>{const r=runtime(),h=r.ctx.page_();assert.equal(h.trimEnd(),fs.readFileSync(new URL('./Index.html',import.meta.url),'utf8').trimEnd());new vm.Script(h.match(/<script>([\s\S]*?)<\/script>/)[1]);assert.match(h,/저멀티플 TOP 5/);assert.match(h,/고ROE TOP 5/);assert.doesNotMatch(h,/흑자전환|getTurnarounds/);});
