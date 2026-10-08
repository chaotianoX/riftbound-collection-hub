import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionRows,masterset,wishlistRows,orderRows,filterRows,paginate,dashboard,deckSummary,emptyFilters,type Snapshot,type SortField} from '../lib/domain/workspace';
import {parseDeckText,exportDeckText} from '../lib/domain/deck-text';
function fixture():Snapshot {
 return {printings:[...Array(60)].map((_,i)=>({id:`p${i}`,card_id:`c${i}`,set_id:i<30?'ogn':'sfd',set_code:i<30?'OGN':'SFD',sort_order:i<30?1:2,card_number:String((i%30)+1),name:`TEST ${60-i}`,card_type:i===0?'Legend':'Test unit',domains:['Test domain'],rarity:['Common','Uncommon','Rare','Epic'][i%4],language:'en',treatment:i%4<2?'nonfoil':'foil',variant:'standard',printed_text:null,eligible:true,collection_category:i===0?'Legend':'Normal',eligibility_basis:'TEST',is_fixture:true,source_url:'https://example.invalid',source_version:'TEST'})),cards:[...Array(60)].map((_,i)=>({id:`c${i}`,name:`TEST ${i}`,card_type:'Test unit',domains:[]})),sets:[{id:'ogn',code:'OGN',name:'TEST',sort_order:1},{id:'sfd',code:'SFD',name:'TEST',sort_order:2}],products:[],contents:[],images:[],inventory:[],wishlist:[],decks:[],lines:[],allocations:[],preferences:null,sources:[]};
}
test('all collection order options, direction/reset and paging operate before pagination without mutation',()=>{
 const s=fixture();const rows=collectionRows(s);const before=JSON.stringify(s);
 const ordered=orderRows([...rows].reverse(),{field:'canonical',direction:'asc'});
 assert.equal(ordered[1].card_number,'2');assert.equal(ordered[9].card_number,'10');
 assert.ok(paginate(ordered,2).rows.slice(0,6).every(r=>r.set_code==='OGN'));
 assert.equal(paginate(ordered,2).rows[6].set_code,'SFD');
 for(const field of ['name','rarity','type','domain','owned','missing'] as SortField[]){
  const sorted=orderRows(rows,{field,direction:'asc'});assert.equal(sorted.length,60);
  assert.equal(orderRows(rows,{field,direction:'desc'}).length,60);
 }
 assert.equal(orderRows(rows,{field:'name',direction:'asc'})[0].name,'TEST 1');
 assert.equal(orderRows(rows,{field:'rarity',direction:'asc'})[0].rarity,'Common');
 assert.equal(orderRows(rows,{field:'rarity',direction:'desc'})[0].rarity,'Epic');
 assert.equal(JSON.stringify(s),before);
 assert.deepEqual(filterRows(rows,{...emptyFilters,set:'ogn',query:'TEST'},s).map(r=>r.set_code),Array(30).fill('OGN'));
});
test('masterset remains copy-weighted and unchanged by physical reservations; pending targets are explicit',()=>{
 const s=fixture();s.printings=s.printings.slice(0,2);s.inventory=[{id:'i',printing_id:'p0',owned:1,reserved:1,available:0},{id:'j',printing_id:'p1',owned:2,reserved:1,available:1}];
 assert.equal(masterset(collectionRows(s)).completion,75);s.inventory[1].reserved=2;
 assert.equal(masterset(collectionRows(s)).completion,75);
 s.printings[1].collection_category=null;assert.equal(masterset(collectionRows(s)).completion,null);
});
test('wishlist combines goals by max, sums simultaneous physical demand, deducts owned once and keeps manual reasons',()=>{
 const s=fixture();s.inventory=[{id:'i',printing_id:'p1',owned:2,reserved:0,available:2}];
 s.wishlist=[{id:'w',printing_id:'p1',manual_target:4,include_masterset:true,include_decks:true,priority:'High',note:'Keep this'}];
 s.decks=[{id:'a',name:'A',mode:'physical',format:null,legality_status:'Unverified'},{id:'b',name:'B',mode:'physical',format:null,legality_status:'Unverified'},{id:'idea',name:'Idea',mode:'theorycraft',format:null,legality_status:'Unverified'}];
 s.lines=s.decks.map(d=>({id:d.id,deck_id:d.id,card_id:'c1',section:'main',quantity:d.id==='idea'?99:3,preferred_printing_id:'p1'}));
 const row=wishlistRows(s)[0];assert.equal(row.desired,6);assert.equal(row.deficit,4);assert.equal(row.reasons.length,3);assert.equal(row.entry?.note,'Keep this');
 s.inventory[0].owned=5;assert.equal(wishlistRows(s)[0].deficit,1);assert.equal(s.wishlist[0].manual_target,4);
 s.decks=s.decks.filter(d=>d.mode==='theorycraft');assert.equal(wishlistRows(s)[0].desired,4);
 assert.equal(orderRows(wishlistRows(s),{field:'priority',direction:'asc'})[0].priority,'High');
});
test('dashboard metrics derive from the same scoped rows and physical status never implies legality',()=>{
 const s=fixture();s.inventory=[{id:'i',printing_id:'p1',owned:3,reserved:2,available:1}];
 s.decks=[{id:'a',name:'A',mode:'physical',format:null,legality_status:'Unverified'}];s.lines=[{id:'l',deck_id:'a',card_id:'c1',quantity:2,section:'main',preferred_printing_id:'p1'}];s.allocations=[{id:'a',deck_card_id:'l',collection_entry_id:'i',quantity:2}];
 assert.equal(dashboard(s).owned,3);assert.equal(dashboard(s).reserved,2);assert.equal(dashboard(s).physical[0].inventoryStatus,'Allocated');assert.equal(dashboard(s).physical[0].legality_status,'Unverified');
 s.decks[0].mode='theorycraft';assert.equal(deckSummary(s,s.decks[0]).inventoryStatus,'Not reserved');
});
test('deck text round-trip resolves exact IDs and rejects duplicate, ambiguous and invalid lines',()=>{
 const s=fixture();s.lines=[{id:'l',deck_id:'d',card_id:'c1',preferred_printing_id:'p1',quantity:3,section:'main'}];
 const text=exportDeckText(s,'d');assert.equal(parseDeckText(text,s).errors.length,0);assert.equal(parseDeckText(text,s).lines[0].quantity,3);
 assert.ok(parseDeckText('1\tmain\tc1\tp1\n2\tmain\tc1\tp1',s).errors.some(e=>e.includes('duplicate')));
 for(const bad of ['-1\tmain\tc1','1.5\tmain\tc1','1\tmain\tTEST name','1\tmain\tc1\tp2'])assert.ok(parseDeckText(bad,s).errors.length>0);
});
