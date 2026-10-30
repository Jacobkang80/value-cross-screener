import fs from 'node:fs';
const codeUrl=new URL('./Code.gs',import.meta.url),htmlUrl=new URL('./Index.html',import.meta.url);
const source=fs.readFileSync(codeUrl,'utf8');
const html=fs.readFileSync(htmlUrl,'utf8');
fs.writeFileSync(codeUrl,source.slice(0,source.indexOf('function page_()'))+'function page_(){return '+JSON.stringify(html)+';}\n');
