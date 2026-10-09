import { httpsUrl, digest } from './normalize';

export async function download(url:string,hosts:string[],limit:number,types:string[],request:typeof fetch=fetch):Promise<Uint8Array> {
  let current=httpsUrl(url,hosts);
  const signal=AbortSignal.timeout(20000);
  for(let redirects=0;redirects<=3;redirects++) {
    const response=await request(current,{redirect:'manual',signal,headers:{Accept:types.join(', '),'User-Agent':'Riftbound-Collection-Hub-Catalog/1'}});
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel();const location=response.headers.get('location');
      if (!location || redirects===3) throw new Error('Catalog redirect limit reached.');
      current=httpsUrl(new URL(location,current).href,hosts);continue;
    }
    if (!response.ok) {await response.body?.cancel();throw new Error('Catalog resource download failed.');}
    const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!type || !types.includes(type) || Number(response.headers.get('content-length')??0)>limit) {await response.body?.cancel();throw new Error('Resource type or size is not allowed.');}
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty resource body.');
    const chunks:Uint8Array[]=[];let length=0;
    try {
      while(true) {const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit)throw new Error('Resource exceeds size limit.');chunks.push(value);}
    } finally {await reader.cancel();}
    if(!length)throw new Error('Empty resource body.');
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return bytes;
  }
  throw new Error('Catalog redirect failed.');
}
export function imageInfo(bytes:Uint8Array):{width:number;height:number;checksum:string} {
  const b=Buffer.from(bytes);let width=0,height=0;
  if (b.length>=24 && b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16)==='IHDR') {
    width=b.readUInt32BE(16);height=b.readUInt32BE(20);
  } else if (b.length>=4 && b[0]===255 && b[1]===216) {
    let p=2;
    while(p+4<=b.length){if(b[p++]!==255)break;while(b[p]===255)p++;const marker=b[p++];
      if(marker===0xd9 || marker===0xda)break;if(marker===0x01 || (marker>=0xd0 && marker<=0xd7))continue;
      if(p+2>b.length)break;const size=b.readUInt16BE(p);if(size<2 || p+size>b.length)break;
      if([0xc0,0xc1,0xc2].includes(marker) && size>=7){height=b.readUInt16BE(p+3);width=b.readUInt16BE(p+5);break;}p+=size;
    }
  } else if(b.length>=30 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') {
    const kind=b.toString('ascii',12,16);
    if(kind==='VP8X'){width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
    else if(kind==='VP8 ' && b[23]===0x9d && b[24]===0x01 && b[25]===0x2a){width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;}
  }
  if(!width || !height || width>12000 || height>12000 || width*height>50000000)throw new Error('Unsupported image encoding or dimensions.');
  return {width,height,checksum:digest(bytes)};
}
