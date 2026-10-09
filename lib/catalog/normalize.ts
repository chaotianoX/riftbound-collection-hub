import { createHash } from 'node:crypto';

export const repository = 'LouisCourrian/riftbound-cards';
export const sourceUrl = `https://github.com/${repository}`;
export type Treatment = 'nonfoil' | 'foil' | 'special';
export type Review = {
  sets: { code:string; name:string; order:number; releasedOn:string|null }[];
  canonical?: Record<string,string>;
  printings?: Record<string,{ treatment:Treatment; variant:'standard'|'alternate'|'special'|'promo'; reference:string }>;
  images?: { reference:string; hosts:string[] } | null;
  provingGrounds?: { sourceUrl:string; version:string; checksum:string; complete:boolean; contents:{ cardCode:string; quantity:number|null; treatment:Treatment }[] } | null;
};
export type Candidate = {
  key:string; canonicalKey:string; setCode:string; number:string; name:string; type:string|null;
  domains:string[]; rarity:string|null; treatment:Treatment; category:'Normal'|'Legend'|'Battlefield'|null;
  attributes:Record<string,unknown>; printedText:string|null; imageUrl:string|null; previewed:boolean;
};
export type ImportPlan = { sets:Review['sets']; cards:Candidate[]; excluded:{key:string;reason:string}[]; unresolved:{key:string;reason:string}[]; counts:Record<string,number>; inputCount:number };
function object(v:unknown):Record<string,unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Expected a JSON object.');
  return v as Record<string,unknown>;
}
function text(v:unknown, required=false):string|null {
  if (v == null && !required) return null;
  if (typeof v !== 'string' || !v.trim() || v.length > 20000 || /\u0000/.test(v)) throw new Error('Invalid catalog string.');
  return v.trim();
}
function list(v:unknown):string[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length>40) throw new Error('Invalid catalog array.');
  return [...new Set(v.map(x=>text(x,true)!))];
}
export function digest(bytes:Uint8Array|string):string { return createHash('sha256').update(bytes).digest('hex'); }
// Stable source IDs, never display names. Cross-set equivalence requires an
// explicit reviewed mapping; imports cannot silently merge existing identities.
export function stableId(kind:string,key:string):string {
  const h=digest(`riftbound-collection-hub:${repository}:${kind}:${key}`).slice(0,32).split('');
  h[12]='5'; h[16]=((parseInt(h[16],16)&3)|8).toString(16);
  const s=h.join(''); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export function httpsUrl(value:string,hosts?:string[]):URL {
  const u=new URL(value);
  if (u.protocol!=='https:' || u.username || u.password || (u.port && u.port!=='443') || (hosts && !hosts.includes(u.hostname))) throw new Error('URL is outside the reviewed HTTPS allowlist.');
  return u;
}
export function validateReview(value:unknown):Review {
  const v=object(value);
  if (!Array.isArray(v.sets) || !v.sets.length) throw new Error('An explicit set sequence is required.');
  const sets=v.sets.map(s=>{
    const row=object(s);const code=text(row.code,true)!;
    if (!/^[A-Z0-9]{2,12}$/.test(code) || typeof row.order!=='number' || !Number.isSafeInteger(row.order) || row.order<0) throw new Error('Invalid set code/order.');
    const date=text(row.releasedOn);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10)!==date)) throw new Error('Invalid release date.');
    return {code,name:text(row.name,true)!,order:row.order,releasedOn:date};
  });
  if (new Set(sets.map(s=>s.code)).size!==sets.length || new Set(sets.map(s=>s.order)).size!==sets.length) throw new Error('Set codes and positions must be unique.');
  const ogn=sets.find(s=>s.code==='OGN'),sfd=sets.find(s=>s.code==='SFD');
  if (ogn && sfd && ogn.order>=sfd.order) throw new Error('OGN must precede SFD.');
  const result:Review={sets};
  if (v.canonical!=null) result.canonical=Object.fromEntries(Object.entries(object(v.canonical)).map(([k,id])=>[k,text(id,true)!]));
  if (v.printings!=null) {
    result.printings={};
    for (const [key,x] of Object.entries(object(v.printings))) {
      const p=object(x); if (!['nonfoil','foil','special'].includes(String(p.treatment)) || !['standard','alternate','special','promo'].includes(String(p.variant))) throw new Error('Invalid printing review.');
      const reference=text(p.reference,true)!;httpsUrl(reference);
      result.printings[key]={treatment:p.treatment as Treatment,variant:p.variant as 'standard'|'alternate'|'special'|'promo',reference};
    }
  }
  if (v.images!=null) {
    const i=object(v.images);const reference=text(i.reference,true)!;httpsUrl(reference);
    const hosts=list(i.hosts);
    // Exact public artwork hosts only; a license reference never grants arbitrary network access.
    if (!hosts.length || hosts.some(h=>!['cmsassets.rgpub.io','ddragon.leagueoflegends.com'].includes(h))) throw new Error('Unsupported artwork host.');
    result.images={reference,hosts};
  }
  if (v.provingGrounds!=null) {
    const p=object(v.provingGrounds);const url=text(p.sourceUrl,true)!;httpsUrl(url,['playriftbound.com','riftbound.leagueoflegends.com']);
    if (p.complete!==true || !Array.isArray(p.contents) || !p.contents.length || !/^[a-f0-9]{64}$/.test(String(p.checksum))) throw new Error('A complete reviewed official Proving Grounds checklist and SHA-256 are required.');
    const contents=p.contents.map(x=>{const c=object(x);const quantity=c.quantity;
      if (quantity!==null && (typeof quantity!=='number' || !Number.isSafeInteger(quantity) || quantity<=0)) throw new Error('Invalid published quantity.');
      if (!['nonfoil','foil','special'].includes(String(c.treatment))) throw new Error('Missing official product treatment.');
      return {cardCode:text(c.cardCode,true)!,quantity,treatment:c.treatment as Treatment};
    });
    if (new Set(contents.map(c=>c.cardCode)).size!==contents.length) throw new Error('Duplicate checklist entry.');
    result.provingGrounds={sourceUrl:url,version:text(p.version,true)!,checksum:String(p.checksum),complete:true,contents};
  }
  return result;
}
function rarityVariant(rarity:unknown,number:string):string|null {
  if (/-star-/.test(number) || number.includes('*')) return 'Signed printing';
  if (['Showcase','Ultimate','Promo'].includes(String(rarity))) return 'Showcase, ultimate or promo printing';
  if (/^[rt]\d+[a-z]+$/i.test(number)) return 'Alternate accessory art';
  return null;
}
export function buildPlan(input:unknown,review:Review,today=new Date().toISOString().slice(0,10)):ImportPlan {
  if (!Array.isArray(input) || !input.length || input.length>20000) throw new Error('Expected a nonempty cards.json array (maximum 20,000 records).');
  const plan:ImportPlan={sets:[],cards:[],excluded:[],unresolved:[],counts:{},inputCount:input.length};
  const keys=new Set<string>();const pg=new Map(review.provingGrounds?.contents.map(c=>[c.cardCode,c]));
  for (const raw of input) {
    const r=object(raw);const key=text(r.cardCode,true)!;const code=text(r.setCode,true)!.toUpperCase();const number=text(r.cardNumber,true)!;
    if (keys.has(key)) throw new Error(`Duplicate cardCode: ${key}`);keys.add(key);
    if (key!==`${code.toLowerCase()}-${number.toLowerCase()}`) throw new Error(`Inconsistent cardCode: ${key}`);
    const set=review.sets.find(s=>s.code===code);
    if (!set) {plan.unresolved.push({key,reason:`Set ${code} requires an explicit sequence and release review`});continue;}
    if (!plan.sets.some(s=>s.code===code)) plan.sets.push(set);
    const override=review.printings?.[key];const member=pg.get(key);
    const parsed=/^(\d+)([a-z*]*)(?:-(\d+))?$/i.exec(number);
    const accessory=/^[rt]\d+$/i.test(number);
    let reason:string|null=rarityVariant(r.rarity,number);
    if (parsed?.[2]) reason=parsed[2].includes('*')?'Signed printing':'Alternate art or special suffix';
    else if (parsed?.[3] && Number(parsed[1])>Number(parsed[3])) reason='Overnumbered printing';
    else if (override && override.variant!=='standard') reason=`Reviewed ${override.variant} printing`;
    if (reason && !member) {plan.excluded.push({key,reason});continue;}
    if (!parsed && !accessory && !override && !member) {plan.unresolved.push({key,reason:'Nonstandard collector number requires printing review (starter/promo/token)'});continue;}
    if (parsed && !parsed[3] && !override && !member) {plan.unresolved.push({key,reason:'Number without published denominator requires printing review'});continue;}
    const rarity=text(r.rarity);const inferred=rarity==='Common'||rarity==='Uncommon'?'nonfoil':rarity==='Rare'||rarity==='Epic'?'foil':null;
    const treatment=member?.treatment??override?.treatment??inferred;
    if (!treatment) {plan.unresolved.push({key,reason:'Unknown rarity/treatment'});continue;}
    if (!member && (override?.variant==='special' || treatment!==inferred)) {plan.excluded.push({key,reason:'Outside standard rarity/treatment policy'});continue;}
    if (code==='OGS' && !member) {plan.unresolved.push({key,reason:'Proving Grounds treatment requires complete official checklist; rarity inference is forbidden'});continue;}
    const labels=list(r.cardTypeLabels);let type=text(r.cardType)??labels[0]??null;
    if (type==='Unit' && labels.includes('Champion')) type='Champion Unit';
    const attributes:Record<string,unknown>={labels,tags:list(r.tags),artist:text(r.artist),source_card_code:key,source_card_id:text(r.sourceCardId),source_url:text(r.sourceUrl),identity_scope:review.canonical?.[key]?'reviewed':'edition-unresolved',errata_unverified:!!r.hasErrata};
    for (const attr of ['energy','power','might']) {
      const value=r[attr];if (value!=null && (typeof value!=='number' || !Number.isSafeInteger(value) || value<0)) throw new Error(`Invalid ${attr}: ${key}`);
      attributes[attr]=value??null;
    }
    attributes.cost=attributes.energy;
    // Community manual errata overrides are retained as reference, never official rules.
    attributes.community_corrected_text=text(r.abilityCorrected);
    const name=text(r.fullName)??[text(r.name,true),text(r.subtitle)].filter(Boolean).join(', ');
    plan.cards.push({key,canonicalKey:review.canonical?.[key]??`edition:${key}`,setCode:code,number,name,type,domains:list(r.domains??(r.domain?[r.domain]:[])),rarity,treatment,category:accessory?null:type==='Legend'?'Legend':type==='Battlefield'?'Battlefield':['Unit','Champion Unit','Spell','Gear'].includes(type??'')?'Normal':null,attributes,printedText:text(r.abilityOriginal),imageUrl:text(r.imageUrl),previewed:!set.releasedOn || set.releasedOn>today});
    plan.counts[code]=(plan.counts[code]??0)+1;
  }
  for (const key of pg.keys()) if (!plan.cards.some(c=>c.key===key)) throw new Error(`Official checklist entry missing from snapshot: ${key}`);
  // Prevent one reviewed playable ID from collapsing two base editions in a set.
  const editions=new Set<string>();
  for (const c of plan.cards) {const key=`${c.canonicalKey}/${c.setCode}`;if(editions.has(key))throw new Error('Multiple base editions share a canonical identity in the same set.');editions.add(key);}
  plan.sets.sort((a,b)=>a.order-b.order);return plan;
}
