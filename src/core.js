import {Schema} from 'prosemirror-model';
import {initSync, translate_with_warnings, version} from '../vendor/package/mongol_convert.js';
import wasmBytes from '../vendor/package/mongol_convert_bg.wasm';

export const profiles = {
  '2023': {label:'国标2023', detail:'Unicode 原文编辑；保留 FVS / MVS。字体塑形依赖所选字体，尚未通过 GB/T 25914-2023 全项符合性认证。'},
  '2010': {label:'国标2010', detail:'旧版 Unicode 保留模式：不改写字母、变体选择符或后缀分隔符。2010 ↔ 2023 自动迁移未实现。'},
  menksoft: {label:'蒙科立编码', detail:'私用区原文编辑，需匹配的蒙科立字体。仅显式转换；私用区字符不能仅凭码位认定来源。'}
};
export const schema = new Schema({nodes:{
  doc:{content:'block+'},
  paragraph:{content:'inline*',group:'block',parseDOM:[{tag:'p'}],toDOM:()=>['p',0]},
  heading:{attrs:{level:{default:1}},content:'inline*',group:'block',defining:true,parseDOM:[{tag:'h1',attrs:{level:1}},{tag:'h2',attrs:{level:2}}],toDOM:n=>[n.attrs.level===2?'h2':'h1',0]},
  bullet_list:{content:'list_item+',group:'block',parseDOM:[{tag:'ul'}],toDOM:()=>['ul',0]},
  list_item:{content:'paragraph block*',defining:true,parseDOM:[{tag:'li'}],toDOM:()=>['li',0]},
  text:{group:'inline'},
  hard_break:{inline:true,group:'inline',selectable:false,parseDOM:[{tag:'br'}],toDOM:()=>['br']}
},marks:{
  strong:{parseDOM:[{tag:'strong'},{tag:'b'}],toDOM:()=>['strong',0]},
  em:{parseDOM:[{tag:'em'},{tag:'i'}],toDOM:()=>['em',0]},
  underline:{parseDOM:[{tag:'u'}],toDOM:()=>['u',0]},
  ink:{attrs:{color:{default:'#26312c'}},toDOM:m=>['span',{style:`color:${safeColor(m.attrs.color)}`},0]}
}});
export function safeColor(s){return /^#[0-9a-f]{6}$/i.test(s)?s:'#26312c';}
export function textDocument(text){return schema.node('doc',null,text.replace(/\r\n?/g,'\n').split('\n').map(s=>schema.node('paragraph',null,s?schema.text(s):null)));}
export function plainText(doc){return doc.textBetween(0,doc.content.size,'\n','\n');}
export function inspectText(text){const chars=Array.from(text);return {characters:chars.length,words:(text.trim().match(/[^\s\u180e\u202f]+/gu)||[]).length,pua:chars.filter(c=>{const n=c.codePointAt(0);return(n>=0xe000&&n<=0xf8ff)||(n>=0xf0000&&n<=0xffffd)||(n>=0x100000&&n<=0x10fffd);}).length,controls:chars.filter(c=>/[\u180b-\u180f\u200c\u200d\u202f]/u.test(c)).length};}
export function decodeBytes(bytes,encoding='auto'){
  let chosen=encoding;
  if(chosen==='auto'){
    if(bytes[0]===0xff&&bytes[1]===0xfe)chosen='utf-16le';
    else if(bytes[0]===0xfe&&bytes[1]===0xff)chosen='utf-16be';
    else chosen='utf-8';
  }
  if(!['utf-8','utf-16le','utf-16be','gb18030'].includes(chosen))throw new Error('不支持的字节编码');
  try{return {text:new TextDecoder(chosen,{fatal:true}).decode(bytes),encoding:chosen};}
  catch{throw new Error('无法无损解码。请明确选择 UTF-8、UTF-16 或 GB18030；不自动猜测编码。');}
}
export function b64ToBytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
export function bytesToB64(bytes){let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
export function validateFile(input){
  const data=typeof input==='string'?JSON.parse(input):input;
  if(data?.format!=='mori-document'||data.version!==1)throw new Error('不是受支持的 Mori 文档（版本 1）');
  if(!Object.hasOwn(profiles,data.profile))throw new Error('未知蒙古文配置');
  const doc=schema.nodeFromJSON(data.doc);doc.check();
  const s=data.settings||{};
  if(typeof data.title!=='string'||data.title.length>200)throw new Error('文档标题不合法');
  const settings={font:typeof s.font==='string'?s.font.slice(0,150):'Mori Noto',size:[20,24,28,32,40].includes(Number(s.size))?Number(s.size):28,leading:[1.5,1.8,2.1].includes(Number(s.leading))?Number(s.leading):1.8,alignment:['start','center','end','justify'].includes(s.alignment)?s.alignment:'start',margin:[32,48,64].includes(Number(s.margin))?Number(s.margin):48,page:s.page==='A3'?'A3':'A4'};
  const originals=Array.isArray(data.originals)?data.originals.filter(x=>x&&typeof x.name==='string'&&typeof x.base64==='string'&&/^[A-Za-z0-9+/=]*$/.test(x.base64)).slice(0,20):[];
  return {...data,doc,settings,originals};
}
let conversionReady=false;
export function initConverter(){if(!conversionReady){initSync({module:wasmBytes});conversionReady=true;}return version();}
export function convertText(from,to,text){
  if(text.length>500000)throw new Error('单次转换限制 50 万字符，请分段处理。');
  initConverter();const result=translate_with_warnings(from,to,text);
  try{
    const output=result.text,warnings=Array.from(result.warnings);let roundTripExact=null;
    try{const reverse=translate_with_warnings(to,from,output);try{roundTripExact=reverse.text===text;}finally{reverse.free();}}catch{warnings.push('逆向校验不可用，不能确认可逆性。');}
    if(roundTripExact===false)warnings.unshift('重要：往返转换后的码点不等于原文；已确认该结果不能无损还原。不要用于替换原始语言文本。');
    return {text:output,warnings,repairs:Array.from(result.repairs),roundTripExact,version:version()};
  }finally{result.free();}
}
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
