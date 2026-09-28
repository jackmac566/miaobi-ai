"lib/connection":function(module,exports,require){

"use strict";
const models_1 = require('./models');
const CONFIG_KEY='miaobi-v5-config';
const SESSION_KEY='miaobi-v5-session';
const USAGE_KEY='miaobi-v5-usage';

const DEFAULT_SEARCH_ENGINE='search_std';
const DEFAULT_IMAGE_MODEL='cogview-3-flash';

function emptyProvider(id){
  const meta=models_1.PROVIDERS[id];
  return { id, label:meta.label, baseUrl:meta.baseUrl, apiKey:'', rememberKey:false, configured:false, keyPresent:false };
}
function emptyConfig(){
  return {
    providers:{ deepseek:emptyProvider('deepseek'), zhipu:emptyProvider('zhipu') },
    searchEngine:DEFAULT_SEARCH_ENGINE,
    imageModel:DEFAULT_IMAGE_MODEL,
    maxTokens:4096,
  };
}

let memoryConfig=null;
let memorySession={};
let memoryUsage=[];
let lastStorageStatus={mode:'session',warning:''};
const encoder=new TextEncoder();
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const isStr=v=>typeof v==='string';

function safeRead(storageName,key,fallback){try{const raw=globalThis[storageName].getItem(key);if(!raw)return fallback;const v=JSON.parse(raw);return v&&typeof v==='object'?v:fallback;}catch{return fallback;}}
function safeWrite(storageName,key,value){try{globalThis[storageName].setItem(key,JSON.stringify(value));return true;}catch{return false;}}

/* 会话密钥（不勾"记住"时存在 sessionStorage / 内存），长期密钥单独走 localStorage。 */
function readConfig(){
  const stored=memoryConfig||safeRead('localStorage',CONFIG_KEY,{});
  const session={...safeRead('sessionStorage',SESSION_KEY,{}),...memorySession};
  const base=emptyConfig();
  const out={...base,...stored,providers:{...base.providers}};
  for(const id of Object.keys(base.providers)){
    const sp=stored?.providers?.[id]||{};
    const apiKey=String(session[id]||sp.savedKey||'');
    out.providers[id]={...emptyProvider(id),...sp,apiKey,id};
    delete out.providers[id].savedKey;
    out.providers[id].keyPresent=!!apiKey;
    out.providers[id].configured=!!apiKey;
  }
  return out;
}

function saveConfig(patch){
  const current=readConfig();
  /* 关键：providers 必须逐厂商合并。
     曾经写成 { ...current, ...patch, providers: { ...current.providers } }，
     结果顶层被 patch 覆盖、providers 又被 current 覆盖，用户填的 Key 永远存不进去。 */
  const merged={...current.providers};
  if(patch&&patch.providers){
    for(const id of Object.keys(patch.providers)){
      merged[id]={...(merged[id]||emptyProvider(id)),...patch.providers[id],id};
    }
  }
  const next={...current,...patch,providers:merged};
  const persisted={providers:{},searchEngine:next.searchEngine,imageModel:next.imageModel,maxTokens:next.maxTokens};
  const session={};
  let warning='';
  for(const id of Object.keys(next.providers)){
    const p=next.providers[id];
    const key=String(p.apiKey||'').trim();
    persisted.providers[id]={id,baseUrl:models_1.PROVIDERS[id].baseUrl,rememberKey:!!p.rememberKey};
    if(p.rememberKey&&key)persisted.providers[id].savedKey=key;
    else if(key)session[id]=key;
  }
  memoryConfig=persisted;memorySession=session;
  const localOK=safeWrite('localStorage',CONFIG_KEY,persisted);
  const sessionOK=safeWrite('sessionStorage',SESSION_KEY,session);
  const wantsRemember=Object.values(next.providers).some(p=>p.rememberKey&&String(p.apiKey||'').trim());
  if(wantsRemember&&!localOK)warning='浏览器未允许保存密钥；当前页面仍可使用，重新打开后需重填。';
  else if(!wantsRemember&&!sessionOK)warning='当前浏览器无法保存会话密钥，刷新后需重新填写。';
  lastStorageStatus={mode:wantsRemember?(localOK?'browser':'memory'):(sessionOK?'session':'memory'),warning};
  changed();
  return readConfig();
}

exports.readDirectConfig=readConfig;
exports.saveDirectConfig=saveConfig;
exports.saveConfig=saveConfig;
exports.readConfig=readConfig;
exports.capabilities=capabilities;
exports.usageData=usageData;
exports.storageStatus=()=>({...lastStorageStatus});

/* 让界面能先判断"这个模型现在能不能发" */
exports.modelReady=function(modelId){
  const m=models_1.modelOf(modelId);
  const p=readConfig().providers[m.provider];
  if(!p||!p.apiKey)return{ok:false,provider:m.provider,providerLabel:models_1.PROVIDERS[m.provider].label,reason:`请先填写 ${models_1.PROVIDERS[m.provider].label} 的 API Key。`};
  return{ok:true,provider:m.provider,providerLabel:models_1.PROVIDERS[m.provider].label};
};
exports.searchReady=function(){
  const p=readConfig().providers.zhipu;
  return !!(p&&p.apiKey);
};

function capabilities(){
  const cfg=readConfig();
  return {
    version:3,
    direct:true,
    providers:Object.keys(cfg.providers).map(id=>({id,label:cfg.providers[id].label,baseUrl:cfg.providers[id].baseUrl,configured:cfg.providers[id].configured})),
    models:models_1.MODELS.map(m=>({
      id:m.id, label:m.label, vendor:models_1.PROVIDERS[m.provider].label,
      apiModel:m.apiModel, provider:m.provider, configured:!!cfg.providers[m.provider]?.apiKey,
    })),
    features:{ webSearch:true, image:true, imageModels:['cogview-4','cogview-3-flash'], searchRequires:'zhipu' },
  };
}

function usageFrom(raw){
  if(!raw||typeof raw!=='object')return null;
  const input=Number(raw.prompt_tokens??raw.input_tokens??raw.input??0)||0;
  const output=Number(raw.completion_tokens??raw.output_tokens??raw.output??0)||0;
  const cacheHit=Number(raw.prompt_cache_hit_tokens??raw.prompt_tokens_details?.cached_tokens??0)||0;
  const reasoning=raw.completion_tokens_details?.reasoning_tokens??raw.output_tokens_details?.reasoning_tokens??raw.reasoning_tokens;
  return{input,output,cacheHit,reasoning:reasoning==null?undefined:(Number(reasoning)||0)};
}
function costFor(modelId,usage){
  if(!usage)return null;
  const price=models_1.priceOf(modelId);
  if(!price||price.input==null||price.output==null)return null;
  const hit=Math.min(Number(usage.cacheHit||0),Number(usage.input||0));
  const miss=Math.max(0,Number(usage.input||0)-hit);
  const amount=(miss*price.input+hit*(price.cacheHit??price.input)+Number(usage.output||0)*price.output)/1000000;
  return{currency:price.currency,amount};
}

function readUsage(){const stored=safeRead('localStorage',USAGE_KEY,null);if(Array.isArray(stored)){memoryUsage=stored;return stored;}return memoryUsage;}
function writeUsage(rows){memoryUsage=rows.slice(0,1000);safeWrite('localStorage',USAGE_KEY,memoryUsage);changed();}
function beginRecord(meta){
  const r={id:meta.id||uid(),provider:meta.provider,requestedModel:meta.modelId,apiModel:meta.apiModel||'',purpose:meta.purpose||'chat',status:'running',started:Date.now(),httpStatus:null,upstreamRequestId:null,usage:null,cost:null,reasoningObserved:false,effort:meta.effort||'off',latency:null};
  const rows=readUsage();rows.unshift(r);writeUsage(rows);return r.id;
}
function finishRecord(id,patch){const rows=readUsage();const i=rows.findIndex(r=>r.id===id);if(i>=0){rows[i]={...rows[i],...patch,finished:Date.now()};writeUsage(rows);return rows[i];}return null;}

function usageData(url){
  const q=new URL(String(url||'/api/usage'),'https://local.invalid').searchParams;
  const days=Number(q.get('days')||0);const provider=q.get('provider')||'all';
  let rows=readUsage();
  if(days>0){const min=Date.now()-days*86400000;rows=rows.filter(r=>r.started>=min);}
  if(provider!=='all')rows=rows.filter(r=>r.provider===provider);
  const s={calls:rows.length,input:0,output:0,total:0,reasoning:0,reasoningKnown:false,costs:{},success:0,testCalls:0,unknownUsage:0,unknownCost:0,errors:0,stopped:0,running:0,daily:{},byModel:{},byProvider:{deepseek:{calls:0,tokens:0},zhipu:{calls:0,tokens:0}}};
  for(const r of rows){
    const day=new Date(r.started).toISOString().slice(0,10);
    s.daily[day]=(s.daily[day]||0)+1;
    s.byModel[r.apiModel||r.requestedModel]=(s.byModel[r.apiModel||r.requestedModel]||0)+1;
    const bp=s.byProvider[r.provider]||(s.byProvider[r.provider]={calls:0,tokens:0});
    bp.calls++;
    if(r.usage){
      s.input+=Number(r.usage.input||0);s.output+=Number(r.usage.output||0);
      bp.tokens+=Number(r.usage.input||0)+Number(r.usage.output||0);
      if(r.usage.reasoning!=null){s.reasoningKnown=true;s.reasoning+=Number(r.usage.reasoning||0);}
    }else if(r.status!=='running')s.unknownUsage++;
    if(r.cost)s.costs[r.cost.currency]=(s.costs[r.cost.currency]||0)+Number(r.cost.amount||0);
    else if(r.status!=='running')s.unknownCost++;
    if(r.status==='success')s.success++;else if(r.status==='error'||r.status==='timeout')s.errors++;else if(r.status==='stopped')s.stopped++;else if(r.status==='running')s.running++;
    if(r.purpose==='connection-test')s.testCalls++;
  }
  s.total=s.input+s.output;
  return{scope:'单 HTML 浏览器直连记录 · 仅统计本页面发起的 API 请求，与厂商账单可能有细微差异',summary:s,records:rows};
}

function jsonResponse(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8'}});}
function eventBytes(obj){return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);}
function contentText(value){
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(x=>typeof x==='string'?x:(x?.text??x?.content??'')).join('');
  if(value&&typeof value==='object')return String(value.text??value.content??'');
  return'';
}

/* 身份提示词：只讲真实模型，不允许虚构工具、联网或外部操作。 */
let identityCache='';
function productIdentity(apiModel,providerLabel,searchOn){
  const key=apiModel+'|'+providerLabel+'|'+searchOn;
  if(identityCache.key===key)return identityCache.value;
  const value='你是「妙笔 AI」里的助手，帮助用户交流、写作、总结和分析。'
   +'当前实际调用的模型是 '+apiModel+'，由 '+providerLabel+' 提供；被问到时如实说明，不要声称自己是其它公司的模型。'
   +(searchOn
     ? '本次已开启联网检索，检索结果会随消息提供；引用时保留来源链接，不要编造未出现在结果里的网址、数据或日期。'
     : '本次没有联网，也无法访问外部系统；不要声称已联网、已搜索或已执行了任何工具操作。'
       +'如果问题需要最新数据，直接说明你无法获取实时信息。');
  identityCache={key,value};
  return value;
}
function effortInstruction(effort){
  const map={off:'直接作答，不要展开推理过程',low:'简要分析后作答',high:'仔细核对关键条件后作答',max:'进行充分的多步分析与自检后作答',auto:'按模型默认的思考深度作答'};
  return `请${map[effort]||map.off}。只输出最终答案，不展示私有思维链。`;
}

async function upstreamError(resp){let text='';try{text=await resp.text();}catch{}try{const j=JSON.parse(text);return j?.error?.message||j?.message||text.slice(0,500)||`API 返回 ${resp.status}`;}catch{return text.slice(0,500)||`API 返回 ${resp.status}`;}}

function sseResponse(produce){
  const stream=new ReadableStream({start(controller){ produce(controller).catch(e=>{ try{controller.enqueue(eventBytes({type:'error',message:e?.message||'请求失败。',code:e?.code||'INTERNAL'}));}catch{} try{controller.close();}catch{} }); }});
  return new Response(stream,{status:200,headers:{'Content-Type':'text/event-stream;charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}

function chatEndpoint(provider){return models_1.PROVIDERS[provider].baseUrl+(provider==='zhipu'?'/chat/completions':'/chat/completions');}
function authHeaders(key){return{'Content-Type':'application/json','Authorization':'Bearer '+key,'Accept':'text/event-stream, application/json'};}

function webSearchTool(engine){
  return[{type:'web_search',web_search:{enable:true,search_engine:engine||DEFAULT_SEARCH_ENGINE,search_result:true,count:8,content_size:'high',search_recency_filter:'noLimit'}}];
}

/* 智谱联网检索：非流式，只用来取回带来源的要点，供其它厂商模型当上下文用。 */
async function runSearch(query,key,engine,signal){
  const resp=await fetch(chatEndpoint('zhipu'),{method:'POST',headers:authHeaders(key),cache:'no-store',signal,
    body:JSON.stringify({model:'glm-4.7-flash',stream:false,tools:webSearchTool(engine),max_tokens:1536,
      messages:[{role:'user',content:'请联网检索下面的问题，用简洁的要点回答，并在每条要点后附上来源链接（Markdown 链接格式）。不要编造链接。\n\n问题：'+query}]})});
  if(!resp.ok)throw new Error('联网检索失败：'+await upstreamError(resp));
  const data=await resp.json().catch(()=>null);
  const text=contentText(data?.choices?.[0]?.message?.content);
  if(!text.trim())throw new Error('联网检索没有返回可用内容。');
  return text.trim();
}
function extractSources(text){
  const out=[];const seen=new Set();
  const re=/\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)/g;let m;
  while((m=re.exec(text))){
    const url=m[2];let site='';try{site=new URL(url).hostname.replace(/^www\./,'');}catch{}
    if(seen.has(url))continue;seen.add(url);out.push({title:m[1],url,site});
    if(out.length>=12)break;
  }
  return out;
}

/* 生图：智谱 CogView。非流式，返回图片 URL。 */
async function generateImage(options){
  let body={};try{body=JSON.parse(options.body||'{}');}catch{return jsonResponse({error:'请求数据无效。',code:'BAD_REQUEST'},400);}
  const cfg=readConfig();const key=cfg.providers.zhipu.apiKey;
  if(!key)return jsonResponse({error:'生图功能由智谱提供，请先在 API 设置里填写智谱 API Key。',code:'NOT_CONFIGURED'},400);
  const prompt=String(body.prompt||'').trim();
  if(!prompt)return jsonResponse({error:'请先描述你想生成的画面。',code:'EMPTY_PROMPT'},400);
  const model=body.imageModel||cfg.imageModel||DEFAULT_IMAGE_MODEL;
  const requestId=body.requestId||uid();
  const recordId=beginRecord({id:requestId,provider:'zhipu',modelId:'image',apiModel:model,purpose:'image'});
  return sseResponse(async controller=>{
    controller.enqueue(eventBytes({type:'meta',model:model,provider:'zhipu',vendor:'智谱',requestId,effort:'off',executionMode:'direct',task:'image'}));
    controller.enqueue(eventBytes({type:'status',id:'image',label:'正在生成图片…'}));
    let resp;
    try{
      resp=await fetch(models_1.PROVIDERS.zhipu.baseUrl+'/images/generations',{method:'POST',headers:authHeaders(key),cache:'no-store',signal:options.signal,
        body:JSON.stringify({model,prompt,size:body.size||'1024x1024'})});
    }catch(e){
      finishRecord(recordId,{status:options.signal?.aborted?'stopped':'error',errorCode:e?.name||'NETWORK'});
      throw new Error('无法连接智谱生图接口，请检查网络。');
    }
    if(!resp.ok){
      const msg=await upstreamError(resp);
      finishRecord(recordId,{status:'error',httpStatus:resp.status,errorCode:'HTTP_'+resp.status});
      throw new Error('生图失败：'+msg);
    }
    const data=await resp.json().catch(()=>null);
    const images=(Array.isArray(data?.data)?data.data:[]).map(d=>({url:contentText(d?.url),revised:contentText(d?.revised_prompt)})).filter(i=>i.url);
    if(!images.length){
      finishRecord(recordId,{status:'error',errorCode:'EMPTY'});
      throw new Error('接口没有返回图片，可能触发了内容审核，换个描述再试。');
    }
    finishRecord(recordId,{status:'success',httpStatus:resp.status,upstreamRequestId:data?.id||null});
    controller.enqueue(eventBytes({type:'image',images,model,prompt}));
    controller.enqueue(eventBytes({type:'done',usage:null,cost:null}));
    controller.close();
  });
}

async function directChat(options){
  let body={};try{body=JSON.parse(options.body||'{}');}catch{return jsonResponse({error:'请求数据无效。',code:'BAD_REQUEST'},400);}
  const model=models_1.modelOf(body.model);
  const cfg=readConfig();
  const provider=model.provider;
  const key=cfg.providers[provider].apiKey;
  if(!key)return jsonResponse({error:`当前模型由 ${models_1.PROVIDERS[provider].label} 提供，请先填写对应的 API Key。`,code:'NOT_CONFIGURED'},400);

  const wantSearch=body.webSearch===true;
  const searchKey=cfg.providers.zhipu.apiKey;
  if(wantSearch&&!searchKey)return jsonResponse({error:'联网检索由智谱提供，请先填写智谱 API Key；也可以关闭联网开关后再发送。',code:'SEARCH_NOT_CONFIGURED'},400);

  /* 校验放在记账之前：无效请求不该在用量里留下一条记录。 */
  const history=(Array.isArray(body.messages)?body.messages:[])
    .filter(m=>m&&['system','user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.trim())
    .map(m=>({role:m.role,content:m.content}));
  if(!history.length)return jsonResponse({error:'消息列表为空，请先输入内容再发送。',code:'BAD_REQUEST'},400);
  const totalChars=history.reduce((n,m)=>n+m.content.length,0);
  if(totalChars>200000)return jsonResponse({error:`本次请求正文共 ${totalChars.toLocaleString()} 字，超过 200,000 字上限。`,code:'TOO_LONG'},400);
  if(body.effort!=null&&!models_1.EFFORT_LABELS[body.effort])body.effort=models_1.normalizeEffort(model.id,body.effort);

  const endpoint=chatEndpoint(provider);
  const requestId=body.requestId||uid();
  const maxTokens=Math.max(256,Math.min(32768,Number(body.maxTokens||cfg.maxTokens||4096)));
  const host=provider==='zhipu'?models_1.PROVIDERS.zhipu.label:'DeepSeek';
  const recordId=beginRecord({id:requestId,provider,modelId:model.id,apiModel:model.apiModel,purpose:body.purpose||'chat',effort:body.effort});

  return sseResponse(async controller=>{
    const startedAt=Date.now();
    let firstTokenMs=null;
    controller.enqueue(eventBytes({type:'meta',model:model.apiModel,vendor:host,provider,requestId,effort:body.effort,executionMode:'direct',search:wantSearch,maxTokens}));
    controller.enqueue(eventBytes({type:'status',id:'connected',label:`已连接 ${host}`}));

    const messages=[];
    let sources=[];
    if(wantSearch&&provider!=='zhipu'){
      controller.enqueue(eventBytes({type:'status',id:'search',label:'正在联网检索…'}));
      try{
        const found=await runSearch(body.searchQuery||body.lastUserText||'',searchKey,cfg.searchEngine,options.signal);
        sources=extractSources(found);
        messages.push({role:'system',content:'以下是一次真实联网检索的结果，请只依据它回答，并保留其中的来源链接：\n\n'+found});
        controller.enqueue(eventBytes({type:'status',id:'search-done',label:`检索完成，命中 ${sources.length||'若干'} 条来源`}));
        if(sources.length)controller.enqueue(eventBytes({type:'search.results',results:sources}));
      }catch(e){
        finishRecord(recordId,{status:'error',errorCode:'SEARCH'});
        throw new Error('联网检索失败：'+(e?.message||'未知错误')+'\n可以关闭联网开关后直接对话。');
      }
    }else if(wantSearch){
      controller.enqueue(eventBytes({type:'status',id:'search',label:'已开启智谱联网检索'}));
    }

    const system=[productIdentity(model.apiModel,host,wantSearch),effortInstruction(body.effort)];
    if(body.purpose==='connection-test')system.length=1;
    const payloadMessages=[{role:'system',content:system.join('\n')},...messages,...history];

    const payload={model:model.apiModel,messages:payloadMessages,stream:true,max_tokens:body.purpose==='connection-test'?64:maxTokens,...models_1.reasoningParam(model,body.effort)};
    if(wantSearch&&provider==='zhipu'){payload.tools=webSearchTool(cfg.searchEngine);}

    let upstream;
    try{
      upstream=await fetch(endpoint,{method:'POST',headers:authHeaders(key),body:JSON.stringify(payload),signal:options.signal,cache:'no-store'});
    }catch(e){
      finishRecord(recordId,{status:options.signal?.aborted?'stopped':'error',errorCode:e?.name||'NETWORK'});
      if(e?.name==='AbortError')throw e;
      throw new Error('无法连接 '+endpoint+'。请检查网络，或确认该接口是否允许浏览器直接调用（CORS）。');
    }
    if(!upstream.ok){
      const msg=await upstreamError(upstream);
      finishRecord(recordId,{status:'error',httpStatus:upstream.status,errorCode:'HTTP_'+upstream.status});
      const hint=upstream.status===401||upstream.status===403?'（API Key 无效或没有该模型权限）':upstream.status===402?'（账户余额不足）':upstream.status===429?'（触发限流，请稍后重试）':'';
      throw new Error(hint+msg);
    }

    const ct=(upstream.headers.get('content-type')||'').toLowerCase();
    let text='';let usage=null;let upstreamRequestId=null;let reasoningObserved=false;

    const finish=(reasoningText)=>{
      const cost=costFor(model.id,usage);
      const latency={firstTokenMs,totalMs:Date.now()-startedAt};
      finishRecord(recordId,{status:'success',httpStatus:upstream.status,upstreamRequestId,usage,cost,reasoningObserved,latency});
      controller.enqueue(eventBytes({type:'usage',usage,cost}));
      controller.enqueue(eventBytes({type:'done',usage,cost,reasoningObserved,latency,reasoningLength:(reasoningText||'').length}));
      controller.close();
    };

    if(!upstream.body||!ct.includes('text/event-stream')){
      const data=await upstream.json().catch(()=>null);
      if(!data){finishRecord(recordId,{status:'error',errorCode:'BAD_JSON'});throw new Error('接口没有返回兼容的 JSON 或 SSE。');}
      const t=contentText(data?.choices?.[0]?.message?.content??data?.output_text);
      const r=contentText(data?.choices?.[0]?.message?.reasoning_content);
      usage=usageFrom(data?.usage);upstreamRequestId=data?.id||null;
      reasoningObserved=!!r;
      if(r){controller.enqueue(eventBytes({type:'reasoning.delta',delta:r}));}
      if(!t.trim()){finishRecord(recordId,{status:'error',errorCode:'EMPTY',usage});throw new Error('调用成功，但没有返回可读文本。');}
      firstTokenMs=Date.now()-startedAt;
      controller.enqueue(eventBytes({type:'text.delta',delta:t}));
      finish(r);
      return;
    }

    let reasoning='';
    const handle=raw=>{
      if(!raw||raw==='[DONE]')return;
      let d;try{d=JSON.parse(raw);}catch{return;}
      upstreamRequestId=upstreamRequestId||d?.id||null;
      if(d?.usage){usage=usageFrom(d.usage);}
      const choice=d?.choices?.[0];
      const delta=choice?.delta||{};
      const r=contentText(delta.reasoning_content??delta.reasoning??delta.thinking);
      if(r){
        if(firstTokenMs===null)firstTokenMs=Date.now()-startedAt;
        if(!reasoningObserved){reasoningObserved=true;controller.enqueue(eventBytes({type:'reasoning.start'}));}
        reasoning+=r;
        controller.enqueue(eventBytes({type:'reasoning.delta',delta:r}));
      }
      const part=contentText(delta.content??delta.text);
      if(part){
        if(firstTokenMs===null)firstTokenMs=Date.now()-startedAt;
        if(reasoningObserved&&!text)controller.enqueue(eventBytes({type:'reasoning.done'}));
        text+=part;
        controller.enqueue(eventBytes({type:'text.delta',delta:part}));
      }
      const fr=choice?.finish_reason;
      if(fr&&fr!=='null')controller.enqueue(eventBytes({type:'status',id:'finish-'+fr,label:'模型已结束输出'}));
    };

    const reader=upstream.body.getReader();
    const decoder=new TextDecoder();
    let buffer='';
    try{
      while(true){
        if(options.signal?.aborted)throw new DOMException('Aborted','AbortError');
        const part=await reader.read();
        if(part.done)break;
        buffer+=decoder.decode(part.value,{stream:true});
        let idx;
        while((idx=buffer.indexOf('\n'))>=0){
          let line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);
          if(line.endsWith('\r'))line=line.slice(0,-1);
          if(line.startsWith('data:'))handle(line.slice(5).trimStart());
        }
      }
      buffer+=decoder.decode();
      for(const l of buffer.split(/\r?\n/)){const t=l.trim();if(t.startsWith('data:'))handle(t.slice(5).trimStart());}
      if(!text.trim()){finishRecord(recordId,{status:'error',httpStatus:upstream.status,upstreamRequestId,usage,errorCode:'EMPTY'});throw new Error('流已结束，但没有收到可读文本。');}
      if(reasoningObserved)controller.enqueue(eventBytes({type:'reasoning.done'}));
      finish(reasoning);
    }catch(e){
      const aborted=options.signal?.aborted;
      finishRecord(recordId,{status:aborted?'stopped':'error',httpStatus:upstream.status,upstreamRequestId,usage,cost:costFor(model.id,usage),reasoningObserved,errorCode:e?.name||'STREAM',firstTokenMs});
      if(aborted){controller.close();return;}
      throw e;
    }finally{
      try{reader.releaseLock();}catch{}
    }
  });
}

async function runConnectionTest(modelId,signal){
  const cfg=readConfig();
  const target=models_1.modelOf(modelId);
  if(!cfg.providers[target.provider].apiKey)throw Error(`请先填写 ${models_1.PROVIDERS[target.provider].label} 的 API Key。`);
  const response=await directChat({signal,body:JSON.stringify({model:target.id,effort:'off',purpose:'connection-test',messages:[{role:'user',content:'连接测试，请只回复 OK。'}]})});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'连接失败。');}
  let reply='';
  await require('./chat-api').consumeSSE(response.body,e=>{if(e.type==='text.delta')reply+=e.delta||'';},signal);
  if(!reply.trim())throw Error('接口未返回可读回复，请重试。');
  return{model:target.apiModel,providerId:target.provider,providerLabel:models_1.PROVIDERS[target.provider].label};
}
exports.testProvider=async function(providerId,signal){
  const target=models_1.MODELS.find(m=>m.provider===providerId);
  if(!target)throw Error('未知的厂商。');
  return runConnectionTest(target.id,signal);
};
exports.testDirectConnection=async function(signal){
  const cfg=readConfig();
  const target=models_1.MODELS.find(m=>cfg.providers[m.provider].apiKey);
  if(!target)throw Error('请先至少填写一个厂商的 API Key。');
  return runConnectionTest(target.id,signal);
};
exports.searchReady=exports.searchReady;
exports.trySearch=async function(query,signal){
  const cfg=readConfig();
  if(!cfg.providers.zhipu.apiKey)throw Error('联网检索由智谱提供，请先填写智谱 API Key。');
  const text=await runSearch(query,cfg.providers.zhipu.apiKey,cfg.searchEngine,signal);
  return{text,sources:extractSources(text)};
};

function changed(){try{window.dispatchEvent(new Event('miaobi-usage-changed'));}catch{}}
exports.changed=changed;
exports.setAccessToken=()=>{};

exports.apiFetch=async function apiFetch(url,options={}){
  const u=String(url||'');
  if(u.startsWith('/api/chat/capabilities'))return jsonResponse(capabilities());
  if(u.startsWith('/api/account'))return jsonResponse({signedIn:true,isMember:true,remaining:null,capabilities:{inputChars:20000},mode:'browser-direct'});
  if(u.startsWith('/api/usage'))return jsonResponse(usageData(u));
  if(u.startsWith('/api/cancel'))return jsonResponse({ok:true});
  if(u.startsWith('/api/image'))return generateImage(options);
  if(u.startsWith('/api/chat'))return directChat(options);
  if(u.startsWith('/api/config'))return jsonResponse({providers:readConfig().providers,capabilities:capabilities()});
  return fetch(url,options);
};

},
