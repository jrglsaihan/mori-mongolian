// baosao / zip — minimal ZIP writer.
//
// DOCX is a ZIP container. STORED (uncompressed) entries are valid and universally
// accepted, so the writer always works with zero dependencies. When the host provides
// CompressionStream('deflate-raw') — WebKit has implemented it since macOS 13.3 — entries
// are deflated instead, which keeps files close to what other producers emit.

const CRC_TABLE=(()=>{
  const table=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;
    table[n]=c>>>0;
  }
  return table;
})();

export function crc32(bytes){
  let crc=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++)crc=CRC_TABLE[(crc^bytes[i])&0xFF]^(crc>>>8);
  return (crc^0xFFFFFFFF)>>>0;
}

const encoder=new TextEncoder();
export function utf8(text){return encoder.encode(text);}

// Fixed DOS timestamp so the same document always produces byte-identical output.
const DOS_TIME=0;
const DOS_DATE=((2026-1980)<<9)|(1<<5)|1;

function hasDeflate(){
  return typeof CompressionStream==='function';
}
async function deflateRaw(bytes){
  const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16(view,offset,value){view.setUint16(offset,value,true);}
function u32(view,offset,value){view.setUint32(offset,value>>>0,true);}

function localHeader(name,method,crc,compressedSize,size){
  const nameBytes=utf8(name);
  const buffer=new Uint8Array(30+nameBytes.length);
  const view=new DataView(buffer.buffer);
  u32(view,0,0x04034b50);
  u16(view,4,20);
  u16(view,6,0x0800); // UTF-8 names
  u16(view,8,method);
  u16(view,10,DOS_TIME);
  u16(view,12,DOS_DATE);
  u32(view,14,crc);
  u32(view,18,compressedSize);
  u32(view,22,size);
  u16(view,26,nameBytes.length);
  u16(view,28,0);
  buffer.set(nameBytes,30);
  return buffer;
}

function centralHeader(name,method,crc,compressedSize,size,offset){
  const nameBytes=utf8(name);
  const buffer=new Uint8Array(46+nameBytes.length);
  const view=new DataView(buffer.buffer);
  u32(view,0,0x02014b50);
  u16(view,4,20);
  u16(view,6,20);
  u16(view,8,0x0800);
  u16(view,10,method);
  u16(view,12,DOS_TIME);
  u16(view,14,DOS_DATE);
  u32(view,16,crc);
  u32(view,20,compressedSize);
  u32(view,24,size);
  u16(view,28,nameBytes.length);
  u16(view,30,0);
  u16(view,32,0);
  u16(view,34,0);
  u16(view,36,0);
  u32(view,38,0);
  u32(view,42,offset);
  buffer.set(nameBytes,46);
  return buffer;
}

function endOfCentralDirectory(count,size,offset){
  const buffer=new Uint8Array(22);
  const view=new DataView(buffer.buffer);
  u32(view,0,0x06054b50);
  u16(view,4,0);
  u16(view,6,0);
  u16(view,8,count);
  u16(view,10,count);
  u32(view,12,size);
  u32(view,16,offset);
  u16(view,20,0);
  return buffer;
}

/**
 * Build a ZIP archive. `entries` is an array of {name, data} where data is a string or
 * Uint8Array. `[Content_Types].xml` is written first, which some consumers expect.
 */
export async function createZip(entries,{compress=true}={}){
  const useDeflate=compress&&hasDeflate();
  const parts=[];
  const central=[];
  let offset=0;
  for(const entry of entries){
    const raw=typeof entry.data==='string'?utf8(entry.data):entry.data;
    const crc=crc32(raw);
    let method=0;
    let payload=raw;
    if(useDeflate&&raw.length>64){
      try{
        const deflated=await deflateRaw(raw);
        if(deflated.length<raw.length){payload=deflated;method=8;}
      }catch{/* fall back to STORED */}
    }
    const header=localHeader(entry.name,method,crc,payload.length,raw.length);
    parts.push(header,payload);
    central.push(centralHeader(entry.name,method,crc,payload.length,raw.length,offset));
    offset+=header.length+payload.length;
  }
  const centralSize=central.reduce((n,part)=>n+part.length,0);
  parts.push(...central,endOfCentralDirectory(central.length,centralSize,offset));
  const total=parts.reduce((n,part)=>n+part.length,0);
  const out=new Uint8Array(total);
  let cursor=0;
  for(const part of parts){out.set(part,cursor);cursor+=part.length;}
  return out;
}

export function zipMethod(){return hasDeflate()?'deflate-raw':'stored';}

/** Read the central directory back. Used to verify output without an external reader. */
export function readZip(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  const floor=Math.max(0,bytes.length-22-65536);
  for(let i=bytes.length-22;i>=floor;i--){
    if(bytes[i]===0x50&&bytes[i+1]===0x4b&&bytes[i+2]===0x05&&bytes[i+3]===0x06){eocd=i;break;}
  }
  if(eocd<0)throw new Error('ZIP：找不到中央目录结尾记录');
  const count=view.getUint16(eocd+10,true);
  const centralSize=view.getUint32(eocd+12,true);
  const centralOffset=view.getUint32(eocd+16,true);
  const entries=[];
  let cursor=centralOffset;
  for(let index=0;index<count;index++){
    if(view.getUint32(cursor,true)!==0x02014b50)throw new Error('ZIP：中央目录项签名错误');
    const method=view.getUint16(cursor+10,true);
    const crc=view.getUint32(cursor+16,true);
    const compressedSize=view.getUint32(cursor+20,true);
    const size=view.getUint32(cursor+24,true);
    const nameLength=view.getUint16(cursor+28,true);
    const extraLength=view.getUint16(cursor+30,true);
    const commentLength=view.getUint16(cursor+32,true);
    const localOffset=view.getUint32(cursor+42,true);
    const name=new TextDecoder().decode(bytes.subarray(cursor+46,cursor+46+nameLength));
    if(view.getUint32(localOffset,true)!==0x04034b50)throw new Error('ZIP：本地文件头签名错误：'+name);
    const localNameLength=view.getUint16(localOffset+26,true);
    const localExtraLength=view.getUint16(localOffset+28,true);
    const dataStart=localOffset+30+localNameLength+localExtraLength;
    entries.push({name,method,crc,size,compressedSize,offset:dataStart,
      data:bytes.subarray(dataStart,dataStart+compressedSize)});
    cursor+=46+nameLength+extraLength+commentLength;
  }
  return {entries,count,centralSize,centralOffset};
}

export async function readZipEntryText(bytes,entry){
  if(entry.method===0)return new TextDecoder().decode(entry.data);
  if(entry.method!==8)throw new Error('ZIP：不支持的压缩方法 '+entry.method);
  if(typeof DecompressionStream!=='function')throw new Error('ZIP：此环境不支持解压校验');
  const stream=new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

