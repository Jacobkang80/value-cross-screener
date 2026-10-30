import test from 'node:test';import assert from 'node:assert/strict';
import {createCollector,createHandler,completedDate,parseBars,parseVix} from '../src/server.mjs';
const asOf='2026-10-29',now=()=>new Date('2026-10-30T00:00:00Z');
const bars=Array.from({length:100},(_,i)=>{const d=new Date('2026-10-29T00:00:00Z');d.setUTCDate(d.getUTCDate()-(99-i));return `<item data="${d.toISOString().slice(0,10).replaceAll('-','')}|100|100|100|${i===99?120:100}|10"/>`;}).join('');
function mock({failChart=false,failListing=false}={}){const calls=[],f=async(url)=>{url=String(url);calls.push(url);
 if(url.includes('getJsonData'))return new Response('',{status:403});
 if(url.includes('VIX_History'))return new Response('DATE,OPEN,HIGH,LOW,CLOSE\n10/28/2026,18,19,16,16.91\n');
 if(url.includes('/index/'))return Response.json([{localTradedAt:asOf}]);
 if(url.includes('market/stock')){if(failListing&&url.includes('KOSDAQ'))return new Response('',{status:503});const offset=url.includes('KOSPI')?100000:200000;return Response.json(Array.from({length:550},(_,i)=>({itemcode:String(offset+i*10),itemname:'s'+i,type:'ST',tradeStopYn:'N',per:3+i,pbr:1+i/10,roe:20,marketSum:100000})));}
 if(url.includes('sise.nhn'))return new Response(failChart&&url.includes('100000')?'':bars);
 throw Error('unknown URL '+url);
 };return {f,calls};}
test('each metric fetches at most 20 charts; repeat requests reuse daily bars',async()=>{const {f,calls}=mock(),collect=createCollector(f,now),d=await collect('pbr');assert.equal(d.stocks.length,20);assert.equal(d.status,'complete');assert.equal(calls.filter(u=>u.includes('sise.nhn')).length,20);assert.equal(d.officialStatus,'unavailable');assert.equal(d.vix.value,16.91);await collect('pbr');assert.equal(calls.filter(u=>u.includes('sise.nhn')).length,20);await collect('per');assert.equal(calls.filter(u=>u.includes('sise.nhn')).length,20);await collect('roe');assert.equal(calls.filter(u=>u.includes('sise.nhn')).length,20);});
test('partial failures remain visible; never substitute lower ranked symbols',async()=>{const {f,calls}=mock({failChart:true,failListing:true}),d=await createCollector(f,now)('pbr');assert.equal(d.status,'partial');assert.equal(d.errors.length,1);assert.equal(d.stocks.length,10);assert.equal(d.stocks[0].priceStatus,'insufficient');assert.equal(calls.filter(u=>u.includes('sise.nhn')).length,10);});
test('intraday and weekend completed date selection',()=>{const rows=[{localTradedAt:'2026-10-30'},{localTradedAt:asOf}];assert.equal(completedDate(rows,new Date('2026-10-30T02:00:00Z')),asOf);assert.equal(completedDate(rows,new Date('2026-10-30T07:30:00Z')),'2026-10-30');assert.equal(completedDate(rows,new Date('2026-11-01T02:00:00Z')),'2026-10-30');});
test('deduplicate bars, reject short/stale data, tolerate CSV CRLF',()=>{assert.equal(parseBars(bars+bars,asOf).length,100);assert.throws(()=>parseBars(bars,'2026-10-30'),/최신/);assert.throws(()=>parseBars('',asOf),/부족/);assert.equal(parseVix('DATE,OPEN,HIGH,LOW,CLOSE\r\n10/28/2026,1,2,3,16.91\r\n',now()).value,16.91);});
test('API rejects arbitrary metric without calling upstream',async()=>{const {f,calls}=mock(),h=createHandler('<html lang="ko">test</html>',f),bad=await h(new Request('https://test/api/screen?metric=x'));assert.equal(bad.status,400);assert.equal(calls.length,0);assert.match(await (await h(new Request('https://test/'))).text(),/<html/);});
