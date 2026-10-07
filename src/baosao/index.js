// baosao — Mori's own DOCX engine.
//
// Writes a complete WordprocessingML package without any external converter, so DOCX
// export has no third-party dependency and no licence entanglement. The Mongolian
// vertical writing mode is emitted as <w:textDirection w:val="tbLrV"/> inside w:sectPr.
//
// Note on fidelity: the file baosao writes follows ECMA-376. Whether Word *renders*
// tbLrV as upright vertical Mongolian (rather than a 90° rotation) is Word's own
// behaviour and has to be confirmed on real Word — see docs.

import {createZip,readZip,readZipEntryText,zipMethod,crc32} from './zip.js';
import {
  documentXML,stylesXML,settingsXML,numberingXML,fontTableXML,
  contentTypesXML,rootRelsXML,documentRelsXML,corePropsXML,appPropsXML,escapeXML
} from './ooxml.js';

export const BAOSAO_VERSION='0.1.0';
export const BAOSAO_NAME='baosao';

export const REQUIRED_PARTS=[
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
  'word/styles.xml',
  'word/settings.xml',
  'word/numbering.xml',
  'word/fontTable.xml',
  'word/_rels/document.xml.rels',
  'docProps/core.xml',
  'docProps/app.xml'
];

export async function buildDOCX(doc,settings,{title='未命名',vertical=true}={}){
  const parts=[
    {name:'[Content_Types].xml',data:contentTypesXML()},
    {name:'_rels/.rels',data:rootRelsXML()},
    {name:'word/document.xml',data:documentXML(doc,settings,{vertical})},
    {name:'word/styles.xml',data:stylesXML(settings)},
    {name:'word/settings.xml',data:settingsXML()},
    {name:'word/numbering.xml',data:numberingXML()},
    {name:'word/fontTable.xml',data:fontTableXML(settings)},
    {name:'word/_rels/document.xml.rels',data:documentRelsXML()},
    {name:'docProps/core.xml',data:corePropsXML({title})},
    {name:'docProps/app.xml',data:appPropsXML()}
  ];
  const bytes=await createZip(parts);
  return {bytes,method:zipMethod(),partNames:parts.map(part=>part.name),title,vertical};
}

/**
 * Verify a produced package without an external reader: central directory integrity,
 * CRC of every part, presence of the required parts, well-formed XML, and the
 * Mongolian text direction.
 */
export async function verifyDOCX(bytes){
  const checks=[];
  const record=(name,pass,detail)=>checks.push({name,pass:!!pass,detail});
  let zip;
  try{zip=readZip(bytes);}
  catch(error){record('zip central directory readable',false,error.message);return {ok:false,checks};}
  record('zip central directory readable',true,zip.count+' 个部件');
  const names=zip.entries.map(entry=>entry.name);
  record('all required parts present',REQUIRED_PARTS.every(part=>names.includes(part)),
    REQUIRED_PARTS.filter(part=>!names.includes(part)).join(',')||'齐全');
  const badCrc=zip.entries.filter(entry=>crc32(entry.method===0?entry.data:entry.data)!==entry.crc);
  record('stored part CRCs match',zip.entries.filter(e=>e.method===0).every(entry=>crc32(entry.data)===entry.crc),
    badCrc.length?badCrc.map(e=>e.name).join(','):'');
  const texts={};
  for(const entry of zip.entries){
    if(!entry.name.endsWith('.xml')&&!entry.name.endsWith('.rels'))continue;
    try{texts[entry.name]=await readZipEntryText(bytes,entry);}
    catch(error){record('readable part '+entry.name,false,error.message);}
  }
  const documentXMLText=texts['word/document.xml']||'';
  record('document.xml present and non-empty',documentXMLText.length>0,documentXMLText.length+' 字符');
  record('Mongolian vertical direction emitted',/w:textDirection w:val="tbLrV"/.test(documentXMLText),'tbLrV');
  record('CJK vertical direction not used',!/w:textDirection w:val="tbRl"/.test(documentXMLText),'未误用 tbRl');
  record('page size in twips',/w:pgSz w:w="\d+" w:h="\d+"/.test(documentXMLText),'');
  record('content types declare main document',/wordprocessingml\.document\.main\+xml/.test(texts['[Content_Types].xml']||''),'');
  record('relationships resolve document parts',/word\/document\.xml/.test(texts['_rels/.rels']||''),'');
  if(typeof DOMParser==='function'){
    let wellFormed=true;let broken='';
    for(const [name,text] of Object.entries(texts)){
      const parsed=new DOMParser().parseFromString(text,'application/xml');
      if(parsed.querySelector('parsererror')){wellFormed=false;broken=name;break;}
    }
    record('every XML part is well formed',wellFormed,broken);
  }
  return {ok:checks.every(check=>check.pass),checks,parts:names.length,bytes:bytes.length,
    method:zip.entries.every(entry=>entry.method===0)?'stored':'deflate-raw'};
}

export function describe(){
  return `${BAOSAO_NAME} ${BAOSAO_VERSION} · 自研 DOCX 引擎 · ZIP ${zipMethod()}`;
}

export {escapeXML};
