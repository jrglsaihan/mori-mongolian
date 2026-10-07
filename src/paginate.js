import {DOMSerializer} from 'prosemirror-model';
import {schema,pageGeometry,mmToPx,cssString,safeFont,escapeHTML,HEADING_SCALE,paginateBlocks} from './core.js';

const MEASURE_ID='mori-measure';
const BLOCK_GAP_EM=0.62;
function measureHost(base){
  let host=document.getElementById(MEASURE_ID);
  if(!host){
    host=document.createElement('div');
    host.id=MEASURE_ID;
    host.setAttribute('aria-hidden','true');
    document.body.appendChild(host);
  }
  host.style.cssText='position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;'+
    'writing-mode:vertical-lr;text-orientation:mixed;direction:ltr;height:100000px;width:max-content;'+
    'max-width:none;white-space:normal;margin:0;padding:0;border:0;'+
    `font-family:${cssString(safeFont(base.font))},'Mori Noto',sans-serif;font-size:${base.size}px;`+
    `line-height:${base.leading};color:#000;`;
  return host;
}
// WebKit stretches block boxes along the inline axis inside a tall vertical-lr container,
// so each block is measured as an inline box: its height is the true text length and its
// width is the line thickness. Heading sizes are applied explicitly so measurement does
// not depend on stylesheet scope.
//
// All blocks are appended first and every rect is read afterwards, so the whole document
// costs one layout instead of one forced reflow per block — per-block reflow made a
// 40-block document take seconds and pushed the self-check past its deadline.
export function measureBlocks(doc,base){
  const host=measureHost(base);
  const serializer=DOMSerializer.fromSchema(schema);
  const basePitch=Math.max(1,base.size*base.leading);
  const entries=[];
  doc.forEach((node,offset,index)=>{
    const dom=serializer.serializeNode(node);
    const level=node.type===schema.nodes.heading?node.attrs.level:0;
    const scale=level?(HEADING_SCALE[level]||1):1;
    dom.style.cssText=`display:inline;margin:0;padding:0;border:0;font-size:${(base.size*scale).toFixed(2)}px;`+
      `font-weight:${level?600:400};line-height:${base.leading};`;
    entries.push({dom,node,offset,index});
  });
  if(!entries.length)return [];
  host.replaceChildren(...entries.map(entry=>entry.dom));
  const rects=entries.map(entry=>entry.dom.getBoundingClientRect());
  host.replaceChildren();
  return entries.map((entry,index)=>({
    index:entry.index,offset:entry.offset,node:entry.node,
    length:Math.max(0,rects[index].height),
    // In the measuring host the block's width is its exact extent along the block axis,
    // i.e. how many columns it occupies. Reading it here keeps page packing independent
    // of the editor's own layout, which is never in a settled state while the spacers
    // between pages are being adjusted.
    thickness:Math.max(1,rects[index].width),
    weight:(Math.max(1,rects[index].width)+base.size*BLOCK_GAP_EM)/basePitch
  }));
}

/** Block-axis extent a set of blocks occupies, in CSS px at zoom 1. */
export function pageExtent(blocks){
  if(!blocks.length)return 0;
  // No inter-block term: measured against the real editor the sum of block extents already
  // matched the rendered pitch, and adding the paragraph gap on top overshot by roughly
  // one gap per block, which made the fill width grow on every pass.
  return blocks.reduce((total,block)=>total+Math.max(1,block.thickness),0);
}
let cachedPagination=null;
function settingsSignature(settings){
  const page=settings.page;
  return [settings.font,settings.size,settings.leading,page.size,page.orientation,
    page.margins.top,page.margins.right,page.margins.bottom,page.margins.left].join('|');
}
export function computePagination(doc,settings){
  const signature=settingsSignature(settings);
  if(cachedPagination&&cachedPagination.doc===doc&&cachedPagination.signature===signature){
    return cachedPagination.value;
  }
  const geometry=pageGeometry(settings.page);
  const base={font:settings.font,size:settings.size,leading:settings.leading};
  const blocks=measureBlocks(doc,base);
  const basePitch=settings.size*settings.leading;
  const capacity=Math.max(1,Math.floor(geometry.contentWidthPx/basePitch));
  const result=paginateBlocks(blocks,{contentHeight:geometry.contentHeightPx,capacity});
  const value={...result,blocks,geometry,capacity,basePitch};
  cachedPagination={doc,signature,value};
  return value;
}
export function blocksToHTML(blocks){
  const serializer=DOMSerializer.fromSchema(schema);
  return blocks.map(b=>serializer.serializeNode(b.node).outerHTML);
}

export function paginatedBodyHTML(doc,settings){
  const pagination=computePagination(doc,settings);
  const html=blocksToHTML(pagination.blocks);
  const pages=pagination.pages.map((indexes,pageIndex)=>{
    const inner=indexes.map(i=>html[i]).join('');
    return `<div class="page"><div class="page-body">${inner||'<p></p>'}</div><div class="page-number">${pageIndex+1} / ${pagination.totalPages}</div></div>`;
  }).join('');
  return {html:pages,...pagination};
}

export function paginatedHTML(doc,settings,{title='未命名',print=false,fontURL='NotoSansMongolian-Regular.ttf'}={}){
  const {html,pagination,geometry,overflow,totalPages}=(()=>{const r=paginatedBodyHTML(doc,settings);return {html:r.html,pagination:r,geometry:r.geometry,overflow:r.overflow,totalPages:r.totalPages};})();
  const font=cssString(safeFont(settings.font));
  const g=geometry;
  const face=fontURL?`@font-face{font-family:'Mori Noto';src:url('${fontURL}')}`:'';
  const warn=overflow.length?`<div class="overflow-warning">有 ${overflow.length} 个段落超过单页容量，已单独成页且可能被裁切。</div>`:'';
  return {totalPages,overflow,html:`<!doctype html><html lang="mn-Mong"><head><meta charset="utf-8">`+
`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src 'self' data:">`+
`<title>${escapeHTML(title)}</title><style>`+
face+
`@page{size:${g.widthMm.toFixed(1)}mm ${g.heightMm.toFixed(1)}mm;margin:0}`+
`html,body{margin:0;padding:0;background:${print?'#fff':'#5a6357'};color:#26312c}`+
`body{font-family:${font},'Mori Noto',sans-serif;font-size:${settings.size}px;line-height:${settings.leading};text-align:${settings.alignment}}`+
`.page{position:relative;box-sizing:border-box;width:${g.widthPx.toFixed(2)}px;height:${g.heightPx.toFixed(2)}px;`+
`padding:${mmToPx(settings.page.margins.top).toFixed(2)}px ${mmToPx(settings.page.margins.right).toFixed(2)}px ${mmToPx(settings.page.margins.bottom).toFixed(2)}px ${mmToPx(settings.page.margins.left).toFixed(2)}px;`+
`background:#faf7ef;${print?'':'margin:0 0 26px 0;box-shadow:0 6px 24px #00000055;'}break-after:page;page-break-after:always;overflow:hidden}`+
`.page:last-child{break-after:auto;page-break-after:auto}`+
`.page-body{writing-mode:vertical-lr;text-orientation:mixed;direction:ltr;width:100%;height:100%;overflow:hidden}`+
`.page-body p{margin:0 0 0 0.62em}.page-body h1,.page-body h2,.page-body h3{margin:0 0 0.9em;font-weight:600}`+
`h1{font-size:${(settings.size*HEADING_SCALE[1]).toFixed(1)}px}h2{font-size:${(settings.size*HEADING_SCALE[2]).toFixed(1)}px}h3{font-size:${(settings.size*HEADING_SCALE[3]).toFixed(1)}px}`+
`.page-body ul{margin:0 0 0 0.62em;padding-inline-start:1.3em}.page-body li>p{margin:0}`+
`.page-number{position:absolute;bottom:6px;right:10px;font-size:10px;color:#7d8776}`+
`.overflow-warning{position:fixed;top:0;left:0;right:0;padding:6px 12px;background:#5a3a34;color:#f3d6d0;font:12px/1.5 sans-serif;z-index:9}`+
`</style></head><body>${warn}${html}</body></html>`};
}

export function pagePreviewDOM(doc,settings,container){
  const {html,geometry,totalPages,overflow}=paginatedHTML(doc,settings,{print:false});
  const frame=document.createElement('iframe');
  frame.setAttribute('sandbox','');
  frame.setAttribute('title','分页预览');
  frame.style.cssText='width:100%;height:100%;border:0;background:#5a6357';
  container.replaceChildren(frame);
  frame.srcdoc=html;
  return {totalPages,overflow,geometry};
}
