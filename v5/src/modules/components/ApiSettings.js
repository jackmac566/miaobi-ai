"components/ApiSettings":function(module,exports,require){

"use strict";
exports.default=ApiSettings;
const React=require("react");
const Overlay=require("./ui/Overlay").default;
const Liquid=require("./ui/liquid-metal-button").default;
const connection=require("../lib/connection");
const models_1=require("../lib/models");

const SEARCH_ENGINES=[
 {id:'search_std',label:'search_std · 基础版（0.01 元/次）'},
 {id:'search_pro',label:'search_pro · 高级版，多引擎（0.03 元/次）'},
 {id:'search_pro_sogou',label:'search_pro_sogou · 搜狗，覆盖腾讯生态（0.05 元/次）'},
];
const IMAGE_MODELS=[
 {id:'cogview-3-flash',label:'cogview-3-flash · 免费'},
 {id:'cogview-4',label:'cogview-4 · 质量更高（0.06 元/次）'},
];

function ApiSettings({onClose,onSaved}){
 const [cfg,setCfg]=React.useState(()=>connection.readDirectConfig());
 const [error,setError]=React.useState('');
 const [note,setNote]=React.useState('');
 const [busy,setBusy]=React.useState('');
 const [verified,setVerified]=React.useState({});
 const draft=React.useRef(cfg);
 const ctrlRef=React.useRef(null);
 const mounted=React.useRef(true);
 React.useEffect(()=>()=>{mounted.current=false;ctrlRef.current?.abort();},[]);

 const persist=(next,quiet)=>{
  draft.current=next;
  try{
   const saved=connection.saveConfig(next);
   setCfg(saved);
   setError('');
   if(!quiet){
    const st=connection.storageStatus();
    setNote(st.warning||(next.maxTokens?'设置已保存。':'设置已保存。'));
   }
   onSaved?.();
   return saved;
  }catch(e){setError(e?.message||'保存失败。');return null;}
 };

 const patch=(mutate,quiet)=>{
  const next=JSON.parse(JSON.stringify(draft.current));
  mutate(next);
  persist(next,quiet);
 };

 const setKey=(id,value)=>{
  patch(next=>{next.providers[id].apiKey=value;},true);
  setVerified(v=>({...v,[id]:false}));
  setNote('');
  const k=value.trim();
  if(!k||k.length>=16)persist(draft.current,true);
 };
 const setFlag=(id,key,value)=>patch(next=>{next.providers[id][key]=value;});

 const test=async(id)=>{
  persist(draft.current,true);
  if(!connection.readDirectConfig().providers[id].apiKey){setError(`还没有填写 ${models_1.PROVIDERS[id].label} 的 API Key。`);return;}
  setBusy(id);setVerified(v=>({...v,[id]:false}));setError('');
  setNote(`正在向 ${models_1.PROVIDERS[id].label} 发送一条短消息，验证真实连接…`);
  const ctrl=new AbortController();ctrlRef.current=ctrl;
  const timer=setTimeout(()=>ctrl.abort(),45000);
  try{
   const r=await connection.testProvider(id,ctrl.signal);
   if(!mounted.current)return;
   setVerified(v=>({...v,[id]:true}));
   setNote(`连接成功：${r.providerLabel} 的 ${r.model} 已返回真实回复。`);
  }catch(e){
   if(mounted.current){setError(ctrl.signal.aborted?'连接测试超时，请检查网络后重试。':(e?.message||'连接测试失败。'));setNote('');}
  }finally{
   clearTimeout(timer);
   if(ctrlRef.current===ctrl)ctrlRef.current=null;
   if(mounted.current)setBusy('');
  }
 };

 const done=()=>{if(!busy)persist(draft.current,true);onClose();};

 const providerCard=(id)=>{
  const meta=models_1.PROVIDERS[id];
  const p=cfg.providers[id];
  const sample=models_1.MODELS.find(m=>m.provider===id);
  return React.createElement("section",{className:"mb-provider-card",key:id},
   React.createElement("header",null,
    React.createElement("b",null,meta.label),
    React.createElement("i",{className:p.apiKey?'configured':''}),
    React.createElement("small",null,p.apiKey?(verified[id]?'连接已验证':`已填写密钥 · ${sample?sample.apiModel:''}`):'尚未填写 API Key')),
   React.createElement("label",{className:"mb-block-label"},`${meta.label} API Key`,
    React.createElement("input",{type:'password',autoComplete:'new-password',spellCheck:false,
     "data-autofocus":id==='deepseek'?true:undefined,
     value:p.apiKey||'',placeholder:meta.keyHint,disabled:!!busy,
     onChange:e=>setKey(id,e.target.value),
     onBlur:()=>{if(!busy)persist(draft.current,true);}})),
   React.createElement("div",{className:"mb-setting-line"},
    React.createElement("div",null,
     React.createElement("b",null,'记住 API Key'),
     React.createElement("small",null,'开启后写入本机浏览器存储，下次打开免重填。关闭则只保留在当前标签页。')),
    React.createElement("button",{className:'mb-toggle '+(p.rememberKey?'on':''),'aria-pressed':!!p.rememberKey,disabled:!!busy,
     'aria-label':'记住 API Key',onClick:()=>setFlag(id,'rememberKey',!p.rememberKey)},React.createElement("i",null))),
   React.createElement("div",{className:"mb-provider-actions"},
    React.createElement("button",{className:'mb-secondary-btn',disabled:!!busy||!p.apiKey,onClick:()=>test(id)},busy===id?'测试中…':`测试 ${meta.label} 连接`)));
 };

 return React.createElement(Overlay,{title:'API 接入',subtitle:'聊天走 DeepSeek，联网检索与生图走智谱；两个 Key 各自独立。',onClose:done,className:'mb-api-overlay mb-api-autosave'},
  React.createElement('div',{className:'mb-access-box'},
   React.createElement('b',null,'关于两个 Key'),
   React.createElement('small',null,'DeepSeek 官方接口没有联网搜索、也没有文生图；这两项能力由智谱的 web_search 与 CogView 提供。只填 DeepSeek 也能正常聊天，只是联网和生图会不可用。')),
  providerCard('deepseek'),
  providerCard('zhipu'),
  React.createElement('details',{className:'mb-api-pricing'},
   React.createElement('summary',null,'高级设置（可选）'),
   React.createElement('div',{className:'mb-rate-fields mb-advanced-fields'},
    React.createElement('label',null,'联网检索精度',
     React.createElement('select',{value:cfg.searchEngine,disabled:!!busy,onChange:e=>patch(next=>{next.searchEngine=e.target.value;})},
      SEARCH_ENGINES.map(s=>React.createElement('option',{key:s.id,value:s.id},s.label)))),
    React.createElement('label',null,'生图模型',
     React.createElement('select',{value:cfg.imageModel,disabled:!!busy,onChange:e=>patch(next=>{next.imageModel=e.target.value;})},
      IMAGE_MODELS.map(s=>React.createElement('option',{key:s.id,value:s.id},s.label)))),
    React.createElement('label',null,'单次回复上限 / Token',
     React.createElement('input',{type:'number',min:'256',max:'32768',step:'256',value:cfg.maxTokens,disabled:!!busy,
      onChange:e=>patch(next=>{next.maxTokens=Math.max(256,Math.min(32768,Number(e.target.value)||4096));})})))),
  React.createElement('p',{className:'mb-dashboard-note'},'费用按厂商公开价目在本页估算，以厂商账单为准；更换浏览器或换文件地址时密钥需要重填。'),
  React.createElement('div',{className:'mb-api-savebar'},
   error&&React.createElement('div',{className:'mb-input-error',role:'alert'},error),
   note&&React.createElement('div',{className:'mb-config-note',role:'status'},note),
   React.createElement('div',{className:'mb-config-actions'},
    React.createElement('button',{className:'mb-secondary-btn',disabled:!!busy,onClick:done},'完成'),
    React.createElement(Liquid,{disabled:!!busy,onClick:()=>test('deepseek')},busy==='deepseek'?'正在测试…':'测试 DeepSeek'))));
}

},
