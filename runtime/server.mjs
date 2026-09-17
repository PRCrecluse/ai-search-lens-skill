import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { analyzeResponse } from './lib/analyze.mjs';
import { collectResponse } from './lib/provider.mjs';
import { saveReport, getReport, listReports } from './lib/storage.mjs';
import { standaloneHtml, markdownReport } from './lib/export.mjs';
const port=Number(process.env.PORT || 4317);
const assets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']};
let running = false;
function send(res,status,data,type='application/json; charset=utf-8') {res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));}
async function body(req) {
  const chunks=[];let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>10*1024*1024) throw new Error('文件超过 10 MB 限制');chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new Error('无法解析 JSON');}
}
export function validateConfig(data) {
  if(typeof data.query!=='string'||!data.query.trim()||data.query.length>8000) throw new Error('请输入 1–8000 字的问题');
  if(data.model!==undefined&&(typeof data.model!=='string'||!/^[-a-zA-Z0-9._:]{1,100}$/.test(data.model))) throw new Error('无效模型名称');
  if(data.brands!==undefined&&(!Array.isArray(data.brands)||data.brands.length>30)) throw new Error('最多配置 30 个品牌');
  for(const b of data.brands||[]) {
    if(!b||typeof b.name!=='string'||!b.name.trim()||b.name.length>100) throw new Error('无效品牌名称');
    for(const field of ['domains','aliases']) if(b[field]!==undefined&&(!Array.isArray(b[field])||b[field].length>20||b[field].some(v=>typeof v!=='string'||v.length>200))) throw new Error('品牌别名或域名格式错误');
  }
  return {query:data.query.trim(),model:data.model,brands:data.brands||[]};
}
export const server=createServer(async(req,res)=>{
  const origin=`http://127.0.0.1:${port}`;
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)) return send(res,403,{error:'Host not allowed'});
  if(req.headers.origin&&!['http://localhost:'+port,origin].includes(req.headers.origin)) return send(res,403,{error:'Cross-origin requests are not allowed'});
  const url=new URL(req.url,origin);
  try {
    if(req.method==='GET'&&assets[url.pathname]) { const [file,type]=assets[url.pathname];return send(res,200,await readFile(new URL(`./web/${file}`,import.meta.url)),type); }
    if(req.method==='GET'&&url.pathname==='/api/config') return send(res,200,{configured:!!process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL||'gpt-6-astra'});
    if(req.method==='GET'&&url.pathname==='/api/reports') return send(res,200,await listReports());
    if(req.method==='GET'&&/^\/api\/demo(?:\/(html|json|raw|md))?$/.test(url.pathname)) {
      const [raw,config]=await Promise.all(['demo-response','demo-config'].map(f=>readFile(new URL(`./examples/${f}.json`,import.meta.url),'utf8').then(JSON.parse)));
      const report=analyzeResponse(raw,config), format=url.pathname.split('/')[3];
      if(format) res.setHeader('Content-Disposition',`attachment; filename="search-lens-demo.${format==='raw'?'raw.json':format}"`);
      if(format==='html') return send(res,200,await standaloneHtml(report),'text/html; charset=utf-8');
      if(format==='md') return send(res,200,markdownReport(report),'text/markdown; charset=utf-8');
      return send(res,200,format==='raw'?raw:report);
    }
    const match=url.pathname.match(/^\/api\/reports\/([\w-]+)(?:\/(html|json|raw|md))?$/);
    if(req.method==='GET'&&match) {
      let entry;try{entry=await getReport(match[1]);}catch{return send(res,404,{error:'找不到该报告'});}
      const {report,raw}=entry;
      if(match[2]) res.setHeader('Content-Disposition',`attachment; filename="search-lens-${report.id}.${match[2]==='raw'?'raw.json':match[2]}"`);
      if(match[2]==='html') return send(res,200,await standaloneHtml(report),'text/html; charset=utf-8');
      if(match[2]==='md') return send(res,200,markdownReport(report),'text/markdown; charset=utf-8');
      return send(res,200,match[2]==='raw'?raw:report);
    }
    if(req.method==='POST'&&['/api/research','/api/import'].includes(url.pathname)) {
      if(!req.headers['content-type']?.includes('application/json')) return send(res,415,{error:'Content-Type must be application/json'});
      const data=await body(req),config=validateConfig(data);
      let raw;
      if(url.pathname==='/api/import') raw=data.raw;
      else {
        if(running) return send(res,409,{error:'已有研究正在运行，请等待完成。'});
        running=true;const controller=new AbortController();
        const disconnected=()=>{if(!res.writableEnded) controller.abort();};res.on('close',disconnected);
        try{raw=await collectResponse({...config,signal:controller.signal});}
        finally{running=false;res.off('close',disconnected);}
      }
      const report=analyzeResponse(raw,{...config,id:randomUUID(),demo:!!data.demo&&url.pathname==='/api/import'});
      await saveReport(report,raw);return send(res,201,report);
    }
    send(res,404,{error:'Not found'});
  }catch(error){if(!res.destroyed)send(res,error.name==='TimeoutError'?504:400,{error:error.name==='AbortError'?'研究已取消':error.message});}
});
// Loopback only. Do not expose this local research tool directly to the Internet.
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]) server.listen(port,'127.0.0.1',()=>console.log(`AI Search Lens → http://127.0.0.1:${port}`));
