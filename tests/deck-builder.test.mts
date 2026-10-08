import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accepts, addPayload, costOf, initialLibraryFilters, libraryRows, orderedLines } from '../lib/domain/deck-builder';
import { deckSummary, type Snapshot } from '../lib/domain/workspace';
const fixture = ():Snapshot => ({
  cards:[{id:'card',name:'TEST Unit',card_type:'Unit',domains:['Mind'],attributes:{cost:2}},{id:'legend',name:'TEST Legend',card_type:'Legend',domains:['Mind']}],
  printings:[{id:'print',card_id:'card',name:'TEST Unit',card_type:'Unit',domains:['Mind'],set_id:'set',set_code:'OGN',sort_order:1,card_number:'002',rarity:'Rare',treatment:'foil',language:'en',variant:'standard',eligible:true,eligibility_basis:'TEST',collection_category:'Normal',printed_text:null,is_fixture:true,source_url:'https://example.invalid',source_version:'TEST'}],
  sets:[{id:'set',code:'OGN',name:'TEST ONLY',sort_order:1}],images:[],products:[],contents:[],sources:[],wishlist:[],preferences:null,
  inventory:[],allocations:[],decks:[{id:'deck',name:'TEST deck',mode:'theorycraft',format:null,legality_status:'Unverified'}],lines:[],
});
test('library drop adds one exact printing and an existing line increments without mutating inventory',()=>{
  const s=fixture();const before=JSON.stringify(s);
  assert.deepEqual(addPayload(s,'deck','print','main'),{deck_id:'deck',card_id:'card',section:'main',quantity:1,printing_id:'print'});
  assert.equal(JSON.stringify(s),before);
  s.lines=[{id:'line',deck_id:'deck',card_id:'card',section:'main',quantity:2,preferred_printing_id:'print'}];
  assert.equal(addPayload(s,'deck','print','main').quantity,3);
  assert.deepEqual(s.inventory,[]);assert.deepEqual(s.allocations,[]);
});
test('invalid destinations, unknown types, ineligible and conflicting printings are rejected',()=>{
  const s=fixture();assert.throws(()=>addPayload(s,'deck','print','legend'),/category/);
  assert.equal(accepts(null,'main'),false);assert.equal(accepts('Unknown','runes'),false);
  assert.equal(accepts('Champion','champion'),true);assert.equal(accepts('Champion','main'),true);
  s.lines=[{id:'line',deck_id:'deck',card_id:'card',section:'main',quantity:1,preferred_printing_id:null}];
  assert.throws(()=>addPayload(s,'deck','print','main'),/unresolved printing/);
  s.printings[0].eligible=false;assert.throws(()=>addPayload(s,'deck','print','main'));
});
test('search name/number, set, domain, rarity, cost, category and independent ownership filters',()=>{
  const s=fixture();const filter=(change:Partial<typeof initialLibraryFilters>)=>libraryRows(s,{...initialLibraryFilters,...change});
  for(const change of [{query:'002'},{query:'test unit'},{set:'set'},{domain:'Mind'},{rarity:'Rare'},{cost:'2'},{category:'main' as const}]) assert.equal(filter(change).length,1);
  for(const change of [{query:'003'},{set:'other'},{domain:'Fury'},{cost:'unknown'},{category:'legend' as const},{owned:true},{available:true}]) assert.equal(filter(change).length,0);
  s.inventory=[{id:'entry',printing_id:'print',owned:2,reserved:2,available:0}];
  assert.equal(filter({owned:true}).length,1);assert.equal(filter({available:true}).length,0);
  assert.equal(costOf(s,'legend'),null);
});
test('theorycraft with no inventory shows hypothetical shortages and unverified legality',()=>{
  const s=fixture();s.lines=[{id:'line',deck_id:'deck',card_id:'card',section:'main',quantity:2,preferred_printing_id:'print'}];
  const summary=deckSummary(s,s.decks[0]);assert.equal(summary.missing,2);assert.equal(summary.inventoryStatus,'Not reserved');assert.equal(summary.assigned,0);assert.equal(s.decks[0].legality_status,'Unverified');
  s.decks[0].mode='physical';assert.equal(deckSummary(s,s.decks[0]).inventoryStatus,'Incomplete');
});
test('persisted display order is independent from inventory and supports optional name/cost sorting',()=>{
  const s=fixture();const lines=[{id:'b',deck_id:'deck',card_id:'legend',section:'main',quantity:1,preferred_printing_id:null,display_order:1},{id:'a',deck_id:'deck',card_id:'card',section:'main',quantity:1,preferred_printing_id:'print',display_order:0}];
  const before=JSON.stringify(lines);assert.deepEqual(orderedLines(lines,s,'manual').map(l=>l.id),['a','b']);assert.deepEqual(orderedLines(lines,s,'name').map(l=>l.id),['b','a']);assert.equal(orderedLines(lines,s,'cost')[0].id,'a');assert.equal(JSON.stringify(lines),before);
});
