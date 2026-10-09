import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, validateReview, digest, stableId, httpsUrl } from '../lib/catalog/normalize';
import { download, imageInfo } from '../lib/catalog/download';

const review=validateReview({sets:[{code:'OGN',name:'Test Origins',order:10,releasedOn:'2025-10-31'},{code:'OGS',name:'Test supplement',order:15,releasedOn:'2025-10-31'},{code:'RAD',name:'Test Radiance',order:50,releasedOn:'2026-10-23'}]});
function card(number='001-298',extra:Record<string,unknown>={}) {return {cardCode:`ogn-${number}`,setCode:'ogn',cardNumber:number,name:'TEST ONLY',rarity:'Common',cardType:'Unit',domains:['Fury','Chaos'],energy:2,abilityOriginal:'Test original',...extra};}
function fake(body:string|Uint8Array,headers:Record<string,string>={'content-type':'application/json'}):typeof fetch {return async()=>new Response(body as BodyInit,{headers});}

test('catalog: rarity policy uses standard nonfoil Common/Uncommon and foil Rare/Epic',()=>{
  const plan=buildPlan(['Common','Uncommon','Rare','Epic'].map((rarity,i)=>card(`00${i+1}-298`,{rarity})),review);
  assert.deepEqual(plan.cards.map(c=>c.treatment),['nonfoil','nonfoil','foil','foil']);assert.equal(plan.cards.length,4);
});
test('catalog: alt art, overnumbered, signed star, showcase and special accessories excluded',()=>{
  const plan=buildPlan([card(),card('001a-298'),card('299-298'),card('299-star-298',{rarity:'Rare'}),card('sp1-005',{rarity:'Showcase'}),card('r01a',{cardType:'Rune'})],review);
  assert.equal(plan.cards.length,1);assert.equal(plan.excluded.length,5);assert.equal(plan.unresolved.length,0);
  assert.equal(buildPlan([card('299-298',{rarity:'Ultimate'})],review).cards.length,0);
});
test('catalog: numeric denominators are per record, never OGN=298 restrictions for future sets',()=>{
  const c=card('400-500');assert.equal(buildPlan([c],review).cards.length,1);
  assert.equal(buildPlan([card('400')],review).unresolved.length,1);
});
test('catalog: all known sets included and Radiance is previewed before release',()=>{
  const rad=card('001-167',{cardCode:'rad-001-167',setCode:'rad'});
  assert.equal(buildPlan([rad,card()],review,'2026-10-08').cards[0].previewed,true);
  assert.equal(buildPlan([rad],review,'2026-10-23').cards[0].previewed,false);
  const unknown=card('001-200',{cardCode:'new-001-200',setCode:'new'});
  assert.match(buildPlan([unknown],review).unresolved[0].reason,/explicit sequence/);
});
test('catalog: rune/token records retained without inventing masterset targets',()=>{
  const plan=buildPlan([card('r01',{cardType:'Rune'}),card('t01',{cardType:'Unit'})],review);
  assert.deepEqual(plan.cards.map(c=>c.category),[null,null]);assert.equal(plan.cards[0].type,'Rune');
});
test('catalog: Champions retain labels, multi-domains and energy cost',()=>{
  const c=buildPlan([card('001-298',{cardTypeLabels:['Unit','Champion']})],review).cards[0];
  assert.equal(c.type,'Champion Unit');assert.deepEqual(c.domains,['Fury','Chaos']);assert.equal(c.attributes.cost,2);
  assert.equal(buildPlan([card('001-298',{energy:null,power:null,might:null,cardType:null})],review).cards[0].attributes.cost,null);
});
test('catalog: community errata are reference metadata and never overwrite original text',()=>{
  const c=buildPlan([card('001-298',{hasErrata:true,abilityCorrected:'Community correction',abilityEffective:'Community correction'})],review).cards[0];
  assert.equal(c.printedText,'Test original');assert.equal(c.attributes.errata_unverified,true);
});
test('catalog: canonical identity uses stable IDs, not names or automatic reprint equivalence',()=>{
  const records=[card(),card('002-298')];const p=buildPlan(records,review);
  assert.notEqual(p.cards[0].canonicalKey,p.cards[1].canonicalKey);
  assert.equal(stableId('printing',records[0].cardCode),stableId('printing',records[0].cardCode));
  assert.notEqual(stableId('card',p.cards[0].canonicalKey),stableId('printing',records[0].cardCode));
  const shared={...review,canonical:{'ogn-001-298':'official-reviewed-id','ogn-002-298':'official-reviewed-id'}};
  assert.throws(()=>buildPlan(records,shared),/Multiple base/);
});
test('catalog: OGS is not a fabricated complete box and its treatment cannot be inferred',()=>{
  const c=card('001-024',{cardCode:'ogs-001-024',setCode:'ogs',rarity:'Epic'});
  const plan=buildPlan([c],review);assert.equal(plan.cards.length,0);assert.match(plan.unresolved[0].reason,/checklist/);
  const verified=validateReview({...review,provingGrounds:{sourceUrl:'https://playriftbound.com/en-us/test-only-checklist',version:'TEST ONLY',checksum:'a'.repeat(64),complete:true,contents:[{cardCode:c.cardCode,quantity:2,treatment:'nonfoil'}]}});
  const p=buildPlan([c],verified);assert.equal(p.cards[0].treatment,'nonfoil');assert.equal(p.cards.length,1);
  assert.throws(()=>buildPlan([card()],verified),/missing from snapshot/);
  assert.throws(()=>validateReview({...review,provingGrounds:{...verified.provingGrounds,complete:false}}),/complete/);
});
test('catalog: rejects duplicate, malformed schemas and bad costs rather than publishing invented metadata',()=>{
  assert.throws(()=>buildPlan([card(),card()],review),/Duplicate/);
  assert.throws(()=>buildPlan([card('001-298',{energy:1.5})],review),/energy/);
  assert.throws(()=>buildPlan([card('001-298',{domains:'Fury'})],review),/array/);
  assert.throws(()=>buildPlan([card('001-298',{cardCode:'ogn-not-001'})],review),/Inconsistent/);
  assert.throws(()=>buildPlan([],review),/nonempty/);
  assert.throws(()=>validateReview({sets:[{code:'SFD',name:'X',order:1,releasedOn:null},{code:'OGN',name:'Y',order:2,releasedOn:null}]}),/precede/);
});
test('catalog: explicit nonstandard treatment cannot bypass collection eligibility',()=>{
  const r=validateReview({...review,printings:{'ogn-001-298':{variant:'standard',treatment:'foil',reference:'https://playriftbound.com/en-us/test-only'}}});
  assert.equal(buildPlan([card()],r).excluded.length,1);
});
test('catalog: artwork allowlist refuses IPs, userinfo, HTTP, ports and unreviewed hosts',()=>{
  for(const url of ['http://cmsassets.rgpub.io/a.png','https://u:p@cmsassets.rgpub.io/a.png','https://cmsassets.rgpub.io:444/a.png','https://127.0.0.1/a','https://cmsassets.rgpub.io.evil.invalid/a'])assert.throws(()=>httpsUrl(url,['cmsassets.rgpub.io']));
  assert.throws(()=>validateReview({...review,images:{reference:'https://example.invalid/license',hosts:['127.0.0.1']}}),/host/);
});
test('catalog: download validates redirects, response types, streamed size and server failures',async()=>{
  await assert.rejects(download('https://github.com/test',['github.com'],50,['application/json'],async()=>new Response(null,{status:302,headers:{location:'http://127.0.0.1'}})),/allowlist/);
  await assert.rejects(download('https://github.com/test',['github.com'],50,['application/json'],async()=>new Response(null,{status:302,headers:{location:'/loop'}})),/redirect limit/);
  await assert.rejects(download('https://github.com/test',['github.com'],5,['application/json'],fake('TOO LARGE')),/size/);
  await assert.rejects(download('https://github.com/test',['github.com'],50,['application/json'],fake('html',{'content-type':'text/html'})),/type/);
  await assert.rejects(download('https://github.com/test',['github.com'],50,['application/json'],async()=>new Response(null,{status:503})),/failed/);
  assert.equal(new TextDecoder().decode(await download('https://github.com/test',['github.com'],50,['application/json'],fake('[]'))),'[]');
});
test('catalog: artwork dimensions and checksum require image bytes, not a URL filename',()=>{
  const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(744,16);b.writeUInt32BE(1039,20);
  assert.deepEqual(imageInfo(b),{width:744,height:1039,checksum:digest(b)});
  assert.throws(()=>imageInfo(Buffer.from('<html>not an image</html>')),/image/);
  b.writeUInt32BE(0,16);assert.throws(()=>imageInfo(b),/dimensions/);
});
