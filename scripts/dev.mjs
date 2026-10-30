import http from 'node:http';
import fs from 'node:fs/promises';
const file=new URL('../worker/index.js',import.meta.url),source=await fs.readFile(file,'utf8'),worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const portArg=process.argv.indexOf('--port');
const port=Number(portArg>=0?process.argv[portArg+1]:(process.env.PORT??3000));
http.createServer(async(req,res)=>{try{const request=new Request('http://'+(req.headers.host??'localhost')+req.url,{method:req.method}),response=await worker.fetch(request,{}, {waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(e.message);}}).listen(port,'0.0.0.0',()=>console.log('Screener listening on '+port));
