import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url),read=p=>fs.readFile(new URL(p,root),'utf8');
const [tpl,css,engine,app,server]=await Promise.all(['src/index.template.html','src/style.css','src/engine.mjs','src/app.js','src/server.mjs'].map(read));
let config;try{config=JSON.parse(await read('connections.json'));}catch(e){if(e.code!=='ENOENT')throw e;config=JSON.parse(await read('connections.example.json'));}
const sheetUrl=config.sheet?.url??'';
if(sheetUrl&&!sheetUrl.startsWith('https://docs.google.com/spreadsheets/'))throw Error('Invalid Google Sheets URL');
const safeSheetUrl=sheetUrl.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
const configuredTpl=tpl.replace('__SHEET_URL__',safeSheetUrl).replace('__SHEET_HIDDEN__',sheetUrl?'':'hidden');
const pureEngine=engine.replaceAll('export ',''),page=configuredTpl.replace('/*STYLE*/',css).replace('/*ENGINE*/',pureEngine).replace('/*APP*/',app);
await fs.mkdir(new URL('worker/',root),{recursive:true});
await fs.writeFile(new URL('worker/index.js',root),pureEngine+'\n'+server.replace(/^import[^\n]*\n/,'').replaceAll('export ','')+'\nconst page='+JSON.stringify(page)+';\nexport default {fetch:createHandler(page)};\n');
await fs.mkdir(new URL('dist/server/',root),{recursive:true});
await fs.mkdir(new URL('dist/.openai/',root),{recursive:true});
await fs.copyFile(new URL('worker/index.js',root),new URL('dist/server/index.js',root));
let manifest;try{manifest=await read('.openai/hosting.json');}catch(e){if(e.code!=='ENOENT')throw e;manifest=await read('.openai/hosting.example.json');}
JSON.parse(manifest);
await fs.writeFile(new URL('dist/.openai/hosting.json',root),manifest);
console.log('Built live Worker and embedded HTML');
