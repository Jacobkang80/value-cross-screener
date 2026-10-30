import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8');
const [tpl,css,engine,app]=await Promise.all(['src/index.template.html','src/style.css','src/engine.mjs','src/app.js'].map(read));
const snapshots={};for(const metric of ['pbr','per','roe']){const d=JSON.parse(await read('data/latest-'+metric+'.json'));if(d.mode!=='collected'||d.rankMetric!==metric)throw Error('Invalid snapshot');snapshots[metric]=d;}
const serialized=JSON.stringify(snapshots).replaceAll('<','\\u003c');
let html=tpl.replace('<body>','<body data-standalone="true">').replace('href="./" class="brand"','href="#" class="brand"').replace('__SHEET_URL__','').replace('__SHEET_HIDDEN__','hidden').replace('/*STYLE*/',css).replace('/*ENGINE*/',engine.replaceAll('export ','')).replace('/*APP*/',app);
html=html.replace('<script type="module">','<script type="application/json" id="snapshot-data">'+serialized+'</script><script>');
html=html.replace('>새로고침</button>','>최신 저장본 확인</button>').replace('<section class="benchmarks"','<p class="small" style="margin:0 0 18px;padding:12px;background:#e8eee0;border-radius:8px">실제 수집 데이터 저장본입니다. 파일을 열 때 GitHub의 최신 저장본을 확인합니다. 원천 시세를 실시간으로 수집하지 않으며, 네트워크 없이도 내장 데이터로 열립니다.</p><section class="benchmarks"');
html=html.replace('페이지를 열면 자동 조회합니다. 재무·결과는 최대 10분 캐시, 완료 일봉은 거래일별 재사용합니다.','HTML을 열면 내장 데이터가 즉시 표시되고 GitHub의 최신 저장본을 확인합니다. 저장본이 갱신되지 않았다면 기준일도 그대로 유지됩니다.');
await fs.writeFile(new URL('value-cross-screener.html',root),html);
console.log(JSON.stringify({file:'value-cross-screener.html',bytes:Buffer.byteLength(html),asOf:snapshots.pbr.asOf}));
