import {EditorState,TextSelection,AllSelection,Plugin} from 'prosemirror-state';
import fallbackFont from '../vendor/NotoSansMongolian-Regular.ttf';
import {EditorView,Decoration,DecorationSet} from 'prosemirror-view';
import {DOMSerializer,DOMParser as PMDOMParser} from 'prosemirror-model';
import {baseKeymap,toggleMark,setBlockType,chainCommands,exitCode} from 'prosemirror-commands';
import {keymap} from 'prosemirror-keymap';
import {history,undo,redo} from 'prosemirror-history';
import {wrapInList,splitListItem,liftListItem} from 'prosemirror-schema-list';
import {schema,profiles,plainText,textDocument,inspectText,decodeBytes,b64ToBytes,bytesToB64,validateFile,initConverter,convertText,escapeHTML,cssString,
  pageGeometry,pageSummary,normalizePage,DEFAULT_PAGE,DOC_VERSION,safeFont,safeSize,ALIGNMENTS,LEADINGS,FONT_SIZES,HEADING_SCALE,punctuationRuns} from './core.js';
import {computePagination,paginatedHTML,blocksToHTML} from './paginate.js';

const $=id=>document.getElementById(id),native=!!window.webkit?.messageHandlers?.mori;
let seq=0,pending=new Map(),dirty=false,revision=0,draftTimer,composing=false,fonts=[],profile='2023',originals=[],converterVersion='unavailable';
let settings={font:'Mori Noto',size:28,leading:1.8,alignment:'start',margin:48,punctShift:-0.15,punctScale:1,page:{...DEFAULT_PAGE,margins:{...DEFAULT_PAGE.margins}}};
let latestSavedRevision=0,conversionLog=[],docx={available:false,path:null},lastPagination=null,previewPages=0,previewDiagnostics=null,docxProbe=null,punctuationMetrics=null,multicolProbe=null;

window.moriNativeReply=({id,result,error})=>{const p=pending.get(id);if(!p)return;pending.delete(id);error?p.reject(new Error(error)):p.resolve(result);};
function bridge(action,payload={}){if(!native)return Promise.reject(new Error('此功能请在 Mori Mac 应用中使用。浏览器仅提供编辑预览。'));return new Promise((resolve,reject)=>{const id=String(++seq);pending.set(id,{resolve,reject});window.webkit.messageHandlers.mori.postMessage({id,action,payload});});}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,6000);}
function fail(e){toast(e.message||String(e));console.error(e);}
function run(fn){return (...args)=>Promise.resolve().then(()=>fn(...args)).catch(fail);}
async function confirm(message,detail=''){return native?bridge('confirm',{message,detail}):window.confirm(message+'\n'+detail);}
function markDirty(){dirty=true;revision++;$('saveState').textContent=native?'有修改 · 等待备份':'浏览器预览 · 尚未保存';if(native)bridge('dirty',{dirty:true}).catch(fail);clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,900);}
function serialize(){return {format:'mori-document',version:DOC_VERSION,title:$('docTitle').value.slice(0,200)||'未命名',profile,settings,doc:view.state.doc.toJSON(),originals,conversionLog,savedAt:new Date().toISOString()};}
function documentJSON(data,pretty=false){const content=JSON.stringify(data,null,pretty?2:undefined);if(new TextEncoder().encode(content).length>64*1024*1024)throw new Error('文档超过64MB，无法安全保存和重开。请分拆内容。');return content;}
async function saveDraft(){if(!native||composing)return;const r=revision;try{await bridge('draftSave',{content:documentJSON(serialize())});if(r===revision)$('saveState').textContent=dirty?'恢复副本已备份 · 请保存文档':'文档已保存';}catch(e){$('saveState').textContent='恢复副本备份失败';fail(e);}}

function punctuationPlugin(){
  return new Plugin({props:{decorations(state){
    const decorations=[];
    state.doc.descendants((node,pos)=>{
      if(!node.isText||!node.text)return;
      for(const run of punctuationRuns(node.text)){
        decorations.push(Decoration.inline(pos+run.from,pos+run.to,{class:run.mongolian?'mori-punct mori-punct-mn':'mori-punct'}));
      }
    });
    return DecorationSet.create(state.doc,decorations);
  }}});
}
function plugins(){return [history(),punctuationPlugin(),keymap({
  'Mod-z':undo,'Mod-Shift-z':redo,'Mod-y':redo,
  'Mod-b':toggleMark(schema.marks.strong),'Mod-i':toggleMark(schema.marks.em),'Mod-u':toggleMark(schema.marks.underline),
  'Mod-.':toggleMark(schema.marks.sup),'Mod-,':toggleMark(schema.marks.sub),
  'Mod-0':setBlockType(schema.nodes.paragraph),'Mod-1':setBlockType(schema.nodes.heading,{level:1}),
  'Mod-2':setBlockType(schema.nodes.heading,{level:2}),'Mod-3':setBlockType(schema.nodes.heading,{level:3}),
  'Enter':chainCommands(splitListItem(schema.nodes.list_item),baseKeymap.Enter),
  'Mod-[':liftListItem(schema.nodes.list_item),
  'Shift-Enter':chainCommands(exitCode,(state,dispatch)=>{dispatch?.(state.tr.replaceSelectionWith(schema.nodes.hard_break.create()).scrollIntoView());return true;})}),keymap(baseKeymap)];}

const sample=schema.node('doc',null,[
 schema.node('heading',{level:1},schema.text('ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ')),
 schema.node('heading',{level:2},schema.text('ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ')),
 schema.node('paragraph',null,schema.text('ᠰᠠᠢᠨ ᠪᠠᠢᠨ᠎ᠠ ᠤᠤ᠂ ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ᠃')),
 schema.node('paragraph',null,schema.text('ᠲᠡᠭᠷᠢ ᠭᠠᠵᠠᠷ ᠤᠰᠤ ᠠᠭᠤᠯᠠ ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ᠃')),
 schema.node('paragraph',null,schema.text('ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ ᠪᠢᠴᠢᠭ ᠰᠤᠶᠤᠯ᠃')),
 schema.node('paragraph',null,schema.text('在这里，让文字沿着自己的方向生长。'))
]);

const view=new EditorView($('editor'),{
  state:EditorState.create({schema,doc:sample,plugins:plugins()}),
  attributes:{lang:'mn-Mong',spellcheck:'false','aria-label':'蒙古文竖排富文本编辑器','data-placeholder':'开始书写…'},
  dispatchTransaction(tr){view.updateState(view.state.apply(tr));if(tr.docChanged)markDirty();syncToolbar();scheduleOverlay();},
  handleDOMEvents:{
    compositionstart(){composing=true;$('compositionStatus').textContent='正在组字 · 保留输入法候选';return false;},
    compositionend(){composing=false;$('compositionStatus').textContent='系统输入法就绪';clearTimeout(draftTimer);draftTimer=setTimeout(saveDraft,1000);return false;}
  }
});
function busy(){if(composing||view.composing){toast('请先完成输入法组字，再执行此操作。');return true;}return false;}

function currentTextStyle(){const marks=view.state.storedMarks||view.state.selection.$from.marks();const found=marks.find(m=>m.type===schema.marks.textStyle);return found?{...found.attrs}:{fontFamily:null,fontSize:null};}
function setTextStyle(attrs){
  const {state,dispatch}=view;const {empty,from,to}=state.selection;
  const merged={...currentTextStyle(),...attrs};
  if(merged.fontFamily===null&&merged.fontSize===null)return false;
  const mark=schema.marks.textStyle.create(merged);
  if(empty){
    const base=(state.storedMarks||state.selection.$from.marks()).filter(m=>m.type!==schema.marks.textStyle);
    dispatch(state.tr.setStoredMarks([...base,mark]));
    return true;
  }
  dispatch(state.tr.removeMark(from,to,schema.marks.textStyle).addMark(from,to,mark));
  return true;
}
function eachBlock(callback){
  const {state}=view,{from,to,empty}=state.selection,seen=new Set();
  if(empty){
    const parent=state.selection.$from.parent;
    if(parent.type===schema.nodes.paragraph||parent.type===schema.nodes.heading)callback(parent,state.selection.$from.before(),0);
    return;
  }
  state.doc.nodesBetween(from,to,(node,pos,depth)=>{
    if((node.type===schema.nodes.paragraph||node.type===schema.nodes.heading)&&!seen.has(pos)){seen.add(pos);callback(node,pos,depth);}
  });
}
function updateBlockAttrs(attrs){
  const {state,dispatch}=view;let tr=state.tr,changed=false;
  eachBlock((node,pos)=>{tr=tr.setNodeMarkup(pos,undefined,{...node.attrs,...attrs});changed=true;});
  if(changed)dispatch(tr);
  return changed;
}
function setBlock(level){
  const {state,dispatch}=view;const target=level?schema.nodes.heading:schema.nodes.paragraph;
  const attrs=level?{level}:null;
  let tr=state.tr,changed=false;
  eachBlock((node,pos)=>{const next=level?(node.type===target&&node.attrs.level===level?null:attrs):(node.type===target?null:null);if(next)tr=tr.setNodeMarkup(pos,target,{...node.attrs,...next});changed=true;});
  if(!changed){setBlockType(target,attrs)(state,dispatch,view);return;}
  dispatch(tr);
}
function syncToolbar(){
  const stats=inspectText(plainText(view.state.doc));
  $('charCount').textContent=stats.characters;$('wordCount').textContent=stats.words;$('puaCount').textContent=stats.pua;
  const {from,to,empty}=view.state.selection;
  const selected=empty?view.state.doc.textBetween(Math.max(0,from-2),from,'',''):view.state.doc.textBetween(from,to,'\n');
  $('selectionCodes').textContent=Array.from(selected).slice(0,22).map(c=>'U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join(' ')||'请选择文字以查看码点';
  const marks=view.state.storedMarks||view.state.selection.$from.marks();
  for(const [command,type] of [['bold','strong'],['italic','em'],['underline','underline'],['sup','sup'],['sub','sub']]){
    const button=document.querySelector(`[data-command="${command}"]`);if(!button)continue;
    const on=marks.some(m=>m.type===schema.marks[type]);
    button.setAttribute('aria-pressed',String(on));button.classList.toggle('active',on);
  }
  const ts=currentTextStyle();
  $('styleScope').textContent=empty?'文档默认':'应用到选区';
  $('styleScope').classList.toggle('scoped',!empty);
  if($('fontSelect'))$('fontSelect').value=ts.fontFamily||settings.font;
  if($('fontSize'))$('fontSize').value=String(ts.fontSize||settings.size);
  const parent=view.state.selection.$from.parent;
  const level=parent.type===schema.nodes.heading?parent.attrs.level:0;
  if($('headingSelect'))$('headingSelect').value=String(level);
  if($('alignSelect'))$('alignSelect').value=parent.attrs?.align||settings.alignment;
  if($('lineHeight'))$('lineHeight').value=String(parent.attrs?.leading||settings.leading);
  if($('indentValue'))$('indentValue').textContent=(parent.attrs?.indent||0)+' em';
  $('blockKind').textContent=parent.type===schema.nodes.heading?('标题 '+parent.attrs.level):(parent.type===schema.nodes.bullet_list?'列表':'正文');
}
function applySettings(){
  const font=cssString(safeFont(settings.font))+', "Mori Noto", "Mori Punct", sans-serif';
  const geometry=pageGeometry(settings.page);
  document.documentElement.style.setProperty('--doc-font',font);
  document.documentElement.style.setProperty('--doc-size',settings.size+'px');
  document.documentElement.style.setProperty('--doc-leading',settings.leading);
  document.documentElement.style.setProperty('--doc-margin',settings.margin+'px');
  document.documentElement.style.setProperty('--punct-shift',settings.punctShift+'em');
  document.documentElement.style.setProperty('--punct-scale',String(settings.punctScale));
  document.documentElement.style.setProperty('--page-content-height',geometry.contentHeightPx.toFixed(2)+'px');
  // The editing canvas takes the page's content height so that one column of text
  // equals one page; content then wraps to the next column exactly at a page edge.
  view.dom.style.height=geometry.contentHeightPx.toFixed(2)+'px';
  $('editor').style.height=geometry.contentHeightPx.toFixed(2)+'px';
  view.dom.style.textAlign=settings.alignment;
  $('fontPreview').style.fontFamily=font;
  if($('fontSelect'))$('fontSelect').value=settings.font;
  if($('fontSize'))$('fontSize').value=String(settings.size);
  if($('pageSize'))$('pageSize').value=settings.page.size;
  if($('pageOrientation'))$('pageOrientation').value=settings.page.orientation;
  if($('pageMarginPreset'))$('pageMarginPreset').value=marginPreset(settings.page.margins);
  if($('pageInfo'))$('pageInfo').textContent=pageSummary(settings.page);
  if($('punctShift'))$('punctShift').value=String(settings.punctShift);
  if($('punctScale'))$('punctScale').value=String(settings.punctScale);
  $('paperLabel').textContent='横向连续画布 · '+pageSummary(settings.page);
  $('paper').style.zoom=Number($('zoom').value)/100;
  scheduleOverlay();
}
let overlayTimer=null,overlayPagination=null;
function scheduleOverlay(){clearTimeout(overlayTimer);overlayTimer=setTimeout(renderPageOverlay,160);}
function renderPageOverlay(){
  const host=$('pageOverlay');if(!host)return;
  const guides=$('pageGuides')?$('pageGuides').checked:false;
  if(!guides){host.replaceChildren();overlayPagination=null;return;}
  const geometry=pageGeometry(settings.page);
  const pag=computePagination(view.state.doc,settings);
  overlayPagination=pag;
  const editorRect=view.dom.getBoundingClientRect();
  const frag=document.createDocumentFragment();
  pag.pages.forEach((indexes,pageIndex)=>{
    const first=pag.blocks[indexes[0]];
    if(!first)return;
    const node=view.nodeDOM(first.offset);
    if(!node||typeof node.getBoundingClientRect!=='function')return;
    const rect=node.getBoundingClientRect();
    const marker=document.createElement('div');
    marker.className='page-boundary';
    marker.style.left=(rect.left-editorRect.left).toFixed(1)+'px';
    marker.style.height=geometry.contentHeightPx.toFixed(1)+'px';
    marker.innerHTML='<span class="page-boundary-label">第 '+(pageIndex+1)+' 页</span>';
    frag.appendChild(marker);
  });
  host.replaceChildren(frag);
}
function marginPreset(m){const values=[m.top,m.right,m.bottom,m.left];const same=values.every(v=>v===values[0]);if(!same)return 'custom';return values[0]<=14?'12':values[0]>=28?'30':'20';}
function applyProfile(){for(const b of document.querySelectorAll('[data-profile]')){const active=b.dataset.profile===profile;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}$('encodingStatus').textContent=profiles[profile].label+' · 原文保留';$('encodingHint').textContent=profiles[profile].detail;}
function updateTitle(){document.querySelector('.document-card h3').textContent=$('docTitle').value||'未命名';}
function load(data){const d=validateFile(data);view.updateState(EditorState.create({schema,doc:d.doc,plugins:plugins()}));settings=d.settings;profile=d.profile;originals=d.originals;conversionLog=Array.isArray(d.conversionLog)?d.conversionLog:[];$('docTitle').value=d.title;renderFonts();applySettings();applyProfile();updateTitle();syncToolbar();}
function renderFonts(){const filter=$('fontFilter').value;const list=fonts.filter(f=>filter==='all'||(filter==='pua'?f.hasPUA:f.hasMongolian));const select=$('fontSelect');select.replaceChildren(new Option('Noto Sans Mongolian · 内置','Mori Noto'));const seen=new Set(['Mori Noto']);for(const f of list){if(!f.postscript||seen.has(f.postscript))continue;seen.add(f.postscript);select.add(new Option(f.family+' · '+f.postscript,f.postscript));}if(!seen.has(settings.font))select.add(new Option(settings.font+' · 文档指定',settings.font));$('fontCount').textContent=list.length+' 个字形';select.value=settings.font;}
function exec(command){if(busy())return;const marks={bold:schema.marks.strong,italic:schema.marks.em,underline:schema.marks.underline,sup:schema.marks.sup,sub:schema.marks.sub};
  if(command==='undo'){undo(view.state,view.dispatch,view);return view.focus();}
  if(command==='redo'){redo(view.state,view.dispatch,view);return view.focus();}
  if(marks[command]){toggleMark(marks[command])(view.state,view.dispatch,view);return view.focus();}
  if(command==='bullet'){wrapInList(schema.nodes.bullet_list)(view.state,view.dispatch,view);return view.focus();}
  if(command==='indentOut'){eachBlock(n=>updateBlockAttrs({indent:Math.max(0,(n.attrs.indent||0)-1)}));return view.focus();}
  if(command==='indentIn'){eachBlock(n=>updateBlockAttrs({indent:Math.min(12,(n.attrs.indent||0)+1)}));return view.focus();}
  if(command==='firstLine'){eachBlock(n=>updateBlockAttrs({firstLine:(n.attrs.firstLine||0)>=2?0:2}));return view.focus();}
}
function showModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;if(!$('modal').open)$('modal').showModal();}
function hideModal(){$('modal').close();}
function guardUnsaved(){return !dirty?Promise.resolve(true):confirm('替换当前工作区？','当前文档有未保存修改。建议先取消并保存 .mglx 文档。');}
async function save(){if(busy())return;const r=revision;const d=serialize();if(!native){download(d.title+'.mglx',documentJSON(d,true),'application/json');toast('已发起文档下载；浏览器不提供原生恢复副本。');return;}const result=await bridge('save',{name:d.title,content:documentJSON(d,true),kind:'mglx'});if(result.cancelled)return;if(revision===r){dirty=false;latestSavedRevision=r;await bridge('dirty',{dirty:false});$('saveState').textContent='文档已保存';}toast('已保存 '+result.name);}
function download(name,content,type='text/plain'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function buildPrintDocument(){return paginatedHTML(view.state.doc,settings,{title:$('docTitle').value||'未命名',print:true});}
async function print(){if(busy())return;if(!native){toast('打印 / PDF 请在 Mac 应用中使用。');return;}
  await document.fonts.ready;
  const built=buildPrintDocument();
  const note=built.overflow.length?`\n\n注意：有 ${built.overflow.length} 个段落超过单页容量，可能被裁切。`:'';
  if(!await confirm(`按 ${built.totalPages} 页输出`,`已按 ${pageSummary(settings.page)} 完成分页，共 ${built.totalPages} 页。将在系统打印面板中预览，可选择“另存为 PDF”。${note}`))return;
  await bridge('print',{html:built.html});}
async function pagePreview(){if(busy())return;await document.fonts.ready;
  const built=buildPrintDocument();
  const note=built.overflow.length?`<p class="warning">有 ${built.overflow.length} 个段落超过单页容量，已单独成页并可能被裁切。建议拆分该段落或增大纸张。</p>`:'';
  showModal('分页预览',`<p class="field-note">${escapeHTML(pageSummary(settings.page))} · 共 <strong>${built.totalPages}</strong> 页。预览为只读排版结果；正文编辑仍在连续画布中进行。</p>${note}<div class="preview-frame" id="previewFrame"></div>`);
  // The iframe must be created after the dialog is displayed: WebKit does not load
  // srcdoc for an iframe that is inserted while its ancestor is display:none.
  const frame=document.createElement('iframe');
  frame.setAttribute('sandbox','allow-same-origin');
  frame.title='分页预览';
  $('previewFrame').replaceChildren(frame);
  frame.srcdoc=built.html;}

async function exportText(){if(busy())return;showModal('导出文档','<p>文本导出为 UTF-8，蒙古文码点保持不变。</p><div class="modal-actions"><button id="exportUTF8" class="button button-primary">导出 UTF-8 文本</button><button id="exportHTML" class="button">导出版式 HTML</button><button id="exportPDF" class="button">导出 PDF（分页）</button></div><p class="field-note">.txt 不含格式；.mglx 保留格式、页面设置与导入原始字节。</p>');
  $('exportUTF8').onclick=run(async()=>{hideModal();const content=plainText(view.state.doc);if(native)await bridge('save',{name:$('docTitle').value,content,kind:'txt'});else download($('docTitle').value+'.txt',content);});
  $('exportHTML').onclick=run(async()=>{hideModal();const content=paginatedHTML(view.state.doc,settings,{title:$('docTitle').value,print:false}).html;if(native)await bridge('save',{name:$('docTitle').value,content,kind:'html'});else download($('docTitle').value+'.html',content,'text/html');});
  $('exportPDF').onclick=run(async()=>{hideModal();await print();});}

async function exportDOCX(){if(busy())return;
  if(!docx.available){showModal('DOCX 导出不可用',`<p>未检测到本机安装的 LibreOffice，无法进行 DOCX 转换。</p><p class="field-note">Mori 不内置 DOCX 引擎（避免 GPL 许可与体积问题），改为调用本机已安装的 LibreOffice 作为<strong>独立进程</strong>完成转换。安装 LibreOffice 后重启 Mori 即可启用。</p>`);return;}
  await document.fonts.ready;const built=buildPrintDocument();
  if(!await confirm('导出为 DOCX（经 LibreOffice 转换）',`将通过本机 LibreOffice 独立进程转换，共 ${built.totalPages} 页。\n\n注意：DOCX 格式对竖排书写方向与蒙古文字形的支持有限，转换结果可能丢失竖排方向或字形效果。导出后请用 Word 或 LibreOffice 打开核对，不要以此结果替换唯一原件。`))return;
  const result=await bridge('docxExport',{html:built.html,name:$('docTitle').value||'未命名'});
  if(result?.cancelled)return;
  toast('已导出 '+result.name+'（请核对竖排方向是否保留）');}

async function importDOCX(){if(busy()||!await guardUnsaved())return;
  if(!docx.available){toast('未检测到本机 LibreOffice，无法导入 DOCX。');return;}
  const picked=await bridge('docxPick');if(picked?.cancelled)return;
  if(!await confirm('导入 DOCX','将通过 LibreOffice 独立进程转换为 HTML 后导入。\n\n注意：表格、图片、页眉页脚、修订与批注不会导入；竖排方向可能不保留。导入内容作为新文档打开，不会覆盖原文件。'))return;
  const converted=await bridge('docxImport',{path:picked.path});
  if(converted?.cancelled)return;
  const html=decodeBytes(b64ToBytes(converted.base64)).text;
  const parsed=PMDOMParser.fromSchema(schema).parse(new DOMParser().parseFromString(html,'text/html'));
  if(!parsed.childCount)throw new Error('转换结果为空，未导入任何内容。');
  load({format:'mori-document',version:DOC_VERSION,title:picked.name.replace(/\.[^.]+$/,''),profile:'2023',settings,doc:parsed.toJSON(),originals:[]});
  markDirty();
  toast('已导入。请核对蒙古文原文与竖排方向；表格/图片/页眉未导入。');}

function compatibility(){const s=inspectText(plainText(view.state.doc));const selected=fonts.find(f=>f.postscript===settings.font);
  showModal('兼容性与实现边界',`<div class="compat-grid"><section><h3>已实现</h3><ul><li>竖排富文本：上 → 下，列从左 → 右</li><li>选区级字体与字号、粗斜下划线、上标下标、文字颜色</li><li>多级标题 H1–H3、段落缩进与首行缩进、段落行距、四种对齐</li><li>页面设置（A4/A3、横纵向、页边距）与分页预览、分页 PDF 输出</li><li>本机字体枚举；内置 OFL Noto 兜底字体</li><li>Unicode / UTF-8 / UTF-16 原文读写与控制符保留</li><li>蒙科立 MenkShape / MenkLetter 显式转换预览</li><li>本机输入法组字事件接入，组字期间禁止转换</li><li>DOCX 导入导出（经本机 LibreOffice 独立进程）</li></ul></section><section><h3>尚未实现或未认证</h3><ul><li>GB/T 25914-2023 全项字形符合性</li><li>2010 ↔ 2023 自动字形约定迁移</li><li>GB18030-2022 全项及修改单符合性</li><li>表格、图片、页眉页脚、页码域、脚注</li><li>修订、批注、样式集、目录</li><li>页内直接编辑（当前分页为只读预览）</li><li>超过单页容量的超长段落自动拆分</li><li>托忒、锡伯、满文完整转换</li><li>各企业输入法实机认证</li></ul></section></div>
  <p>当前私用区字符：${s.pua}；控制字符：${s.controls}。${selected?'当前字体蒙古文样本覆盖：'+(selected.hasMongolian?'通过':'未通过'):'当前使用内置字体或文档指定字体。'} 覆盖样本仅检查码位，不代表字形标准认证。</p>
  <p class="field-note">分页为按块测量后的排版结果：单个段落超过单页容量时不会自动拆分，会单独成页并提示裁切风险。</p>
  <p class="field-note">DOCX 转换由本机 LibreOffice 以独立进程执行（不链接、不打包），因此 GPL 许可不影响本项目的 MIT 授权。未安装时功能置灰。</p>
  <p class="field-note">转换引擎：Satsrag/mongol-convert ${escapeHTML(converterVersion)}（Apache-2.0）；编辑引擎：ProseMirror（MIT）；Noto Sans Mongolian（SIL OFL 1.1）。未捆绑商业字体、词库或输入法。</p>
  <div class="modal-actions"><button id="exportOriginal" class="button">导出首个导入原始文件</button></div>`);
  $('exportOriginal').disabled=!originals.length;
  $('exportOriginal').onclick=run(async()=>{const o=originals[0];hideModal();if(native)await bridge('save',{name:o.name,base64:o.base64,kind:'txt'});else download(o.name,b64ToBytes(o.base64),'application/octet-stream');});}

function conversion(){if(busy())return;const source=plainText(view.state.doc);
  showModal('编码转换 · 先预览，再导出',`<p class="warning">此转换按字形中转，可能改变名义字母。不会修改正文；导出结果必须由熟悉蒙古文的使用者校对。不能将 UTN57 直接标为完整国标2023。</p><div class="conversion-fields"><label>源约定<select id="convFrom"><option value="utn57">Unicode · UTN57</option><option value="menk_shape">蒙科立 MenkShape（PUA字形）</option><option value="menk_letter">蒙科立 MenkLetter</option><option value="delehi">德力海 Delehi</option><option value="z52">Z52</option><option value="zvvnmod">ZVVNMOD</option></select></label><label>目标约定<select id="convTo"><option value="menk_shape">蒙科立 MenkShape</option><option value="utn57">Unicode · UTN57</option><option value="menk_letter">蒙科立 MenkLetter</option><option value="delehi">德力海 Delehi</option><option value="z52">Z52</option><option value="zvvnmod">ZVVNMOD</option></select></label></div><button id="convRun" class="button button-primary">生成预览</button><p id="convSummary" role="status">原文保留，未进行转换。</p><textarea id="convPreview" readonly aria-label="转换结果"></textarea><pre id="convWarnings"></pre><button id="convExport" class="button" disabled>导出转换结果（UTF-8）</button>`);
  $('convFrom').value=profile==='menksoft'?'menk_shape':'utn57';$('convTo').value=profile==='menksoft'?'utn57':'menk_shape';let result=null;
  $('convRun').onclick=run(()=>{result=convertText($('convFrom').value,$('convTo').value,source);$('convPreview').value=result.text;$('convPreview').style.fontFamily=cssString(settings.font)+', "Mori Noto"';const left=inspectText(result.text).pua;
    $('convSummary').textContent=`生成 ${Array.from(result.text).length} 字符 · ${result.warnings.length} 条引擎警告 · 结果私用区 ${left} 字符`;
    $('convWarnings').textContent=result.warnings.join('\n')||'无引擎警告不等于无损。未映射字符可能原样通过；请核对码点与字形。';$('convExport').disabled=false;});
  for(const id of ['convFrom','convTo'])$(id).onchange=()=>{result=null;$('convExport').disabled=true;$('convPreview').value='';};
  $('convExport').onclick=run(async()=>{if(!result)return;const text=result.text,mode=$('convTo').value;hideModal();if(!await confirm('导出经过字形转换的副本？','源文档不改变；导出结果不保证无损，请勿覆盖唯一原件。'))return;if(native)await bridge('save',{name:$('docTitle').value+'-'+mode,content:text,kind:'txt'});else download($('docTitle').value+'-'+mode+'.txt',text);});}

function findMatches(query){const out=[];if(!query)return out;view.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return;let text='',positions=[];node.descendants((child,offset)=>{if(child.isText){text+=child.text;for(let i=0;i<child.text.length;i++)positions.push(pos+1+offset+i);}else if(child.type===schema.nodes.hard_break){text+='\n';positions.push(pos+1+offset);}});for(let i=0;(i=text.indexOf(query,i))!==-1;i+=query.length){out.push({from:positions[i],to:positions[i+query.length-1]+1});}return false;});return out;}
function findNext(){if(busy())return;const matches=findMatches($('findInput').value);$('findResult').textContent=matches.length+' 处';if(!matches.length)return;const target=matches.find(m=>m.from>=view.state.selection.to)||matches[0];view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,target.from,target.to)).scrollIntoView());view.focus();}
async function replaceAll(){if(busy())return;const matches=findMatches($('findInput').value),replacement=$('replaceInput').value;if(!matches.length)return toast('没有匹配项');if(!await confirm('替换全部 '+matches.length+' 处？','替换可撤销，不跨越段落匹配。'))return;let tr=view.state.tr;for(const m of matches.reverse())tr.insertText(replacement,m.from,m.to);view.dispatch(tr);$('findResult').textContent='已替换 '+matches.length+' 处';view.focus();}
function setTab(tab){for(const b of document.querySelectorAll('[data-tab]')){b.classList.toggle('active',b.dataset.tab===tab);if(b.dataset.tab===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}for(const name of ['home','insert','layout'])$(name+'Toolbar').hidden=name!==tab;if(tab==='encoding'){$('homeToolbar').hidden=false;conversion();}}

const commands={new:async()=>{if(busy()||!await guardUnsaved())return;load({format:'mori-document',version:DOC_VERSION,title:'未命名文档',profile:'2023',settings,doc:textDocument('').toJSON()});markDirty();view.focus();},
  open,save,exportText,print,pagePreview,exportDOCX,importDOCX,
  undo:()=>exec('undo'),redo:()=>exec('redo'),
  find:()=>{$('findBar').hidden=!$('findBar').hidden;$('findToggle').setAttribute('aria-expanded',String(!$('findBar').hidden));if(!$('findBar').hidden)$('findInput').focus();},
  compatibility,convert:conversion};
window.moriCommand=command=>run(commands[command]||(()=>{}))();

async function open(){if(busy()||!await guardUnsaved())return;if(native){const r=await bridge('open');if(!r.cancelled)await receiveFile(r);}else $('fileInput').click();}
async function receiveFile(file){const bytes=b64ToBytes(file.base64);if(bytes.length>(file.name.toLowerCase().endsWith('.mglx')?64:20)*1024*1024)throw new Error('文本限制20MB，Mori文档限制64MB');
  if(file.name.toLowerCase().endsWith('.mglx')){load(decodeBytes(bytes).text);dirty=false;revision++;if(native)await bridge('dirty',{dirty:false});$('saveState').textContent='已打开文档';return;}
  showModal('打开文本 · 明确源编码',`<p>${escapeHTML(file.name)} · ${(bytes.length/1024).toFixed(1)} KB</p><label>字节编码<select id="importBytes"><option value="auto">自动（只识别 UTF-8 / UTF-16 BOM）</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option><option value="gb18030">GB18030（系统解码器，未做2022版认证）</option></select></label><label>蒙古文约定<select id="importProfile"><option value="2023">国标2023 · Unicode 原文</option><option value="2010">国标2010 · 原文保留</option><option value="menksoft">蒙科立 · 私用区原文</option></select></label><p class="field-note">导入不转换蒙古文；原始字节会随 .mglx 保留。蒙科立文本需匹配字体。</p><button id="importCommit" class="button button-primary">保留原文并打开</button><p id="importError" role="alert"></p>`);
  $('importCommit').onclick=async()=>{try{const decoded=decodeBytes(bytes,$('importBytes').value);const p=$('importProfile').value;
    load({format:'mori-document',version:DOC_VERSION,title:file.name.replace(/\.[^.]+$/,''),profile:p,settings,doc:textDocument(decoded.text).toJSON(),originals:[{name:file.name,base64:file.base64,byteEncoding:decoded.encoding,profile:p}]});
    hideModal();markDirty();toast('原文已保留；保存 .mglx 可保留导入原始字节。');}catch(e){$('importError').textContent=e.message;}};}

for(const b of document.querySelectorAll('[data-action]'))b.onclick=()=>window.moriCommand(b.dataset.action);
for(const b of document.querySelectorAll('[data-command]')){b.onmousedown=e=>e.preventDefault();b.onclick=()=>exec(b.dataset.command);}
for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>setTab(b.dataset.tab);
for(const b of document.querySelectorAll('[data-profile]'))b.onclick=()=>{if(busy())return;profile=b.dataset.profile;applyProfile();markDirty();toast('仅切换文档配置；原文未转换。');};
for(const b of document.querySelectorAll('[data-insert]')){b.onmousedown=e=>e.preventDefault();b.onclick=()=>{if(busy())return;view.dispatch(view.state.tr.insertText(String.fromCodePoint(parseInt(b.dataset.insert,16))).scrollIntoView());view.focus();};}

$('fontSelect').onchange=()=>{if(busy())return;const value=$('fontSelect').value;
  if(view.state.selection.empty){settings.font=value;applySettings();markDirty();}
  else{setTextStyle({fontFamily:value});markDirty();}
  syncToolbar();};
$('fontSize').onchange=()=>{if(busy())return;const value=Number($('fontSize').value);
  if(view.state.selection.empty){settings.size=value;applySettings();markDirty();}
  else{setTextStyle({fontSize:value});markDirty();}
  syncToolbar();};
$('headingSelect').onchange=()=>{if(busy())return;setBlock(Number($('headingSelect').value)||0);view.focus();};
$('alignSelect').onchange=()=>{if(busy())return;updateBlockAttrs({align:$('alignSelect').value==='start'?null:$('alignSelect').value});view.focus();};
$('lineHeight').onchange=()=>{if(busy())return;const v=Number($('lineHeight').value);updateBlockAttrs({leading:Math.abs(v-settings.leading)<0.001?null:v});view.focus();};
$('textColor').oninput=()=>{if(busy())return;toggleMark(schema.marks.ink,{color:$('textColor').value})(view.state,view.dispatch);view.focus();};
$('pageSize').onchange=()=>{settings.page.size=$('pageSize').value;applySettings();markDirty();};
$('pageOrientation').onchange=()=>{settings.page.orientation=$('pageOrientation').value;applySettings();markDirty();};
$('pageMarginPreset').onchange=()=>{const v=Number($('pageMarginPreset').value);if(!Number.isFinite(v))return;settings.page.margins={top:v,right:v,bottom:v,left:v};applySettings();markDirty();};
$('punctShift').onchange=()=>{settings.punctShift=Number($('punctShift').value);applySettings();markDirty();};
$('punctScale').onchange=()=>{settings.punctScale=Number($('punctScale').value);applySettings();markDirty();};
$('pageGuides').onchange=()=>{renderPageOverlay();};
$('fontFilter').onchange=renderFonts;
$('docTitle').maxLength=200;$('docTitle').oninput=()=>{updateTitle();markDirty();};
$('guides').onchange=()=>{const on=$('guides').checked;$('paper').classList.toggle('show-guides',on);view.dom.style.outline=on?'1px dashed #9eac8d':'';};
$('zoom').onchange=applySettings;
$('findNext').onclick=findNext;$('findInput').onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229)findNext();};
$('replaceAll').onclick=run(replaceAll);$('findClose').onclick=()=>{$('findBar').hidden=true;$('findToggle').setAttribute('aria-expanded','false');};
$('modalClose').onclick=hideModal;
$('fileInput').onchange=run(async()=>{const f=$('fileInput').files[0];if(f){if(f.size>(f.name.toLowerCase().endsWith('.mglx')?64:20)*1024*1024)throw new Error('文本限制20MB，Mori文档限制64MB');await receiveFile({name:f.name,base64:bytesToB64(new Uint8Array(await f.arrayBuffer()))});}$('fileInput').value='';});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&['s','o','p','f'].includes(e.key.toLowerCase())&&!e.isComposing){e.preventDefault();window.moriCommand({s:'save',o:'open',p:'print',f:'find'}[e.key.toLowerCase()]);}});
window.addEventListener('beforeunload',e=>{if(dirty&&!native){e.preventDefault();e.returnValue='';}});

window.moriSmokeTest=async()=>{const checks=[],check=(name,pass)=>checks.push({name,pass:!!pass});const before=serialize();const original=plainText(view.state.doc);
 check('vertical-lr writing mode',getComputedStyle(view.dom).writingMode==='vertical-lr');
 check('left-to-right direction',getComputedStyle(view.dom).direction==='ltr');
 check('fallback font loaded',document.fonts.check('28px "Mori Noto"'));
 check('converter 0.7.1',converterVersion==='0.7.1');
 const complex='ᠮᠣᠩᠭᠣᠯ\u180B\u180C\u180D\u180E\u180F\u202F\u200D\u200C 😀 中文';
 check('Unicode scalar count',inspectText('ᠮ😀').characters===2);
 check('UTF8 round trip',decodeBytes(new TextEncoder().encode(complex)).text===complex);
 check('UTF16 BOM detection',decodeBytes(Uint8Array.from([255,254,32,24])).text==='ᠠ');
 check('invalid UTF8 rejected',(()=>{try{decodeBytes(Uint8Array.from([255]));return false;}catch{return true;}})());
 check('GB18030 decoder basic',decodeBytes(Uint8Array.from([0xd6,0xd0]),'gb18030').text==='中');
 const geo=pageGeometry(normalizePage({size:'A4',orientation:'landscape',margins:{top:20,right:20,bottom:20,left:20}}));
 check('A4 landscape geometry',Math.round(geo.widthMm)===297&&Math.round(geo.heightMm)===210&&Math.round(geo.contentWidthMm)===257&&Math.round(geo.contentHeightMm)===170);
 const portrait=pageGeometry(normalizePage({size:'A4',orientation:'portrait'}));
 check('portrait swaps axes',Math.round(portrait.widthMm)===210&&Math.round(portrait.heightMm)===297);
 check('page margin clamped',normalizePage({size:'A4',margins:{top:1,right:999,bottom:20,left:20}}).margins.top===5);
 check('unknown page size falls back',normalizePage({size:'B5'}).size==='A4');

 const doc1=schema.node('doc',null,[schema.node('paragraph',null,schema.text('A'))]);
 view.updateState(EditorState.create({schema,doc:doc1,plugins:plugins()}));
 view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,1,2)));
 setTextStyle({fontFamily:'Heiti SC',fontSize:32});
 check('selection font mark applied',JSON.stringify(view.state.doc.toJSON()).includes('Heiti SC'));
 check('selection size mark applied',JSON.stringify(view.state.doc.toJSON()).includes('32'));
 check('textStyle mark rendered inline',view.dom.querySelector('span[style*="font-family"]')!==null);
 check('style scope shows selection',$('styleScope').textContent==='应用到选区');
 view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));
 syncToolbar();
 check('style scope shows document default',$('styleScope').textContent==='文档默认');
 setBlock(2);
 check('heading level 2 applied',view.state.doc.firstChild.type===schema.nodes.heading&&view.state.doc.firstChild.attrs.level===2);
 updateBlockAttrs({indent:2});
 check('paragraph indent applied',view.state.doc.firstChild.attrs.indent===2);
 check('indent rendered as margin',view.dom.querySelector('h2[style*="margin-block-start"]')!==null);
 updateBlockAttrs({align:'center'});
 check('paragraph alignment applied',view.state.doc.firstChild.attrs.align==='center');
 view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
 toggleMark(schema.marks.sup)(view.state,view.dispatch);
 check('superscript mark applied',JSON.stringify(view.state.doc.toJSON()).includes('sup'));
 toggleMark(schema.marks.sub)(view.state,view.dispatch);
 check('subscript replaces superscript',JSON.stringify(view.state.doc.toJSON()).includes('sub')&&!JSON.stringify(view.state.doc.toJSON()).includes('"sup"'));
 load(before);

 const longDoc=schema.node('doc',null,Array.from({length:40},(_,i)=>schema.node('paragraph',null,schema.text('ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ '+(i+1)+' — '+'ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ ᠤᠰᠤ ᠠᠭᠤᠯᠠ᠃'.repeat(2)))));
 const pagination=computePagination(longDoc,settings);
 check('pagination produces pages',pagination.totalPages>=1&&pagination.pages.length===pagination.totalPages);
 check('pagination covers every block',pagination.pages.flat().length===pagination.blocks.length);
 check('pagination respects capacity',pagination.pages.every(page=>page.length>0));
 check('pagination measures block lengths',pagination.blocks.every(b=>Number.isFinite(b.length)&&b.length>0));
 check('pagination keeps normal paragraphs on shared pages',pagination.pages.length<pagination.blocks.length);
 check('pagination has no false overflow',pagination.overflow.length===0);
 const htmlBuilt=paginatedHTML(longDoc,settings,{title:'分页测试',print:true});
 check('paginated HTML has one page div per page',(htmlBuilt.html.match(/class="page"/g)||[]).length===htmlBuilt.totalPages);
 check('paginated HTML uses @page size',/@page\{size:297\.0mm 210\.0mm/.test(htmlBuilt.html));
 check('paginated HTML uses vertical writing',/writing-mode:vertical-lr/.test(htmlBuilt.html));
 check('paginated HTML embeds page numbers',/class="page-number">1 \//.test(htmlBuilt.html));
 check('paginated HTML embeds fallback font',htmlBuilt.html.includes("font-family:'Mori Noto'"));

 const printDoc=new DOMParser().parseFromString(paginatedHTML(view.state.doc,settings,{title:'T',print:true}).html,'text/html');
 check('print CSS font not HTML-escaped',!printDoc.querySelector('style').textContent.includes('&quot;'));

 const menk=convertText('utn57','menk_shape','ᠮᠣᠩᠭᠣᠯ');
 check('Menksoft conversion produces PUA',inspectText(menk.text).pua>0);
 const back=convertText('menk_shape','utn57',menk.text);
 check('Menksoft converts back to Mongolian',/[\u1820-\u1842]/u.test(back.text));
 check('unrelated text preserved by converter',convertText('menk_shape','utn57','中文 ABC 😀').text==='中文 ABC 😀');
 check('lossy conversion produces explicit warning',menk.roundTripExact===false&&menk.warnings.length>0);
 for(const p of Object.keys(profiles)){profile=p;applyProfile();check('profile preserves codepoints '+p,plainText(view.state.doc)===original);}
 profile=before.profile;applyProfile();

 const testDoc=schema.node('doc',null,[schema.node('paragraph',null,[schema.text('AB',[schema.marks.strong.create()]),schema.text('CD')])]);
 view.updateState(EditorState.create({schema,doc:testDoc,plugins:plugins()}));
 check('search across inline formatting',findMatches('BCD').length===1&&findMatches('BCD')[0].from===2);
 $('findInput').value='BC';const selectionBefore=view.state.selection.from;
 $('findInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));
 check('find does not steal IME confirmation',view.state.selection.from===selectionBefore);
 conversion();$('convRun').click();await new Promise(r=>setTimeout(r,20));
 check('conversion dialog preview',!$('convExport').disabled&&$('convPreview').value.length>0);hideModal();
 check('docx availability reported',typeof docx.available==='boolean');
 if(docx.available){
   try{const probe=await bridge('docxProbe');docxProbe=probe;check('docx conversion round trip',probe.ok===true);}
   catch(e){check('docx conversion round trip',false);}
 }
 const punctSample='“双引号” ‘单引号’ 「直角」 ᠂᠃᠀᠁ 、。，． ,.;:!? "\'';
 const punctDoc=schema.node('doc',null,[
   schema.node('paragraph',null,schema.text('“双引号” ‘单引号’ 「直角」')),
   schema.node('paragraph',null,schema.text('᠂᠃᠀᠁ 、。，．')),
   schema.node('paragraph',null,schema.text(', . ; : ! ? " \'')),
   schema.node('paragraph',null,schema.text('“ᠮᠣᠩᠭᠣᠯ” ᠪᠢᠴᠢᠭ᠃'))
 ]);
 load({format:'mori-document',version:DOC_VERSION,title:'标点诊断',profile:'2023',settings,doc:punctDoc.toJSON()});
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 {
   const p=view.dom.querySelector('p');const node=p?.firstChild;const rects=[];
   if(node&&node.nodeType===3){
     const range=document.createRange();
     const base=settings.size;
     for(let i=0;i<node.data.length;i++){
       range.setStart(node,i);range.setEnd(node,i+1);
       const r=range.getBoundingClientRect();
       rects.push({ch:node.data[i],cp:'U+'+node.data.codePointAt(i).toString(16).toUpperCase().padStart(4,'0'),
         adv:Math.round(r.height*10)/10,thick:Math.round(r.width*10)/10,top:Math.round(r.top*10)/10,ratio:Math.round(r.height/base*100)/100});
     }
   }
   punctuationMetrics={fontSize:settings.size,font:settings.font,rects,
     wideCount:rects.filter(r=>r.ratio>1.15).length,
     narrowCount:rects.filter(r=>r.ratio<0.85).length,
     fontsMissingPunctuation:fonts.filter(f=>f.hasPunctuation===false).map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i).slice(0,15),
     menkPunctuation:fonts.filter(f=>/Menk|Menksoft/i.test(f.family)).map(f=>({family:f.family,ok:f.hasPunctuation,missing:f.missingPunctuation})).slice(0,6)};
 }
 {
   const host=document.createElement('div');
   host.style.cssText='position:absolute;left:-100000px;top:0;width:400px;height:200px;writing-mode:vertical-lr;'+
     'column-count:2;column-gap:30px;font-size:14px;line-height:1.6;font-family:"Mori Noto",sans-serif';
   const kids=[];
   for(let i=0;i<4;i++){
     const d=document.createElement('div');
     d.textContent='B'+i+' '+'ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ '.repeat(20);
     host.appendChild(d);kids.push(d);
   }
   document.body.appendChild(host);
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const hr=host.getBoundingClientRect();
   multicolProbe={
     host:{w:Math.round(hr.width),h:Math.round(hr.height)},
     computed:{writingMode:getComputedStyle(host).writingMode,columnCount:getComputedStyle(host).columnCount,columnGap:getComputedStyle(host).columnGap},
     blocks:kids.map(k=>{const r=k.getBoundingClientRect();return{left:Math.round(r.left-hr.left),top:Math.round(r.top-hr.top),w:Math.round(r.width),h:Math.round(r.height)};}),
     columnsAdvanceHorizontally:new Set(kids.map(k=>Math.round(k.getBoundingClientRect().top))).size===1
   };
   host.remove();
 }
 {
   const long=schema.node('doc',null,Array.from({length:30},(_,i)=>schema.node('paragraph',null,schema.text('ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ ᠤᠰᠤ ᠠᠭᠤᠯᠠ᠃ '+String(i+1)))));
   load({format:'mori-document',version:DOC_VERSION,title:'分页书写验证',profile:'2023',settings,doc:long.toJSON()});
   await new Promise(r=>setTimeout(r,320));
   const landGeo=pageGeometry(settings.page);
   const boundaries=document.querySelectorAll('#pageOverlay .page-boundary').length;
   const labels=Array.from(document.querySelectorAll('#pageOverlay .page-boundary-label')).map(n=>n.textContent);
   check('editor canvas height equals page content height',Math.abs(parseFloat(view.dom.style.height)-landGeo.contentHeightPx)<1);
   check('page boundaries drawn while editing',boundaries>=2);
   check('page boundaries are numbered',labels.length===boundaries&&labels[0]==='第 1 页');
   check('page boundaries advance left to right',(()=>{
     const xs=Array.from(document.querySelectorAll('#pageOverlay .page-boundary')).map(m=>parseFloat(m.style.left));
     return xs.length>=2&&xs[0]>0&&xs.every((v,i)=>i===0||v>xs[i-1]);
   })());
   settings.page.orientation='portrait';applySettings();
   await new Promise(r=>setTimeout(r,320));
   const portGeo=pageGeometry(settings.page);
   const portBoundaries=document.querySelectorAll('#pageOverlay .page-boundary').length;
   check('portrait canvas follows page orientation',Math.abs(parseFloat(view.dom.style.height)-portGeo.contentHeightPx)<1);
   check('portrait content box is taller than wide',portGeo.contentHeightPx>portGeo.contentWidthPx);
   check('portrait repaginates',portBoundaries>=2&&portBoundaries!==boundaries);
   settings.page.orientation='landscape';applySettings();
   await new Promise(r=>setTimeout(r,200));
 }
 load(before);dirty=false;clearTimeout(draftTimer);
 if(native)await bridge('dirty',{dirty:false});
 $('saveState').textContent='本地工作区 · 离线就绪';
 view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));view.dom.blur();
 await document.fonts.ready;
 try{
   const sampleDoc=schema.node('doc',null,Array.from({length:26},(_,i)=>schema.node('paragraph',null,schema.text('ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ ᠤᠰᠤ ᠠᠭᠤᠯᠠ᠃ '+String(i+1)))));
   load({format:'mori-document',version:DOC_VERSION,title:'分页预览验证',profile:'2023',settings,doc:sampleDoc.toJSON()});
   await pagePreview();
   const frame=document.querySelector('#modalBody iframe');
   const srcdoc=frame?.srcdoc||'';
   const pages=(srcdoc.match(/class="page"/g)||[]).length;
   check('page preview opens with rendered pages',!!frame&&pages>1);
   check('page preview shows page numbers',/class="page-number">1 \//.test(srcdoc));
   check('page preview uses vertical writing',/writing-mode:vertical-lr/.test(srcdoc));
   check('page preview applies page size',/@page\{size:297\.0mm 210\.0mm/.test(srcdoc));
   await new Promise(r=>setTimeout(r,400));
   const inner=frame?.contentDocument;
   const bodies=inner?Array.from(inner.querySelectorAll('.page-body')):[];
   check('preview iframe document reachable',!!inner&&bodies.length===pages);
   check('preview pages contain text',bodies.length>0&&bodies.every(b=>b.textContent.trim().length>0));
   const laid=bodies[0];
   check('preview page body has vertical layout',!!laid&&inner.defaultView.getComputedStyle(laid).writingMode==='vertical-lr');
   check('preview page body has non-zero extent',!!laid&&laid.getBoundingClientRect().height>100&&laid.getBoundingClientRect().width>100);
   const firstBlock=laid?.firstElementChild;
   check('preview blocks are laid out inside the page',!!firstBlock&&firstBlock.getBoundingClientRect().height>0);
   previewPages=pages;
   previewDiagnostics=inner?{pages:bodies.length,
     iframeURL:String(inner.URL||''),readyState:String(inner.readyState||''),
     rootChildren:inner.documentElement?inner.documentElement.children.length:-1,
     bodyHTMLLength:inner.body?inner.body.innerHTML.length:-1,
     srcdocLength:srcdoc.length,
     bodyRect:laid?{w:Math.round(laid.getBoundingClientRect().width),h:Math.round(laid.getBoundingClientRect().height)}:null,
     firstBlock:firstBlock?{tag:firstBlock.tagName,w:Math.round(firstBlock.getBoundingClientRect().width),h:Math.round(firstBlock.getBoundingClientRect().height)}:null,
     fontsReady:inner.fonts?inner.fonts.status:'unknown'}:{error:'iframe document not reachable',srcdocLength:srcdoc.length};
   const probes={};
   for(const [label,sandbox] of [['sandboxed','allow-same-origin'],['plain',null]]){
     const probe=document.createElement('iframe');
     if(sandbox)probe.setAttribute('sandbox',sandbox);
     probe.style.cssText='position:absolute;left:-100000px;width:50px;height:50px';
     document.body.appendChild(probe);
     probe.srcdoc='<!doctype html><html><body><p id="probe">hello</p></body></html>';
     await new Promise(r=>setTimeout(r,300));
     const d=probe.contentDocument;
     probes[label]={url:String(d?.URL||''),text:d?.body?d.body.textContent:'',ready:String(d?.readyState||'')};
     probe.remove();
   }
   previewDiagnostics.probes=probes;
 }catch(e){check('page preview opens with rendered pages',false);}
 hideModal();
 load({format:'mori-document',version:DOC_VERSION,title:'标点诊断',profile:'2023',settings,
   doc:schema.node('doc',null,Array.from({length:9},(_,i)=>[
     schema.node('paragraph',null,schema.text('“双引号” ‘单引号’ 「直角」 '+(i+1))),
     schema.node('paragraph',null,schema.text('᠂᠃᠀᠁ 、。，． ᠮᠣᠩᠭᠣᠯ ᠪᠢᠴᠢᠭ᠃')),
     schema.node('paragraph',null,schema.text(', . ; : ! ? " \'')),
     schema.node('paragraph',null,schema.text('“ᠮᠣᠩᠭᠣᠯ” ᠪᠢᠴᠢᠭ᠃ ᠲᠠᠯ᠎ᠠ ᠨᠤᠲᠤᠭ᠃'))
   ]).flat()).toJSON()});
 await new Promise(r=>setTimeout(r,320));
 view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));view.dom.blur();
 dirty=false;clearTimeout(draftTimer);
 if(native)await bridge('dirty',{dirty:false});
 $('saveState').textContent='本地工作区 · 离线就绪';
 view.dispatch(view.state.tr.setSelection(TextSelection.atStart(view.state.doc)));view.dom.blur();
 await document.fonts.ready;
 return {ok:checks.every(c=>c.pass),checks,
  fonts:fonts.filter(f=>f.hasMongolian).map(f=>f.family).filter((v,i,a)=>a.indexOf(v)===i),
  conversionExample:{source:'ᠮᠣᠩᠭᠣᠯ',privateUse:menk.text,result:back.text,warnings:back.warnings},
  pageExample:{summary:pageSummary(settings.page),totalPages:pagination.totalPages,blocks:pagination.blocks.length,overflow:pagination.overflow.length,
    capacity:pagination.capacity,basePitch:Math.round(pagination.basePitch*10)/10,contentHeightPx:Math.round(pagination.geometry.contentHeightPx),
    sample:pagination.blocks.slice(0,3).map(b=>({length:Math.round(b.length),weight:Math.round(b.weight*100)/100}))},
  docxAvailable:docx.available,docxProbe,punctuationMetrics,multicolProbe,
  previewPages,previewDiagnostics,
  boundary:'Smoke tests are not national-standard conformance or vendor IME certification.'};};

async function boot(){try{converterVersion=initConverter();}catch(e){fail(e);}
 $('previewNote').hidden=native;
 if(native){
  try{fonts=await bridge('fonts');}catch(e){fail(e);}
  try{const info=await bridge('docxAvailable');docx={available:!!info?.available,path:info?.path||null};}catch(e){docx={available:false,path:null};}
  try{const draft=await bridge('draftLoad');if(draft.content){const parsed=validateFile(draft.content);load({...parsed,doc:parsed.doc.toJSON()});dirty=true;await bridge('dirty',{dirty:true});$('saveState').textContent='已恢复副本 · 请另存文档';}}catch(e){toast('恢复副本读取失败；原文件未改动：'+e.message);}}
 renderFonts();applySettings();applyProfile();syncToolbar();
 $('docxState').textContent=docx.available?'LibreOffice 已就绪':'未检测到 LibreOffice';
 $('docxState').classList.toggle('available',docx.available);
 await document.fonts.ready;window.moriReady=true;}
boot().catch(fail);
