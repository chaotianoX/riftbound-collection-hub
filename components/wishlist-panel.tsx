'use client';
import { useState } from 'react';
import { useWorkspace } from './workspace-context';
import Link from 'next/link';
import { CollectionFilters, SortControls, Pager, WishReasons } from './collection-panel';
import { defaultSort, emptyFilters, filterRows, orderRows, paginate, wishlistRows, type Filters, type SortPreference, type WishRow } from '@/lib/domain/workspace';
function WishlistForm({row}:{row:WishRow}) {
  const {run,busy}=useWorkspace();
  return <form className="wishlist-form" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('save_wishlist',{printing_id:row.id,target:Number(data.get('target')),priority:String(data.get('priority')),note:String(data.get('note'))});}}>
    <label>Manual total ownership goal<input key={`${row.id}-${row.entry?.manual_target}`} name="target" type="number" min="0" step="1" max="2147483647" required defaultValue={row.entry?.manual_target??0}/></label>
    <label>Priority<select key={`${row.id}-${row.priority}`} name="priority" defaultValue={row.priority}><option>High</option><option>Medium</option><option>Low</option></select></label>
    <label>Note<textarea key={`${row.id}-${row.note}`} name="note" defaultValue={row.note} maxLength={1000}/></label>
    <p className="muted">Goal includes copies already owned. Zero removes only the manual reason.</p><button disabled={busy}>Save wishlist entry</button>
  </form>;
}
export function WishlistPanel() {
  const {s,run,busy}=useWorkspace();const [tab,setTab]=useState<'saved'|'suggested'>('saved');
  const [filters,setFilters]=useState<Filters>(emptyFilters);const [page,setPage]=useState(1);const [chosen,setChosen]=useState<SortPreference|null>(null);
  const sort=chosen??s.preferences?.wishlist??defaultSort;
  const rows=wishlistRows(s,tab==='suggested');const result=paginate(orderRows(filterRows(rows,filters,s),sort),page);
  return <><header><p className="eyebrow">PLAN ACQUISITIONS</p><h1>Wishlist</h1><p>Manual goals and derived reasons stay separate. Matching reasons use the highest total goal; inventory is deducted once.</p></header>
    <ManualEntry/>
    <div className="toggle"><button type="button" aria-pressed={tab==='saved'} onClick={()=>{setTab('saved');setPage(1);}}>Saved wishlist</button><button type="button" className="secondary" aria-pressed={tab==='suggested'} onClick={()=>{setTab('suggested');setPage(1);}}>Suggestions</button></div>
    <CollectionFilters filters={filters} onChange={f=>{setFilters(f);setPage(1);}}/><SortControls wishlist sort={sort} onChange={p=>{setChosen(p);setPage(1);void run('save_sort',{screen:'wishlist',...p});}}/>
    <p className="muted">Deck suggestions combine simultaneous physical demand only for explicitly selected printings. Theorycraft shortages remain hypothetical on the deck screen.</p>
    {!result.total&&<section className="panel"><h2>{tab==='saved'?'Your wishlist is empty':'No matching suggestions'}</h2><p>{tab==='saved'?'Add a manual goal or explicitly save a suggestion.':'No derived deficits match these filters.'}</p></section>}
    <div className="wish-grid">{result.rows.map(row=><article className="panel" key={row.id} data-testid="wish-card"><h2><Link href={`/cards/${row.id}`}>{row.name}</Link></h2><p>{row.set_code} {row.card_number??'CARD # missing'} · {row.treatment} · {row.language}</p><p><strong>Goal {row.desired} · Owned {row.owned} · Remaining {row.deficit}</strong></p><WishReasons row={row}/>
      {tab==='saved'?<><WishlistForm row={row}/><div className="action-row">{row.entry?.include_masterset&&<button className="secondary" disabled={busy} onClick={()=>void run('remove_wishlist_reason',{printing_id:row.id,reason:'Masterset'})}>Remove masterset reason</button>}{row.entry?.include_decks&&<button className="secondary" disabled={busy} onClick={()=>void run('remove_wishlist_reason',{printing_id:row.id,reason:'Deck'})}>Remove deck reason</button>}<button className="danger" disabled={busy} onClick={()=>void run('delete_wishlist',{printing_id:row.id})}>Remove entry</button></div></>:<div className="action-row">{row.goal!==null&&row.goal>row.owned&&<button disabled={busy} onClick={()=>void run('add_wishlist_reason',{printing_id:row.id,reason:'Masterset'})}>Save masterset reason</button>}{row.physicalDemand>row.owned&&<button disabled={busy} onClick={()=>void run('add_wishlist_reason',{printing_id:row.id,reason:'Deck'})}>Save deck reason</button>}</div>}
    </article>)}</div><Pager {...result} onChange={setPage}/></>;
}
function ManualEntry() {
  const {s,run,busy}=useWorkspace();const [query,setQuery]=useState('');
  const candidates=s.printings.filter(p=>p.name.toLowerCase().includes(query.toLowerCase()));
  return <details className="panel"><summary>Add a manual acquisition goal</summary><form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('save_wishlist',{printing_id:String(data.get('printing_id')),target:Number(data.get('target')),priority:String(data.get('priority')),note:String(data.get('note'))});}}>
    <label>Find a printing<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Eligible printing<select name="printing_id" required><option value="">Choose a printing</option>{candidates.map(p=><option key={p.id} value={p.id}>{p.set_code} {p.card_number??'?'} · {p.name} · {p.treatment} · {p.language}</option>)}</select></label>
    <label>Total ownership goal<input name="target" type="number" min="1" step="1" max="2147483647" defaultValue={1} required/></label><label>Priority<select name="priority" defaultValue="Medium"><option>High</option><option>Medium</option><option>Low</option></select></label><label>Note<input name="note" maxLength={1000} defaultValue=""/></label><button disabled={busy||!candidates.length}>Add manual goal</button>
  </form></details>;
}
