import { canonicalOrder, inventory, progress, target, type CollectionCategory } from './collection';
import type { ImageMetadata } from './images';
export type SortField = 'canonical' | 'name' | 'rarity' | 'type' | 'domain' | 'owned' | 'missing' | 'priority' | 'desired';
export type SortPreference = { field: SortField; direction: 'asc' | 'desc' };
export const defaultSort: SortPreference = { field: 'canonical', direction: 'asc' };
export const sortLabels: Record<SortField,string> = { canonical:'Set / CARD #', name:'Name', rarity:'Rarity', type:'Card type', domain:'Domain', owned:'Owned quantity', missing:'Missing quantity', priority:'Priority', desired:'Desired quantity' };
export type Printing = { id:string; card_id:string; set_id:string; set_code:string; sort_order:number; card_number:string|null; name:string; card_type:string|null; domains:string[]; rarity:string|null; language:string; treatment:string; variant:string; printed_text:string|null; eligible:boolean; collection_category:CollectionCategory; eligibility_basis:string; is_fixture:boolean; source_url:string; source_version:string };
export type InventoryEntry = { id:string; printing_id:string; owned:number; reserved:number; available:number };
export type WishlistEntry = { id:string; printing_id:string; manual_target:number|null; include_masterset:boolean; include_decks:boolean; priority:'High'|'Medium'|'Low'; note:string };
export type Deck = { id:string; name:string; mode:'theorycraft'|'physical'; format:string|null; legality_status:'Unverified' };
export type DeckLine = { id:string; deck_id:string; card_id:string; section:string; quantity:number; preferred_printing_id:string|null };
export type Allocation = { id:string; deck_card_id:string; collection_entry_id:string; quantity:number };
export type Snapshot = {
  printings:Printing[]; cards:{ id:string; name:string; card_type:string|null; domains:string[] }[];
  sets:{ id:string; code:string; name:string; sort_order:number }[];
  products:{ id:string; name:string; is_proving_grounds:boolean; checklist_verified:boolean }[];
  contents:{ product_id:string; printing_id:string; published_quantity:number|null }[];
  images:{ printing_id:string; authorized_url:string|null; checksum:string|null; state:ImageMetadata['state']; usage_verified:boolean }[];
  inventory:InventoryEntry[]; wishlist:WishlistEntry[]; decks:Deck[]; lines:DeckLine[]; allocations:Allocation[];
  preferences:{ collection:SortPreference; wishlist:SortPreference }|null;
  sources:{ url:string; version:string; retrieved_at:string; is_fixture:boolean; official_verified:boolean }[];
};
export type CollectionRow = Printing & { owned:number; reserved:number; available:number; goal:number|null; missing:number|null; excess:number|null; entryId:string|null };
export type Reason = { origin:'Manual'|'Masterset'|'Deck'; target:number; detail:string };
export type WishRow = CollectionRow & { desired:number; deficit:number; reasons:Reason[]; priority:WishlistEntry['priority']; note:string; entry:WishlistEntry|null; physicalDemand:number };
export function collectionRows(s:Snapshot):CollectionRow[] {
  const quantities = new Map(s.inventory.map(i=>[i.printing_id,i]));
  return s.printings.filter(p=>p.eligible).map(p=>{
    const i=quantities.get(p.id); const state=inventory(i?.owned??0,i?.reserved??0); const goal=target(p.collection_category);
    return { ...p, ...state, goal, missing:goal===null?null:Math.max(goal-state.owned,0), excess:goal===null?null:Math.max(state.owned-goal,0), entryId:i?.id??null };
  });
}
export function masterset(rows:CollectionRow[]) {
  return progress(rows.map(r=>({owned:r.owned,category:r.collection_category})));
}
export function physicalDemand(s:Snapshot, printingId:string):number {
  const physical=new Set(s.decks.filter(d=>d.mode==='physical').map(d=>d.id));
  return s.lines.filter(l=>physical.has(l.deck_id)&&l.preferred_printing_id===printingId).reduce((sum,l)=>sum+l.quantity,0);
}
export function wishlistRows(s:Snapshot, suggestions=false):WishRow[] {
  const entries=new Map(s.wishlist.map(w=>[w.printing_id,w]));
  return collectionRows(s).flatMap(r=>{
    const entry=entries.get(r.id)??null; const demand=physicalDemand(s,r.id); const reasons:Reason[]=[];
    if(entry?.manual_target) reasons.push({origin:'Manual',target:entry.manual_target,detail:'Total ownership goal; never overwritten by suggestions.'});
    if((suggestions||entry?.include_masterset)&&r.goal!==null) reasons.push({origin:'Masterset',target:r.goal,detail:'Eligible printing collection goal.'});
    if((suggestions||entry?.include_decks)&&demand>0) {
      const decks=s.decks.filter(d=>d.mode==='physical'&&s.lines.some(l=>l.deck_id===d.id&&l.preferred_printing_id===r.id));
      reasons.push({origin:'Deck',target:demand,detail:`Simultaneous physical demand: ${decks.map(d=>d.name).join(', ')}.`});
    }
    const desired=Math.max(0,...reasons.map(reason=>reason.target));
    const deficit=Math.max(desired-r.owned,0);
    if(suggestions ? deficit===0 : !entry) return [];
    return [{ ...r, desired,deficit,missing:deficit,reasons,priority:entry?.priority??'Medium',note:entry?.note??'',entry,physicalDemand:demand }];
  });
}
const labels=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const rarityRank:Record<string,number>={Common:0,Uncommon:1,Rare:2,Epic:3};
const priorityRank={High:0,Medium:1,Low:2};
function compareValue(a:string|number|null,b:string|number|null,direction:number) {
  if(a===null&&b===null)return 0;
  if(a===null)return 1;if(b===null)return -1;
  return direction*(typeof a==='number'&&typeof b==='number'?a-b:labels.compare(String(a),String(b)));
}
export function orderRows<T extends CollectionRow>(rows:T[],sort:SortPreference):T[] {
  const direction=sort.direction==='desc'?-1:1;
  const canonical=(a:T,b:T)=>canonicalOrder({id:a.id,setOrder:a.sort_order,cardNumber:a.card_number},{id:b.id,setOrder:b.sort_order,cardNumber:b.card_number});
  return [...rows].sort((a,b)=>{
    if(sort.field==='canonical') {
      if(a.sort_order!==b.sort_order)return direction*(a.sort_order-b.sort_order);
      const absentA=!a.card_number?.match(/^\d+/),absentB=!b.card_number?.match(/^\d+/);
      if(absentA!==absentB)return absentA?1:-1;
      return direction*canonical(a,b);
    }
    const value=(r:T):string|number|null=>{
      switch(sort.field) {
        case 'name':return r.name;case 'rarity':return r.rarity&&r.rarity in rarityRank?rarityRank[r.rarity]:null;
        case 'type':return r.card_type;case 'domain':return r.domains.length?[...r.domains].sort(labels.compare).join(', '):null;
        case 'owned':return r.owned;case 'missing':return r.missing;
        case 'priority':return 'priority' in r?priorityRank[(r as unknown as WishRow).priority]:null;
        case 'desired':return 'desired' in r?(r as unknown as WishRow).desired:null;
        default:return null;
      }
    };
    return compareValue(value(a),value(b),direction)||canonical(a,b);
  });
}
export type Filters = { query:string; set:string; type:string; domain:string; rarity:string; ownership:string; product:string };
export const emptyFilters:Filters={query:'',set:'',type:'',domain:'',rarity:'',ownership:'',product:''};
export function filterRows<T extends CollectionRow>(rows:T[],f:Filters,s:Snapshot):T[] {
  const productPrintings=new Set(s.contents.filter(c=>c.product_id===f.product).map(c=>c.printing_id));
  const q=f.query.trim().toLocaleLowerCase('en');
  return rows.filter(r=>(!q||`${r.name} ${r.set_code} ${r.card_number??''}`.toLocaleLowerCase('en').includes(q))&&
    (!f.set||r.set_id===f.set)&&(!f.type||r.card_type===f.type)&&(!f.domain||r.domains.includes(f.domain))&&(!f.rarity||r.rarity===f.rarity)&&
    (!f.product||productPrintings.has(r.id))&&(!f.ownership||(f.ownership==='owned'?r.owned>0:f.ownership==='unowned'?r.owned===0:f.ownership==='missing'?r.missing!==null&&r.missing>0:f.ownership==='excess'?r.excess!==null&&r.excess>0:r.goal===null)));
}
export function paginate<T>(ordered:T[],page:number,size=24) {
  const pages=Math.max(1,Math.ceil(ordered.length/size)); const current=Math.min(Math.max(1,page),pages);
  return { rows:ordered.slice((current-1)*size,current*size),pages,current,total:ordered.length };
}
export function deckSummary(s:Snapshot,deck:Deck) {
  const lines=s.lines.filter(l=>l.deck_id===deck.id);
  const required=lines.reduce((sum,l)=>sum+l.quantity,0);
  const lineIds=new Set(lines.map(l=>l.id));
  const assigned=s.allocations.filter(a=>lineIds.has(a.deck_card_id)).reduce((sum,a)=>sum+a.quantity,0);
  // Theorycraft demand uses exact chosen printings. Unresolved printings are never
  // counted as covered by guesses across languages/sets.
  const demands=new Map<string,number>(); let unresolved=0;
  lines.forEach(l=>{if(l.preferred_printing_id) demands.set(l.preferred_printing_id,(demands.get(l.preferred_printing_id)??0)+l.quantity);else unresolved+=l.quantity;});
  const quantities=new Map(s.inventory.map(i=>[i.printing_id,i.owned]));
  const hypotheticalMissing=[...demands].reduce((sum,[id,n])=>sum+Math.max(n-(quantities.get(id)??0),0),0)+unresolved;
  return { required,assigned,missing:deck.mode==='physical'?required-assigned:hypotheticalMissing,
    inventoryStatus:deck.mode==='physical'?(required>0&&assigned===required?'Allocated':'Incomplete'):'Not reserved',unresolved };
}
export function dashboard(s:Snapshot) {
  const rows=collectionRows(s); const wish=wishlistRows(s);
  return { owned:rows.reduce((n,r)=>n+r.owned,0), distinct:new Set(rows.filter(r=>r.owned>0).map(r=>r.card_id)).size,
    reserved:rows.reduce((n,r)=>n+r.reserved,0), missing:masterset(rows).missing,
    wishlistDeficit:wish.reduce((n,r)=>n+r.deficit,0),wishlistCount:wish.length,
    sets:s.sets.map(set=>({...set,progress:masterset(rows.filter(r=>r.set_id===set.id))})),
    physical:s.decks.filter(d=>d.mode==='physical').map(d=>({...d,...deckSummary(s,d)})) };
}
