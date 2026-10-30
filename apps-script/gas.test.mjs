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
test('market cap first, positive PER/PBR, five per market, descending ROE',()=>{
 const r=runtime(),d=r.ctx.setup();assert.equal(d.schemaVersion,6);assert.equal(d.rankMetric,'roe');assert.equal(d.stocks.length,10);assert.equal(r.calls.length,3);assert.equal(d.universe,undefined);
 for(const m of ['KOSPI','KOSDAQ']){const a=d.stocks.filter(s=>s.market===m);assert.equal(a.length,5);assert.ok(a.every(s=>s.marketCap>=1e12&&s.per>0&&s.pbr>0&&s.roe>0));assert.ok(a.every((s,i)=>i===0||a[i-1].roe>=s.roe));}
 assert.deepEqual(r.sheets.get('기존자료').rows,[['보존','원본']]);assert.equal(r.sheets.has('VC_일봉'),false);
});
test('exact 1tn boundary and both valuation ratios apply to every ranking',()=>{
 const r=runtime();const a={code:'000010',marketCap:1e12,pbr:.2,per:2,roe:20};
 assert.equal(r.ctx.baseEligible_(a),true);assert.equal(r.ctx.baseEligible_({...a,marketCap:1e12-1}),false);
 for(const metric of ['pbr','per','roe']){const out=r.ctx.rank_([a,{...a,code:'000020',per:-1,roe:999},{...a,code:'000030',pbr:-1,roe:999},{...a,code:'000040',per:null},{...a,code:'000050',pbr:0}],metric);assert.equal(out.length,1);assert.equal(out[0].code,'000010');}
});
test('main cache prevents requests and daily records do not duplicate',()=>{
 const r=runtime();r.ctx.setup();r.ctx.getDashboard('roe');assert.equal(r.calls.length,3);
 r.ctx.getDashboard('pbr');r.ctx.getDashboard('per');assert.equal(r.sheets.get('VC_선별순위').getLastRow(),31);
 r.cache.delete('screen6:roe');r.ctx.getDashboard('roe');assert.equal(r.sheets.get('VC_선별순위').getLastRow(),31);
 assert.throws(()=>r.ctx.getDashboard('other'),/정렬/);
});
test('actual latest quarter excludes forecast, compares exact prior and prior-year periods',()=>{
 const r=runtime(),f=r.ctx.parseQuarter_(JSON.stringify(quarterFixture('005930')),'005930','2026-10-30');
 assert.equal(f.period,'202606');assert.equal(f.op,20);assert.equal(f.previousPeriod,'202603');assert.equal(f.previous,7);assert.equal(f.yoyPeriod,'202506');assert.equal(f.yoy,-10);assert.equal(f.turnaround,true);
 assert.equal(r.ctx.quarterShift_('202603',-1),'202512');assert.equal(r.ctx.quarterShift_('202603',-4),'202503');
});
test('zero or missing profits never count as loss-to-profit and latest data cannot be silently skipped',()=>{
 const r=runtime();
 for(const patch of [{'202506':'0'},{'202606':'0'},{'202506':'3'},{'202606':'-1'}])assert.equal(r.ctx.parseQuarter_(JSON.stringify(quarterFixture('005930',patch)),'005930','2026-10-30').turnaround,false);
 for(const patch of [{'202506':'-'},{'202606':'-'},{'202603':'-'}])assert.throws(()=>r.ctx.parseQuarter_(JSON.stringify(quarterFixture('005930',patch)),'005930','2026-10-30'),/부족/);
 const body=quarterFixture('005930');body.financeInfo.trTitleList.find(t=>t.key==='202609').isConsensus='N';body.financeInfo.rowList[0].columns['202609'].value='-';
 assert.throws(()=>r.ctx.parseQuarter_(JSON.stringify(body),'005930','2026-10-30'),/부족/);
 assert.throws(()=>r.ctx.parseQuarter_(JSON.stringify(quarterFixture('000660')),'005930','2026-10-30'),/불일치/);
 assert.equal(r.ctx.financeNumber_('(1,250.5)'),-1250.5);assert.equal(r.ctx.financeNumber_('-'),null);
});
test('turnaround scans only large positive-equity stocks, allows missing/negative PER, at most 25 per batch',()=>{
 const r=runtime();r.ctx.setup();const t=r.ctx.getTurnarounds('roe');assert.equal(t.status,'complete');assert.equal(t.checked,t.total);assert.ok(t.hits.some(s=>s.per===null));assert.ok(t.hits.some(s=>s.per<0));assert.ok(t.hits.every(s=>s.marketCap>=1e12&&s.pbr>0&&s.finance.op>0&&s.finance.yoy<0));
 assert.ok(r.batches.filter(b=>b[0].includes('/finance/quarter')).every(b=>b.length<=25));assert.equal(t.hits.length,t.total);assert.equal(r.sheets.get('VC_흑자전환').getLastRow(),t.hits.length+1);
 assert.ok(r.calls.every(u=>!u.includes('sise.nhn')));
});
test('six-hour quarter facts survive cache eviction through Sheets without refetching',()=>{
 const r=runtime();r.ctx.setup();r.ctx.getTurnarounds('roe');const n=r.calls.length;r.ctx.getTurnarounds('roe');assert.equal(r.calls.length,n);
 r.cache.clear();r.ctx.getTurnarounds('roe');assert.equal(r.calls.length,n);
});
test('failed quarterly fetch is unknown, does not create false turnaround, and does not poison base ranks',()=>{
 const r=runtime();r.ctx.setup();r.block('/stock/100010/');const t=r.ctx.getTurnarounds('roe');assert.equal(t.status,'partial');assert.equal(t.errors.length,1);assert.equal(t.total-t.checked,1);assert.equal(t.hits.some(s=>s.code==='100010'),false);assert.equal(r.ctx.getDashboard('roe').stocks.length,10);
});
test('market source failure reports last ranking as stale and strips internal universe',()=>{
 const r=runtime();r.ctx.setup();r.cache.clear();r.fail();const d=r.ctx.getDashboard('roe');assert.equal(d.stale,true);assert.equal(d.universe,undefined);assert.equal(d.stocks.length,10);
});
test('JSON snapshots chunk, source renders, and default UI is high ROE',()=>{
 const r=runtime({large:550});r.ctx.setup();const snap=r.sheets.get('VC_선별스냅샷').rows.slice(1);assert.ok(snap.length>1);assert.ok(snap.every(row=>row[3].length<=40000));assert.ok(r.ctx.last_('roe').universe.length>1000);
 const html=r.ctx.page_();assert.equal(html.trimEnd(),fs.readFileSync(new URL('./Index.html',import.meta.url),'utf8').trimEnd());new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);assert.match(html,/var metric='roe'/);assert.match(html,/getTurnarounds\(metric\)/);assert.match(html,/14 미만: 과열 주의/);assert.doesNotMatch(source,/crossToday|sise\.nhn/);
});
test('quarter status distinguishes no matches from incomplete coverage in rendered HTML',()=>{
 const r=runtime(),js=r.ctx.page_().match(/<script>([\s\S]*?)<\/script>/)[1];const nodes={};const ui={document:{getElementById:id=>nodes[id]??={}},Intl,Date};vm.createContext(ui);new vm.Script(js.slice(0,js.indexOf('function load(){'))).runInContext(ui);
 const t={checked:2,total:2,hits:[],errors:[],marketErrors:[],counts:{KOSPI:{total:1,checked:1,hits:0,unknown:0},KOSDAQ:{total:1,checked:1,hits:0,unknown:0}},checkedAt:'2026-10-30T00:00:00Z'};
 ui.renderTurnarounds(t);assert.match(nodes['turn-results'].innerHTML,/해당 없음/);assert.doesNotMatch(nodes['turn-results'].innerHTML,/미확인 자료/);
 t.errors=[{code:'005930',name:'시험기업',market:'KOSPI',error:'부족'}];t.counts.KOSPI.unknown=1;ui.renderTurnarounds(t);assert.match(nodes['turn-results'].innerHTML,/미확인 자료가 남아/);
});
test('Sheets-coerced dates and numeric codes are migrated without duplicate keys',()=>{
 const r=runtime();r.ctx.setup();const s=r.sheets.get('VC_선별순위'),old=s.rows[1].slice();old[0]=new Date('2026-10-28T15:00:00Z');old[2]=1380;s.rows=[s.rows[0],old,old.slice()];const incoming=old.slice();incoming[0]='2026-10-29';incoming[2]='001380';r.ctx.upsert_('VC_선별순위',s.rows[0],[incoming],[0,1,2]);assert.equal(s.getLastRow(),2);assert.equal(s.rows[1][0],'2026-10-29');assert.equal(s.rows[1][2],'001380');
});
