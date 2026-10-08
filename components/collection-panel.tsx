'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CardImage } from './card-image';
import { useWorkspace } from './workspace-context';
import { collectionRows, defaultSort, emptyFilters, filterRows, masterset, orderRows, paginate, sortLabels, type CollectionRow, type Filters, type SortPreference, type SortField, type WishRow } from '@/lib/domain/workspace';
export function CollectionFilters({filters,onChange}:{filters:Filters;onChange:(f:Filters)=>void}) {
  const {s}=useWorkspace(); const rows=collectionRows(s);
  const values=(key:'card_type'|'rarity')=>[...new Set(rows.map(r=>r[key]).filter((v):v is string=>!!v))].sort();
  const update=(key:keyof Filters,value:string)=>onChange({...filters,[key]:value});
  return <div className="filters">
    <label>Search<input type="search" value={filters.query} placeholder="Name or CARD #" onChange={e=>update('query',e.target.value)}/></label>
    <label>Set<select value={filters.set} onChange={e=>update('set',e.target.value)}><option value="">All sets</option>{s.sets.map(set=><option key={set.id} value={set.id}>{set.code} · {set.name}</option>)}</select></label>
    <label>Card type<select value={filters.type} onChange={e=>update('type',e.target.value)}><option value="">All types</option>{values('card_type').map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Domain<select value={filters.domain} onChange={e=>update('domain',e.target.value)}><option value="">All domains</option>{[...new Set(rows.flatMap(r=>r.domains))].sort().map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Rarity<select value={filters.rarity} onChange={e=>update('rarity',e.target.value)}><option value="">All rarities</option>{values('rarity').map(v=><option key={v}>{v}</option>)}</select></label>
    <label>Ownership<select value={filters.ownership} onChange={e=>update('ownership',e.target.value)}><option value="">All cards</option><option value="owned">Owned</option><option value="unowned">Not owned</option><option value="missing">Missing copies</option><option value="excess">Excess copies</option><option value="pending">Target pending</option></select></label>
    <label>Product checklist<select value={filters.product} onChange={e=>update('product',e.target.value)}><option value="">All products</option>{s.products.map(p=><option key={p.id} value={p.id}>{p.name}{p.checklist_verified?'':' · unverified'}</option>)}</select></label>
    <button type="button" className="secondary" onClick={()=>onChange(emptyFilters)}>Clear filters</button>
  </div>;
}
export function SortControls({sort,onChange,wishlist=false}:{sort:SortPreference;onChange:(s:SortPreference)=>void;wishlist?:boolean}) {
  return <div className="sort-controls"><label>Sort by<select value={sort.field} onChange={e=>onChange({...sort,field:e.target.value as SortField})}>{Object.entries(sortLabels).filter(([field])=>wishlist||!['priority','desired'].includes(field)).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>Direction<select value={sort.direction} onChange={e=>onChange({...sort,direction:e.target.value as 'asc'|'desc'})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
    <button type="button" className="secondary" onClick={()=>onChange(defaultSort)}>Reset to default</button></div>;
}
export function PrintingArt({row}:{row:CollectionRow}) {
  const {s}=useWorkspace();const image=s.images.find(i=>i.printing_id===row.id);
  return <CardImage name={row.name} metadata={image?{state:image.state,usageVerified:image.usage_verified,authorizedUrl:image.authorized_url,checksum:image.checksum}:null}/>;
}
export function OwnedForm({row}:{row:CollectionRow}) {
  const {run,busy}=useWorkspace();
  return <form className="quantity-form" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('set_owned',{printing_id:row.id,quantity:Number(data.get('quantity'))});}}>
    <label>Owned quantity<input key={`${row.id}-${row.owned}`} aria-label={`Owned quantity for ${row.name} ${row.set_code} ${row.card_number??''}`} name="quantity" type="number" step="1" min="0" max="2147483647" required defaultValue={row.owned}/></label>
    <button disabled={busy}>Save quantity</button></form>;
}
export function CardFacts({row}:{row:CollectionRow}) {
  return <><p className="card-meta">{row.set_code} {row.card_number??'CARD # missing'} · {row.rarity??'Rarity unknown'} · {row.treatment==='nonfoil'?'Non-foil':row.treatment} · {row.language}</p>
    <p className="muted">{row.card_type??'Type unknown'} · {row.domains.join(', ')||'Domain unknown'}</p>
    <dl className="inventory-facts"><div><dt>Owned</dt><dd>{row.owned}</dd></div><div><dt>Reserved</dt><dd>{row.reserved}</dd></div><div><dt>Available</dt><dd>{row.available}</dd></div><div><dt>Target / Missing / Excess</dt><dd>{row.goal??'Pending'} / {row.missing??'—'} / {row.excess??'—'}</dd></div></dl></>;
}
export function Pager({current,pages,total,onChange}:{current:number;pages:number;total:number;onChange:(n:number)=>void}) {
  return <div className="pager"><p>{total} entries · Page {current} of {pages}</p><div><button type="button" className="secondary" disabled={current<=1} onClick={()=>onChange(current-1)}>Previous</button><button type="button" className="secondary" disabled={current>=pages} onClick={()=>onChange(current+1)}>Next</button></div></div>;
}
export function ProgressSummary({rows}:{rows:CollectionRow[]}) {
  const p=masterset(rows);
  return <section className="panel"><h2>Masterset progress</h2><p className="big-number">{p.completion===null?'—':`${p.completion.toFixed(1)}%`}</p>
    {p.completion!==null&&<progress aria-label="Masterset completion" max="100" value={p.completion}/>}
    <p>{p.covered} / {p.total} confirmed target copies · {p.missing} missing · {p.excess} excess</p>
    {p.unresolved>0&&<p className="warning">{p.unresolved} entries have pending targets. Overall completion is not yet defined.</p>}
    {!rows.length&&<p>No cards available</p>}<p className="muted">Reserved copies remain owned. Collection goals are not deck legality limits.</p></section>;
}
export function CollectionPanel({mastersetMode=false}:{mastersetMode?:boolean}) {
  const {s,run}=useWorkspace(); const params=useSearchParams();
  const [filters,setFilters]=useState<Filters>({...emptyFilters,set:params.get('set')??'',ownership:params.get('ownership')??''});
  const [chosen,setChosen]=useState<SortPreference|null>(null); const sort=chosen??s.preferences?.collection??defaultSort;
  const [view,setView]=useState<'grid'|'list'>('grid');const [page,setPage]=useState(1);
  const changeFilters=(f:Filters)=>{setFilters(f);setPage(1);};
  const changeSort=(p:SortPreference)=>{setChosen(p);setPage(1);void run('save_sort',{screen:'collection',...p});};
  const all=collectionRows(s);const filtered=filterRows(all,filters,s); const result=paginate(orderRows(filtered,sort),page);
  const scoped=filterRows(all,{...emptyFilters,set:filters.set,product:filters.product},s);
  return <><header><p className="eyebrow">ELIGIBLE EDITIONS</p><h1>{mastersetMode?'Masterset':'Collection'}</h1><p>{mastersetMode?'Track confirmed collection goals by set.':'Record physical copies without losing track of reservations.'}</p></header>
    <CollectionFilters filters={filters} onChange={changeFilters}/>
    {filters.product&&<p className="warning">Product membership preserves the printed set. Box quantities do not replace masterset targets. {s.products.find(p=>p.id===filters.product)?.checklist_verified?'Use source metadata to verify checklist provenance.':'This product checklist has not been verified.'}</p>}
    {mastersetMode&&<><ProgressSummary rows={scoped}/><div className="summary-grid">{[...new Set(scoped.map(r=>r.card_type??'Unknown'))].map(type=><div className="panel" key={type}><h3>{type}</h3><p>{masterset(scoped.filter(r=>(r.card_type??'Unknown')===type)).missing} missing copies</p></div>)}</div></>}
    <div className="toolbar"><SortControls sort={sort} onChange={changeSort}/><div className="toggle" aria-label="View"><button type="button" className="secondary" aria-pressed={view==='grid'} onClick={()=>setView('grid')}>Grid</button><button type="button" className="secondary" aria-pressed={view==='list'} onClick={()=>setView('list')}>List</button></div></div>
    {!result.total?<section className="panel"><h2>{all.length?'No matching cards':'No cards available'}</h2><p>{all.length?'Try adjusting your filters.':'Import an authorized catalog, or explicitly load local TEST ONLY fixtures.'}</p></section>:<div className={view==='grid'?'card-grid':'card-list'}>{result.rows.map(row=><article className="panel collection-card" key={row.id} data-testid="collection-card">
      <PrintingArt row={row}/><div className="card-body"><h2><Link href={`/cards/${row.id}`}>{row.name}</Link></h2><CardFacts row={row}/><OwnedForm row={row}/>
      <button className="secondary" type="button" disabled={row.missing===null||row.missing===0} onClick={()=>void run('add_wishlist_reason',{printing_id:row.id,reason:'Masterset'})}>Add missing to wishlist</button></div></article>)}</div>}
    <Pager {...result} onChange={setPage}/></>;
}
export function WishReasons({row}:{row:WishRow}) {
  return <div className="reasons">{row.reasons.map(r=><p key={r.origin}><span className="badge">{r.origin}</span> · Goal {r.target}<br/><small>{r.detail}</small></p>)}{row.entry?.include_masterset&&row.goal===null&&<p>Masterset · Target pending</p>}{row.entry?.include_decks&&!row.physicalDemand&&<p>Deck · No current physical demand</p>}</div>;
}
