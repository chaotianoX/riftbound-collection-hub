'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from './workspace-context';
import { collectionRows, type Deck, type DeckLine } from '@/lib/domain/workspace';
export function LineEditor({deck,line}:{deck:Deck;line:DeckLine}) {
  const {s,run,busy}=useWorkspace();const row=collectionRows(s).filter(r=>r.card_id===line.card_id);const card=s.cards.find(c=>c.id===line.card_id);
  const assigned=s.allocations.filter(a=>a.deck_card_id===line.id);const allocated=assigned.reduce((n,a)=>n+a.quantity,0);
  const candidates=row.filter(r=>r.entryId&&(!line.preferred_printing_id||line.preferred_printing_id===r.id));
  const active=assigned[0];const [picked,setPicked]=useState('');const entryId=picked||active?.collection_entry_id||candidates[0]?.entryId||'';
  return <article className="panel deck-line" data-testid="deck-line"><h3>{card?.name??'Unknown card'} · {line.section}</h3><p>Required {line.quantity} · Allocated {allocated} · Unallocated {line.quantity-allocated}</p>
    <form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('set_line',{deck_id:deck.id,card_id:line.card_id,section:line.section,quantity:Number(data.get('quantity'))});}}><label>Line quantity<input key={line.quantity} name="quantity" type="number" min="0" step="1" max="2147483647" required defaultValue={line.quantity}/></label><button disabled={busy}>Update line</button><p className="muted">Zero removes the line after its reservations are released.</p></form>
    <form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('set_line_printing',{deck_card_id:line.id,printing_id:String(data.get('printing_id'))||null});}}><label>Planned printing<select key={line.preferred_printing_id} name="printing_id" defaultValue={line.preferred_printing_id??''}><option value="">Unresolved printing</option>{row.map(r=><option key={r.id} value={r.id}>{r.set_code} {r.card_number??'?'} · {r.treatment} · {r.language}</option>)}</select></label><button disabled={busy}>Save printing choice</button></form>
    {deck.mode==='physical'?<><form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('allocate',{deck_card_id:line.id,collection_entry_id:entryId,quantity:Number(data.get('quantity'))});}}>
      <label>Inventory source<select value={entryId} onChange={e=>setPicked(e.target.value)} required><option value="">No inventory source selected</option>{candidates.map(r=><option key={r.entryId} value={r.entryId!}>{r.set_code} {r.card_number??'?'} · Owned {r.owned} · Reserved {r.reserved} · Available {r.available}</option>)}</select></label>
      <label>Allocation quantity<input key={`${line.id}-${active?.quantity}`} name="quantity" type="number" min="0" step="1" max="2147483647" required defaultValue={active?.quantity??0}/></label><button disabled={busy||!entryId}>Save allocation</button>
      </form>{!candidates.length&&<p>No matching owned entry. <Link href="/collection">Record inventory</Link> before assigning copies.</p>}
      {assigned.map(a=><div className="action-row" key={a.id}><p>Inventory entry {a.collection_entry_id.slice(0,8)} · {a.quantity} reserved</p><button disabled={busy} className="secondary" onClick={()=>void run('allocate',{deck_card_id:line.id,collection_entry_id:a.collection_entry_id,quantity:0})}>Release allocation</button></div>)}
      <p className="muted">One exact printing per line until printing/language equivalence is verified. Switching source requires releasing the old allocation first.</p>
    </>:<p className="muted">Theorycraft reserves no copies. Missing amounts are hypothetical and never reduce collection ownership.</p>}
  </article>;
}

export function ManualLineEditor({deck,initialCard,initialPrinting}:{deck:Deck;initialCard:string;initialPrinting:string}) {
 const {s,run,busy}=useWorkspace();
 const [query,setQuery]=useState('');const [card,setCard]=useState(initialCard);const [printing,setPrinting]=useState(initialPrinting);
 const candidates=s.cards.filter(c=>c.id===card||c.name.toLowerCase().includes(query.toLowerCase()));
 const name=s.cards.find(c=>c.id===card)?.name;
 return <section className="panel"><h3>Add or update a card line</h3><form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('set_line',{deck_id:deck.id,card_id:card,printing_id:printing||null,section:String(data.get('section')).trim(),quantity:Number(data.get('quantity'))});}}>
    <label>Find a card identity<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Card identity<select value={card} onChange={e=>{setCard(e.target.value);setPrinting('');}} required><option value="">Choose a card</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select></label>
    <label>Planned printing<select value={printing} onChange={e=>setPrinting(e.target.value)}><option value="">Unresolved printing</option>{s.printings.filter(p=>p.card_id===card).map(p=><option key={p.id} value={p.id}>{p.set_code} {p.card_number??'?'} · {p.treatment} · {p.language}</option>)}</select></label>
    <label>Section label<input name="section" required maxLength={80} defaultValue="main" placeholder="Descriptive, not verified"/></label><label>Required quantity<input name="quantity" type="number" min="1" step="1" max="2147483647" defaultValue={1} required/></label><button disabled={busy||!card}>Save card line</button>
  </form>{name&&<p className="muted">Adding the same identity and section updates that line; it does not duplicate it.</p>}</section>;
}
