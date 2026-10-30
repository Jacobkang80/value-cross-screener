const SNAPSHOTS=JSON.parse(document.querySelector('#snapshot-data')?.textContent??'{}');
const standalone=document.body.dataset.standalone==='true';
const state={market:'ALL',metric:'pbr'};
let sourceMessage='';
let data=null,results=[],lastFocus=null,loading=false,requestId=0,loadError=null;
const $=s=>document.querySelector(s),labels={pbr:'PBR 낮은 순',per:'PER 낮은 순',roe:'ROE 높은 순'};
const fmt=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('ko-KR',{minimumFractionDigits:d,maximumFractionDigits:d}):'확인 불가';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=t=>t?new Date(t).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'확인 불가';
function chart(s,large=false){
 const start=Math.max(79,s.prices.length-30),p=s.prices.slice(start),a=p.map((_,i)=>sma(s.prices,5,start+i)),b=p.map((_,i)=>sma(s.prices,80,start+i));
 if(p.length<2)return '<p>차트 데이터 부족</p>';
 const all=[...p,...a,...b],lo=Math.min(...all)*.99,hi=Math.max(...all)*1.015,H=large?190:110;
 const path=values=>values.map((v,i)=>(i?'L':'M')+(4+i*392/(values.length-1)).toFixed(1)+','+(H-8-(v-lo)/(hi-lo)*(H-16)).toFixed(1)).join(' ');
 return `<svg class="spark" viewBox="0 0 400 ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(s.name)} 종가와 5일·80일선"><path d="${path(p)}" fill="none" stroke="#cdd5c6" stroke-width="1.3"/><path d="${path(b)}" fill="none" stroke="#af8c4a" stroke-width="1.8"/><path d="${path(a)}" fill="none" stroke="#387352" stroke-width="2.5"/></svg>`;
}
function benchmarks(){
 $('#benchmarks').innerHTML=['KOSPI','KOSDAQ'].map(m=>{
 const official=data?.officialMarkets?.find(s=>s.market===m),ref=data?.markets?.find(s=>s.market===m),value=official??ref;
 const basis=official?'KRX 공식 지수':'보통주 합산 · 참고값';
 return `<article class="benchmark"><div class="benchmark-top"><strong>${m}</strong><span>${basis}</span></div><div class="multiple-pair"><div><div class="label">PER</div><b>${fmt(value?.per)}</b><span class="unit">배</span></div><div><div class="label">PBR</div><b>${fmt(value?.pbr)}</b><span class="unit">배</span></div></div><div class="multiple-result"><small>멀티플 · PER × PBR</small><b>${fmt(multiple(value?.per,value?.pbr))}</b></div><div class="benchmark-foot">${official?esc(official.asOf)+' · KRX 공식 지수':'KRX 공식 지수 PER·PBR은 미확보입니다.<br>위 숫자는 실제 수집한 보통주의 합산 참고값입니다.'}</div>${ref?`<details class="reference"><summary>계산 기준 · 출처</summary><p>Σ시총 ÷ Σ(시총/지표), 양수 지표별 집계<br>PER ${ref.perCount}개 / PBR ${ref.pbrCount}개<br>조회 ${esc(stamp(ref.collectedAt))}<br>재무 참조가격과 일봉 기준시점은 다를 수 있습니다.</p></details>`:''}</article>`;
 }).join('')+`<article class="benchmark vix"><div class="benchmark-top"><strong>VIX</strong><span>Cboe · 미국 일별 종가</span></div><div class="vix-number"><b>${fmt(data?.vix?.value)}</b></div><div class="benchmark-foot">미국 기준일 ${esc(data?.vix?.asOf??'미확보')}<br>수집 ${esc(stamp(data?.vix?.collectedAt))}<br>실시간 지수가 아닌 공급자의 최신 제공 종가</div></article>`;
}
function card(s){
 const gain=(s.prices.at(-1)/s.prices.at(-2)-1)*100;
 return `<article class="stock"><div class="card-top"><span class="rank">가치순위 <b>${s.valueRank}</b> / 10</span><span class="market">${s.market}</span></div><h3 class="stock-name"><a target="_blank" rel="noopener noreferrer" href="https://stock.naver.com/domestic/stock/${s.code}">${esc(s.name)}</a></h3><div class="stock-meta">${s.code}</div><div class="price">${fmt(s.prices.at(-1),0)}<span> 원</span></div><div class="gain ${gain<0?'down':''}">${gain>0?'+':''}${fmt(gain)}% · 전일 대비</div>${chart(s)}<div class="chart-legend"><span>종가 · 최근 ${s.prices.length-79}거래일</span><div class="legend-lines"><span>5일</span><span>80일</span></div></div><div class="stats">${[['pbr','PBR','배'],['per','PER','배'],['roe','ROE','%']].map(([k,l,u])=>`<div class="${state.metric===k?'selected':''}"><small>${l}</small><b>${fmt(s[k])}<i>${u}</i></b></div>`).join('')}</div><div class="cross-info"><strong>5일선 / 80일선 상향 돌파</strong><span>${esc(s.asOf)}</span></div><button class="detail-btn" data-code="${s.code}">계산 근거 <span>↗</span></button></article>`;
}
function render(){
 if(loading&&!data){$('#summary').textContent=`${labels[state.metric]} · 최신 데이터 조회 중`;$('#cards').innerHTML='<div class="empty">시장별 상위 10개 종목 확인 중</div>';return;}
 if(!data||loadError){$('#summary').textContent='조회 실패';$('#cards').innerHTML=`<div class="empty"><b>데이터 확인 불가</b><p>${esc(loadError??'조회 결과가 없습니다.')}</p><p>새로고침으로 다시 시도해 주세요.</p></div>`;return;}
 results=screen(data.stocks,state);
 $('#summary').textContent=`${labels[state.metric]} · 시장별 상위 10개 중 당일 돌파 ${results.length}개`;
 const groups=state.market==='ALL'?['KOSPI','KOSDAQ']:[state.market];
 $('#cards').innerHTML=groups.map(m=>{
 const candidates=data.stocks.filter(s=>s.market===m),hits=results.filter(s=>s.market===m),bad=candidates.filter(s=>s.priceStatus!=='ok'),failed=data.errors.some(e=>e.market===m),ok=candidates.length-bad.length;
 return `<section class="market-results"><div class="market-heading"><h3>${m==='KOSPI'?'코스피':'코스닥'}</h3><span>가치순위 후보 ${candidates.length}개 · 일봉 확인 ${ok}개${bad.length?' · 미확인 '+bad.length+'개':''}</span></div>${hits.length?`<div class="cards">${hits.map(card).join('')}</div>`:`<div class="empty"><b>${failed||bad.length?'데이터 확인 불가':'없음'}</b><p>${failed?'전체 재무 목록을 확인하지 못했습니다.':bad.length?'미확인 종목이 남아 있어 조건 충족 여부를 확정할 수 없습니다.':'상위 10개 중 최신 완료 거래일에 상향 돌파한 종목이 없습니다.'}</p></div>`}${hits.length&&(bad.length||failed)?'<p class="error-note">일부 미확인 종목이 있어 잠정 결과입니다.</p>':''}${bad.length?`<details class="failure-detail"><summary>미확인 ${bad.length}개</summary>${bad.map(s=>`<p>${esc(s.name)} (${s.code}) · ${esc(s.priceError)}</p>`).join('')}</details>`:''}</section>`;
 }).join('');
 document.querySelectorAll('[data-code]').forEach(b=>b.addEventListener('click',()=>openDetail(b.dataset.code)));
}
function openDetail(code){
 const s=results.find(s=>s.code===code);if(!s)return;lastFocus=document.activeElement;$('#modal-title').textContent=s.name+' · '+s.code;
 const rows=[['일봉 기준일',s.asOf],['가치순위',labels[state.metric]+' · '+s.valueRank+'위 / 10'],['오늘 SMA5',fmt(s.signal.ma5)+'원'],['오늘 SMA80',fmt(s.signal.ma80)+'원'],['전일 SMA5',fmt(s.signal.prev5)+'원'],['전일 SMA80',fmt(s.signal.prev80)+'원'],['재무 참조가격',fmt(s.valuationPrice,0)+'원'],['재무 조회',stamp(s.fundamentalsCollectedAt)],['ROE 기준',s.fundamentalPeriod],['일봉 수',s.prices.length]];
 $('#modal-content').innerHTML=chart(s,true)+`<table><tbody>${rows.map(([a,b])=>`<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table><p class="small">일봉 수정주가는 공급자 기준이며 기업행위별 독립 검증은 미완료입니다.</p>`;$('#backdrop').classList.add('open');$('#close').focus();
}
function close(){$('#backdrop').classList.remove('open');lastFocus?.focus();}
$('#close').addEventListener('click',close);$('#backdrop').addEventListener('click',e=>{if(e.target===$('#backdrop'))close();});
document.addEventListener('keydown',e=>{if(!$('#backdrop').classList.contains('open'))return;if(e.key==='Escape')close();if(e.key==='Tab'){e.preventDefault();$('#close').focus();}});
document.querySelectorAll('[data-market]').forEach(b=>b.addEventListener('click',()=>{state.market=b.dataset.market;document.querySelectorAll('[data-market]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});render();}));
document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{state.metric=b.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});load();}));
$('#export').addEventListener('click',()=>{if(!data||loading||loadError)return;const rows=[['기준일','시장','가치순위','종목코드','종목명','PBR','PER','ROE','SMA5','SMA80'],...results.map(s=>[s.asOf,s.market,s.valueRank,s.code,s.name,s.pbr,s.per,s.roe,s.signal.ma5,s.signal.ma80])],csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,"'").replaceAll('"','""')+'"').join(',')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='screener-'+data.asOf+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
function showStatus(){
 if(!data)return;
 $('#asof').textContent='일봉 기준일 '+data.asOf+' · '+labels[state.metric];
 $('#collected-at').textContent='실제 수집 '+stamp(data.collectedAt);
 const total=data.stocks.length,ok=data.stocks.filter(s=>s.priceStatus==='ok').length;
 $('#collection-status').innerHTML=`${esc(sourceMessage)}<br>후보 ${total}개 · 일봉 확인 ${ok}개 · 미확인 ${total-ok}개<br>재무: 네이버 증권 · VIX: Cboe<br>보통주 합산 참고값과 KRX 공식 지수를 구분합니다.`;
}
async function load(){
 const id=++requestId,metric=state.metric;
 data=SNAPSHOTS[metric]??null;loadError=null;loading=true;
 sourceMessage=standalone?'내장된 실제 수집 데이터 · GitHub 최신 저장본 확인 중':'최신 시세 조회 중';
 $('#refresh').disabled=true;$('#export').disabled=!data;benchmarks();showStatus();render();
 try{
 const endpoint=standalone?'https://api.github.com/repos/Jacobkang80/value-cross-screener/contents/data/latest-'+metric+'.json':'./api/screen?metric='+metric;
 const r=await fetch(endpoint,{cache:'no-store',headers:standalone?{'Accept':'application/vnd.github.raw+json'}:{},signal:AbortSignal.timeout(standalone?10000:90000)});
 if(!r.ok)throw Error('HTTP '+r.status);
 let next=await r.json();
 if(standalone&&next.encoding==='base64'&&typeof next.content==='string')next=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(next.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));
 if(next.mode!=='collected'||next.rankMetric!==metric||!Array.isArray(next.stocks)||next.stocks.length>20||!Array.isArray(next.markets)||!Array.isArray(next.errors))throw Error('저장 데이터 형식 오류');
 if(id!==requestId)return;
 if(!data||Date.parse(next.collectedAt)>=Date.parse(data.collectedAt)){data=next;SNAPSHOTS[metric]=next;}
 sourceMessage=standalone?'GitHub 최신 저장본 확인 완료 · 원천 시세의 실시간 갱신은 아닙니다.':'실제 시세 조회 완료';
 }catch(e){if(id!==requestId)return;if(data){sourceMessage='갱신 실패 ('+e.message+') · 내장된 실제 수집 결과를 유지합니다.';}else{loadError=e.message;$('#asof').textContent='조회 실패';$('#collection-status').textContent='데이터 확인 불가: '+e.message;}}
 finally{if(id===requestId){loading=false;$('#refresh').disabled=false;$('#export').disabled=!data;benchmarks();showStatus();render();}}
}
$('#refresh').addEventListener('click',load);load();
