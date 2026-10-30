import fs from 'node:fs/promises';
import {createCollector} from './server.mjs';
const metric=process.argv[2]??'pbr';
const result=await createCollector()(metric);
await fs.mkdir(new URL('../.cache/',import.meta.url),{recursive:true});
const path=new URL('../.cache/latest-'+metric+'.json',import.meta.url);
await fs.writeFile(path,JSON.stringify(result));
console.log(JSON.stringify({status:result.status,asOf:result.asOf,metric,stocks:result.stocks.length}));
