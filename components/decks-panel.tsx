'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useWorkspace } from './workspace-context';
import { collectionRows, deckSummary, type Deck, type DeckLine } from '@/lib/domain/workspace';
import { exportDeckText, parseDeckText } from '@/lib/domain/deck-text';
export function DecksPanel() {
  const {s,run,busy}=useWorkspace();const params=useSearchParams();
  const [selected,setSelected]=useState<string|null>(params.get('deck'));const [text,setText]=useState('');const [preview,setPreview]=useState(false);const [textOpen,setTextOpen]=useState(false);
  const deck=s.decks.find(d=>d.id===(selected??s.decks[0]?.id));const parsed=parseDeckText(text,s);
  const create=async (e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const result=await run('create_deck',{name:String(data.get('name')),mode:String(data.get('mode')),format:String(data.get('format'))});if(result.ok&&result.id){setSelected(result.id);form.reset();}};
  return <><header><p className="eyebrow">IDEAS AND PHYSICAL COPIES</p><h1>Decks</h1><p>Plan freely in theorycraft. Physical decks reserve owned copies transactionally.</p></header>
    <p className="warning">Legality is Unverified. Format and section labels do not establish official limits. No deck is marked Ready without verified rules.</p>
    <section className="panel"><h2>Create a deck</h2><form className="filters" onSubmit={create}><label>Deck name<input name="name" required maxLength={120}/></label><label>Mode<select name="mode" defaultValue="theorycraft"><option value="theorycraft">Theorycraft</option><option value="physical">Physical</option></select></label><label>Format label<input name="format" maxLength={80} placeholder="Optional; unverified"/></label><button disabled={busy}>Create deck</button></form></section>
    <div className="deck-picker" aria-label="Your decks">{s.decks.map(d=><button className="secondary" key={d.id} aria-pressed={deck?.id===d.id} onClick={()=>setSelected(d.id)}>{d.name} · {d.mode}</button>)}</div>
    {!s.decks.length&&<section className="panel"><h2>No decks yet</h2><p>A theorycraft deck works even when your inventory is empty.</p></section>}
    {deck&&<DeckEditor key={deck.id} deck={deck} initialCard={params.get('card')??''} initialPrinting={params.get('printing')??''} onDuplicate={setSelected} onExport={()=>{setText(exportDeckText(s,deck.id));setPreview(false);setTextOpen(true);}}/>}
    <details className="panel" open={textOpen} onToggle={e=>setTextOpen(e.currentTarget.open)}><summary>Import / export a text list</summary><p>TSV v1: quantity, section, canonical card UUID, optional eligible printing UUID, separated by tabs. Import always creates a new theorycraft deck, without inventory changes or reservations.</p>
      <label>Deck list<textarea className="deck-text" aria-label="Deck list" value={text} maxLength={100000} onChange={e=>{setText(e.target.value);setPreview(false);}} placeholder={'3\tmain\tcard-uuid\toptional-printing-uuid'}/></label>
      <button className="secondary" onClick={()=>setPreview(true)}>Preview import</button>
      {preview&&<div>{parsed.errors.length?<ul role="alert">{parsed.errors.map((error,i)=><li key={i}>{error}</li>)}</ul>:<><h3>{parsed.lines.length} resolved lines</h3><ul>{parsed.lines.map(l=><li key={`${l.card_id}-${l.section}`}>{l.quantity} × {s.cards.find(c=>c.id===l.card_id)?.name} · {l.section} · {l.printing_id?'Exact printing resolved':'Printing unresolved'}</li>)}</ul></>}
        <form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);const result=await run('import_deck',{name:String(data.get('name')),lines:parsed.lines});if(result.ok&&result.id){setSelected(result.id);setPreview(false);setText('');}}}><label>Imported deck name<input name="name" required maxLength={120}/></label><button disabled={busy||parsed.errors.length>0}>Import as theorycraft</button></form>
      </div>}
    </details></>;
}
function DeckEditor({deck,initialCard,initialPrinting,onDuplicate,onExport}:{deck:Deck;initialCard:string;initialPrinting:string;onDuplicate:(id:string)=>void;onExport:()=>void}) {
  const {s,run,busy}=useWorkspace();const summary=deckSummary(s,deck);const lines=s.lines.filter(l=>l.deck_id===deck.id);
  const [query,setQuery]=useState('');const [card,setCard]=useState(initialCard);const [printing,setPrinting]=useState(initialPrinting);
  const candidates=s.cards.filter(c=>c.id===card||c.name.toLowerCase().includes(query.toLowerCase()));
  const name=s.cards.find(c=>c.id===card)?.name;
  return <section className="deck-editor"><div className="panel"><h2>{deck.name}</h2><p>Inventory: <strong>{summary.inventoryStatus}</strong> · {summary.assigned}/{summary.required} allocated · {summary.missing} {deck.mode==='theorycraft'?'hypothetical missing':'unallocated'}</p><p>Legality: <strong>{deck.legality_status}</strong></p>
    {summary.unresolved>0&&<p className="warning">{summary.unresolved} required copies have no planned printing. Resolve them before calculating exact acquisition demand.</p>}
    <form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('rename_deck',{deck_id:deck.id,name:String(data.get('name')),format:String(data.get('format'))});}}><label>Rename deck<input key={deck.name} name="name" defaultValue={deck.name} required maxLength={120}/></label><label>Format label<input key={deck.format} name="format" defaultValue={deck.format??''} maxLength={80}/></label><button disabled={busy}>Save deck details</button></form>
    <div className="action-row"><button disabled={busy} className="secondary" onClick={()=>void run('set_mode',{deck_id:deck.id,mode:deck.mode==='physical'?'theorycraft':'physical'})}>{deck.mode==='physical'?'Switch to theorycraft & release reservations':'Switch to physical'}</button>
      <button disabled={busy} className="secondary" onClick={async()=>{const result=await run('duplicate_deck',{deck_id:deck.id,name:`${deck.name.slice(0,115)} copy`});if(result.ok&&result.id)onDuplicate(result.id);}}>Duplicate as theorycraft</button>
      <button className="secondary" onClick={onExport}>Export text list</button>
      <button disabled={busy} className="danger" onClick={()=>{if(window.confirm(`Delete "${deck.name}" and release all its reservations?`))void run('delete_deck',{deck_id:deck.id});}}>Delete deck & release reservations</button></div>
  </div>
  <section className="panel"><h3>Add or update a card line</h3><form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('set_line',{deck_id:deck.id,card_id:card,printing_id:printing||null,section:String(data.get('section')).trim(),quantity:Number(data.get('quantity'))});}}>
    <label>Search cards<input type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>Card identity<select value={card} onChange={e=>{setCard(e.target.value);setPrinting('');}} required><option value="">Choose a card</option>{candidates.map(c=><option key={c.id} value={c.id}>{c.name} · {c.id.slice(0,8)}</option>)}</select></label>
    <label>Planned printing<select value={printing} onChange={e=>setPrinting(e.target.value)}><option value="">Unresolved printing</option>{s.printings.filter(p=>p.card_id===card).map(p=><option key={p.id} value={p.id}>{p.set_code} {p.card_number??'?'} · {p.treatment} · {p.language}</option>)}</select></label>
    <label>Section label<input name="section" required maxLength={80} defaultValue="main" placeholder="Descriptive, not verified"/></label><label>Required quantity<input name="quantity" type="number" min="1" step="1" max="2147483647" defaultValue={1} required/></label><button disabled={busy||!card}>Save card line</button>
  </form>{name&&<p className="muted">Adding the same identity and section updates that line; it does not duplicate it.</p>}</section>
  {!lines.length?<section className="panel"><h3>No cards in this deck</h3><p>Add card identities to start planning.</p></section>:lines.map(line=><LineEditor key={`${line.id}-${line.preferred_printing_id}`} deck={deck} line={line}/>)}
  </section>;
}
function LineEditor({deck,line}:{deck:Deck;line:DeckLine}) {
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
