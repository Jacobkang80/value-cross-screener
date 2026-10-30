import fs from 'node:fs/promises';
const metric=process.argv[2]??'pbr';if(!['pbr','per','roe'].includes(metric))throw Error('unsupported metric');
const sheetId=process.env.SCREENER_SHEET_ID;if(!sheetId)throw Error('Set SCREENER_SHEET_ID to prepare a Google Sheets payload.');
const root=new URL('../',import.meta.url),d=JSON.parse(await fs.readFile(new URL('.cache/latest-'+metric+'.json',root),'utf8'));
const headers=['수집시각','일봉기준일','정렬','시장','가치순위','코드','이름','PBR','PER','ROE','일봉상태','당일돌파','오류'];
const values=[headers,...d.stocks.map(s=>[d.collectedAt,d.asOf,d.rankMetric,s.market,s.valueRank,s.code,s.name,s.pbr,s.per,s.roe,s.priceStatus,s.crossToday??'',s.priceError??''])];
await fs.writeFile(new URL('.cache/sheets-payload-'+metric+'.json',root),JSON.stringify({spreadsheet_id:sheetId,suggested_sheet:'후보10_'+metric,values}));
console.log('Prepared '+d.stocks.length+' candidate rows; not sent to Google Sheets.');
