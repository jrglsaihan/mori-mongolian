// baosao / ooxml — WordprocessingML serialisation for a ProseMirror document.
//
// baosao writes the OOXML parts itself instead of delegating to an external converter.
// The Mongolian vertical writing mode is the point of the whole thing:
//   <w:textDirection w:val="tbLrV"/>   top-to-bottom, columns advancing left-to-right
// The sibling value tbRl is CJK vertical (columns advance right-to-left) and must not be
// used here. Both are only meaningful inside w:sectPr / w:tcPr.

import {schema,HEADING_SCALE,pageGeometry,safeFont,safeColor,safeSize} from '../core.js';

const PX_TO_HALF_POINT=1.5;   // 1px = 0.75pt, sizes are half-points
const PX_TO_TWIP=15;          // 1px = 1/96in = 1440/96 twips
const MM_TO_TWIP=1440/25.4;

export function escapeXML(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
function esc(value){return escapeXML(value);}
function attr(value){return escapeXML(value);}

const ALIGN_MAP={center:'center',end:'right',justify:'both'};
const HEADING_STYLE={1:'Heading1',2:'Heading2',3:'Heading3'};

function runProperties(marks,base){
  const properties=[];
  const textStyle=marks.find(m=>m.type===schema.marks.textStyle);
  const family=safeFont(textStyle?.attrs.fontFamily||base.font);
  properties.push(`<w:rFonts w:ascii="${attr(family)}" w:hAnsi="${attr(family)}" w:cs="${attr(family)}" w:eastAsia="${attr(family)}"/>`);
  const size=safeSize(textStyle?.attrs.fontSize)||base.size;
  const half=Math.round(size*PX_TO_HALF_POINT);
  properties.push(`<w:sz w:val="${half}"/><w:szCs w:val="${half}"/>`);
  if(marks.some(m=>m.type===schema.marks.strong))properties.push('<w:b/><w:bCs/>');
  if(marks.some(m=>m.type===schema.marks.em))properties.push('<w:i/><w:iCs/>');
  if(marks.some(m=>m.type===schema.marks.underline))properties.push('<w:u w:val="single"/>');
  const ink=marks.find(m=>m.type===schema.marks.ink);
  if(ink)properties.push(`<w:color w:val="${safeColor(ink.attrs.color).slice(1).toUpperCase()}"/>`);
  if(marks.some(m=>m.type===schema.marks.sup))properties.push('<w:vertAlign w:val="superscript"/>');
  if(marks.some(m=>m.type===schema.marks.sub))properties.push('<w:vertAlign w:val="subscript"/>');
  return `<w:rPr>${properties.join('')}</w:rPr>`;
}

function paragraphProperties(node,settings,context){
  const properties=[];
  if(node.type===schema.nodes.heading){
    const level=Math.min(3,Math.max(1,node.attrs.level||1));
    properties.push(`<w:pStyle w:val="${HEADING_STYLE[level]}"/>`);
    properties.push('<w:keepNext/>');
  }
  if(context.inList)properties.push('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  const justify=ALIGN_MAP[node.attrs.align];
  if(justify)properties.push(`<w:jc w:val="${justify}"/>`);
  const indent=Number(node.attrs.indent)||0;
  const firstLine=Number(node.attrs.firstLine)||0;
  if(indent||firstLine){
    const parts=[];
    // In tbLrV the block axis is horizontal, so the paragraph offset maps to w:left.
    if(indent)parts.push(`w:left="${Math.round(indent*settings.size*PX_TO_TWIP)}"`);
    if(firstLine)parts.push(`w:firstLine="${Math.round(firstLine*settings.size*PX_TO_TWIP)}"`);
    properties.push(`<w:ind ${parts.join(' ')}/>`);
  }
  const leading=Number(node.attrs.leading)||0;
  if(leading)properties.push(`<w:spacing w:line="${Math.round(leading*240)}" w:lineRule="auto"/>`);
  return properties.length?`<w:pPr>${properties.join('')}</w:pPr>`:'';
}

function textRun(text,marks,base){
  return `<w:r>${runProperties(marks,base)}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(node,settings,context){
  const base={font:settings.font,size:settings.size};
  const pPr=paragraphProperties(node,settings,context);
  const runs=[];
  node.forEach(child=>{
    if(child.isText)runs.push(textRun(child.text,child.marks,base));
    else if(child.type===schema.nodes.hard_break)runs.push(`<w:r>${runProperties([],base)}<w:br/></w:r>`);
  });
  return `<w:p>${pPr}${runs.join('')}</w:p>`;
}

function blockXML(node,settings,context){
  if(node.type===schema.nodes.paragraph||node.type===schema.nodes.heading){
    return paragraph(node,settings,context);
  }
  if(node.type===schema.nodes.bullet_list){
    const out=[];
    node.forEach(item=>{
      item.forEach(child=>{
        if(child.type===schema.nodes.paragraph||child.type===schema.nodes.heading){
          out.push(paragraph(child,settings,{...context,inList:true}));
        }else{
          out.push(blockXML(child,settings,{...context,inList:true}));
        }
      });
    });
    return out.join('');
  }
  return '';
}

export function documentBody(doc,settings){
  const out=[];
  doc.forEach(node=>out.push(blockXML(node,settings,{})));
  return out.join('');
}

export function sectionProperties(settings,{vertical=true}={}){
  const geometry=pageGeometry(settings.page);
  const landscape=geometry.widthMm>geometry.heightMm;
  const margins=settings.page.margins;
  const parts=[
    `<w:pgSz w:w="${Math.round(geometry.widthMm*MM_TO_TWIP)}" w:h="${Math.round(geometry.heightMm*MM_TO_TWIP)}"${landscape?' w:orient="landscape"':''}/>`,
    `<w:pgMar w:top="${Math.round(margins.top*MM_TO_TWIP)}" w:right="${Math.round(margins.right*MM_TO_TWIP)}" w:bottom="${Math.round(margins.bottom*MM_TO_TWIP)}" w:left="${Math.round(margins.left*MM_TO_TWIP)}" w:header="720" w:footer="720" w:gutter="0"/>`
  ];
  if(vertical)parts.push('<w:textDirection w:val="tbLrV"/>');
  parts.push(`<w:docGrid w:linePitch="${Math.round(settings.size*settings.leading*PX_TO_TWIP)}"/>`);
  return `<w:sectPr>${parts.join('')}</w:sectPr>`;
}

export function documentXML(doc,settings,options={}){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" `+
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`+
    `<w:body>${documentBody(doc,settings)}${sectionProperties(settings,options)}</w:body></w:document>`;
}

export function stylesXML(settings){
  const base=Math.round(settings.size*PX_TO_HALF_POINT);
  const family=safeFont(settings.font);
  const heading=(level)=>{
    const size=Math.round(settings.size*HEADING_SCALE[level]*PX_TO_HALF_POINT);
    return `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/>`+
      `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>`+
      `<w:pPr><w:outlineLvl w:val="${level-1}"/></w:pPr>`+
      `<w:rPr><w:rFonts w:ascii="${attr(family)}" w:hAnsi="${attr(family)}" w:cs="${attr(family)}"/>`+
      `<w:b/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:style>`;
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${attr(family)}" w:hAnsi="${attr(family)}" w:cs="${attr(family)}"/>`+
    `<w:sz w:val="${base}"/><w:szCs w:val="${base}"/></w:rPr></w:rPrDefault></w:docDefaults>`+
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>`+
    heading(1)+heading(2)+heading(3)+`</w:styles>`;
}

export function settingsXML(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
    `<w:zoom w:percent="100"/><w:defaultTabStop w:val="420"/>`+
    `<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>`+
    `</w:settings>`;
}

export function numberingXML(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>`+
    `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/>`+
    `<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="420" w:hanging="210"/></w:pPr>`+
    `<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>`+
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
}

export function fontTableXML(settings){
  const family=safeFont(settings.font);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`+
    `<w:font w:name="${attr(family)}"><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font>`+
    `<w:font w:name="Noto Sans Mongolian"><w:family w:val="auto"/><w:pitch w:val="variable"/></w:font>`+
    `</w:fonts>`;
}

export function contentTypesXML(){
  const override=(part,type)=>`<Override PartName="${part}" ContentType="${type}"/>`;
  const w='application/vnd.openxmlformats-officedocument.wordprocessingml';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`+
    `<Default Extension="xml" ContentType="application/xml"/>`+
    override('/word/document.xml',`${w}.document.main+xml`)+
    override('/word/styles.xml',`${w}.styles+xml`)+
    override('/word/settings.xml',`${w}.settings+xml`)+
    override('/word/numbering.xml',`${w}.numbering+xml`)+
    override('/word/fontTable.xml',`${w}.fontTable+xml`)+
    override('/docProps/core.xml','application/vnd.openxmlformats-package.core-properties+xml')+
    override('/docProps/app.xml','application/vnd.openxmlformats-officedocument.extended-properties+xml')+
    `</Types>`;
}

export function rootRelsXML(){
  const base='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const pkg='http://schemas.openxmlformats.org/package/2006/relationships';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<Relationships xmlns="${pkg}">`+
    `<Relationship Id="rId1" Type="${base}/officeDocument" Target="word/document.xml"/>`+
    `<Relationship Id="rId2" Type="${pkg}/metadata/core-properties" Target="docProps/core.xml"/>`+
    `<Relationship Id="rId3" Type="${base}/extended-properties" Target="docProps/app.xml"/>`+
    `</Relationships>`;
}

export function documentRelsXML(){
  const base='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
    `<Relationship Id="rId1" Type="${base}/styles" Target="styles.xml"/>`+
    `<Relationship Id="rId2" Type="${base}/settings" Target="settings.xml"/>`+
    `<Relationship Id="rId3" Type="${base}/numbering" Target="numbering.xml"/>`+
    `<Relationship Id="rId4" Type="${base}/fontTable" Target="fontTable.xml"/>`+
    `</Relationships>`;
}

export function corePropsXML({title='',author='Mori'}={}){
  const stamp=new Date().toISOString().replace(/\.\d+Z$/,'Z');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" `+
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" `+
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`+
    `<dc:title>${esc(title)}</dc:title><dc:creator>${esc(author)}</dc:creator>`+
    `<cp:lastModifiedBy>${esc(author)}</cp:lastModifiedBy>`+
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>`+
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>`+
    `</cp:coreProperties>`;
}

export function appPropsXML(){
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n`+
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" `+
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">`+
    `<Application>Mori baosao</Application><AppVersion>0.3</AppVersion>`+
    `</Properties>`;
}
