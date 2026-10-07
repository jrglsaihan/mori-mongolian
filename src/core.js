import {Schema} from 'prosemirror-model';
import {initSync, translate_with_warnings, version} from '../vendor/package/mongol_convert.js';
import wasmBytes from '../vendor/package/mongol_convert_bg.wasm';

export const profiles = {
  '2023': {label:'国标2023', detail:'Unicode 原文编辑；保留 FVS / MVS。字体塑形依赖所选字体，尚未通过 GB/T 25914-2023 全项符合性认证。'},
  '2010': {label:'国标2010', detail:'旧版 Unicode 保留模式：不改写字母、变体选择符或后缀分隔符。2010 ↔ 2023 自动迁移未实现。'},
  menksoft: {label:'蒙科立编码', detail:'私用区原文编辑，需匹配的蒙科立字体。仅显式转换；私用区字符不能仅凭码位认定来源。'}
};

export const ALIGNMENTS=['start','center','end','justify'];
export const LEADINGS=[1.4,1.6,1.8,2.1];
export const FONT_SIZES=[16,20,24,28,32,40,48];
export const HEADING_SCALE={1:1.7,2:1.35,3:1.12};

export function safeColor(s){return /^#[0-9a-f]{6}$/i.test(s)?s:'#26312c';}
export function safeFont(s){return typeof s==='string'&&s.length<=150&&!/[;{}<>\\]/.test(s)?s:'Mori Noto';}
export function safeSize(v){const n=Number(v);return Number.isFinite(n)&&n>=8&&n<=200?n:null;}
export function safeLeading(v){const n=Number(v);return Number.isFinite(n)&&n>=1&&n<=3?n:null;}
export function safeIndent(v){const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=12?n:0;}
export function safeAlign(v){return ALIGNMENTS.includes(v)?v:null;}
export function safePunctShift(v){const n=Number(v);return Number.isFinite(n)?Math.min(0.5,Math.max(-0.5,Math.round(n*100)/100)):-0.15;}
export function safeLeadingScale(v){const n=Number(v);return Number.isFinite(n)?Math.min(1.6,Math.max(0.8,Math.round(n*100)/100)):1;}

// CJK punctuation and quotation marks. In vertical layout these glyphs are drawn
// against one edge of the em box by the font, which in a Mongolian column reads as
// "shifted right" or "too much spacing"; they are tagged so the offset can be tuned.
export const PUNCT_RE=/[\u2018\u2019\u201C\u201D\u2026\u3001\u3002\u3008-\u3011\uFF01-\uFF0F\uFF1A-\uFF1F\uFF3B-\uFF3D\uFF5B-\uFF5D]/;
export const MONGOL_PUNCT_RE=/[\u1800-\u1803\u1805\u1806\u1807\u1809\u180A]/;
export function punctuationRuns(text){
  const runs=[];let i=0;
  while(i<text.length){
    const isPunct=PUNCT_RE.test(text[i])||MONGOL_PUNCT_RE.test(text[i]);
    if(!isPunct){i++;continue;}
    let j=i+1;
    while(j<text.length&&(PUNCT_RE.test(text[j])||MONGOL_PUNCT_RE.test(text[j])))j++;
    runs.push({from:i,to:j,mongolian:MONGOL_PUNCT_RE.test(text[i])});
    i=j;
  }
  return runs;
}

function blockStyle(a){
  const style=[];
  if(a.align)style.push(`text-align:${a.align}`);
  if(a.indent)style.push(`margin-block-start:${a.indent}em`);
  if(a.firstLine)style.push(`text-indent:${a.firstLine}em`);
  if(a.leading)style.push(`line-height:${a.leading}`);
  return style.length?style.join(';'):null;
}
const blockAttrs={align:{default:null},indent:{default:0},firstLine:{default:0},leading:{default:null}};
function blockDOM(tag){return n=>{const style=blockStyle(n.attrs);return style?[tag,{style},0]:[tag,0];};}

export const schema=new Schema({nodes:{
  doc:{content:'block+'},
  paragraph:{attrs:blockAttrs,content:'inline*',group:'block',parseDOM:[{tag:'p'}],toDOM:blockDOM('p')},
  heading:{attrs:{level:{default:1},...blockAttrs},content:'inline*',group:'block',defining:true,
    parseDOM:[1,2,3].map(l=>({tag:'h'+l,attrs:{level:l}})),
    toDOM:n=>{const level=[1,2,3].includes(n.attrs.level)?n.attrs.level:1;const style=blockStyle(n.attrs);return style?['h'+level,{style},0]:['h'+level,0];}},
  bullet_list:{content:'list_item+',group:'block',parseDOM:[{tag:'ul'}],toDOM:()=>['ul',0]},
  list_item:{content:'paragraph block*',defining:true,parseDOM:[{tag:'li'}],toDOM:()=>['li',0]},
  text:{group:'inline'},
  hard_break:{inline:true,group:'inline',selectable:false,parseDOM:[{tag:'br'}],toDOM:()=>['br']}
},marks:{
  strong:{parseDOM:[{tag:'strong'},{tag:'b'}],toDOM:()=>['strong',0]},
  em:{parseDOM:[{tag:'em'},{tag:'i'}],toDOM:()=>['em',0]},
  underline:{parseDOM:[{tag:'u'}],toDOM:()=>['u',0]},
  ink:{attrs:{color:{default:'#26312c'}},parseDOM:[{style:'color'}],toDOM:m=>['span',{style:`color:${safeColor(m.attrs.color)}`},0]},
  textStyle:{attrs:{fontFamily:{default:null},fontSize:{default:null}},
    parseDOM:[{tag:'span[style]',getAttrs:node=>{
      const el=node,family=el.style.fontFamily?el.style.fontFamily.replace(/^["']|["']$/g,''):null,size=el.style.fontSize?parseFloat(el.style.fontSize):null;
      if(!family&&!size)return false;return {fontFamily:family,fontSize:Number.isFinite(size)?size:null};}}],
    toDOM:m=>{const style=[];if(m.attrs.fontFamily)style.push(`font-family:"${safeFont(m.attrs.fontFamily)}"`);const size=safeSize(m.attrs.fontSize);if(size)style.push(`font-size:${size}px`);return ['span',{style:style.join(';')},0];}},
  sup:{excludes:'sub',parseDOM:[{tag:'sup'}],toDOM:()=>['sup',0]},
  sub:{excludes:'sup',parseDOM:[{tag:'sub'}],toDOM:()=>['sub',0]}
}});

export const MM_PER_PX=25.4/96;
export const PAGE_SIZES={A4:{width:210,height:297},A3:{width:297,height:420}};
export function mmToPx(mm){return mm*96/25.4;}
export function pageGeometry(page){
  const base=PAGE_SIZES[page.size]||PAGE_SIZES.A4;
  const landscape=page.orientation==='landscape';
  const widthMm=landscape?base.height:base.width;
  const heightMm=landscape?base.width:base.height;
  const m=page.margins;
  const contentWidthMm=Math.max(10,widthMm-m.left-m.right);
  const contentHeightMm=Math.max(10,heightMm-m.top-m.bottom);
  return {widthMm,heightMm,contentWidthMm,contentHeightMm,
    widthPx:mmToPx(widthMm),heightPx:mmToPx(heightMm),
    contentWidthPx:mmToPx(contentWidthMm),contentHeightPx:mmToPx(contentHeightMm)};
}
export const DEFAULT_PAGE={size:'A4',orientation:'landscape',margins:{top:20,right:20,bottom:20,left:20}};
export function normalizePage(input){
  const src=input&&typeof input==='object'?input:{};
  const size=Object.hasOwn(PAGE_SIZES,src.size)?src.size:'A4';
  const orientation=src.orientation==='portrait'?'portrait':'landscape';
  const m=src.margins&&typeof src.margins==='object'?src.margins:{};
  const clamp=v=>{const n=Number(v);return Number.isFinite(n)?Math.min(50,Math.max(5,Math.round(n))):20;};
  return {size,orientation,margins:{top:clamp(m.top),right:clamp(m.right),bottom:clamp(m.bottom),left:clamp(m.left)}};
}

export function paginateBlocks(blocks,{contentHeight,capacity}){
  if(!Number.isFinite(contentHeight)||contentHeight<=0)throw new Error('无效的版心高度');
  if(!Number.isFinite(capacity)||capacity<=0)throw new Error('无效的每页容量');
  const pages=[];const overflow=[];
  let current=[];let used=0;
  blocks.forEach((block,index)=>{
    const length=Math.max(0,Number(block.length)||0);
    const weight=Number.isFinite(Number(block.weight))&&Number(block.weight)>0?Number(block.weight):1;
    const lines=Math.max(1,Math.ceil((length+0.5)/contentHeight));
    const units=lines*weight;
    if(units>capacity)overflow.push({index,units,lines,capacity});
    if(used+units>capacity&&current.length){pages.push(current);current=[];used=0;}
    current.push(index);used+=units;
  });
  if(current.length)pages.push(current);
  if(!pages.length)pages.push([]);
  return {pages,overflow,totalPages:pages.length};
}

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

export const DOC_VERSION=2;
export function validateFile(input){
  const data=typeof input==='string'?JSON.parse(input):input;
  if(data?.format!=='mori-document'||![1,2].includes(data.version))throw new Error('不是受支持的 Mori 文档（版本 1 或 2）');
  if(!Object.hasOwn(profiles,data.profile))throw new Error('未知蒙古文配置');
  const doc=schema.nodeFromJSON(data.doc);doc.check();
  if(typeof data.title!=='string'||data.title.length>200)throw new Error('文档标题不合法');
  const s=data.settings||{};
  const size=Number(s.size);
  const settings={
    font:typeof s.font==='string'?s.font.slice(0,150):'Mori Noto',
    size:FONT_SIZES.includes(size)?size:28,
    leading:LEADINGS.includes(Number(s.leading))?Number(s.leading):1.8,
    alignment:ALIGNMENTS.includes(s.alignment)?s.alignment:'start',
    margin:[32,48,64].includes(Number(s.margin))?Number(s.margin):48,
    page:normalizePage(typeof s.page==='string'?{size:s.page}:s.page),
    punctShift:safePunctShift(s.punctShift),
    punctScale:safeLeadingScale(s.punctScale)
  };
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
export function cssString(s){return '"'+String(s).replace(/[^a-zA-Z0-9 _-]/gu,c=>'\\'+c.codePointAt(0).toString(16)+' ')+'"';}
export function pageSummary(page){
  const g=pageGeometry(page);
  const orientation=page.orientation==='landscape'?'横向':'纵向';
  return `${page.size} ${orientation} · 版心 ${g.contentWidthMm.toFixed(0)}×${g.contentHeightMm.toFixed(0)} mm`;
}
