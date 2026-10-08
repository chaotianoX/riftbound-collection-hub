'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWorkspace } from './workspace-context';
import { deckSummary, type Deck } from '@/lib/domain/workspace';
import { ManualLineEditor } from './deck-line-controls';
import { DeckBuilder } from './deck-builder';
import { exportDeckText, parseDeckText } from '@/lib/domain/deck-text';
export function DecksPanel() {
  const {s,run,busy}=useWorkspace();const params=useSearchParams();
  const [selected,setSelected]=useState<string|null>(params.get('deck'));const [text,setText]=useState('');const [preview,setPreview]=useState(false);const [textOpen,setTextOpen]=useState(false);
  const deck=s.decks.find(d=>d.id===(selected??s.decks[0]?.id))??s.decks[0];const parsed=parseDeckText(text,s);
  const create=async (e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const result=await run('create_deck',{name:String(data.get('name')),mode:String(data.get('mode')),format:String(data.get('format'))});if(result.ok&&result.id){setSelected(result.id);form.reset();}};
  return <><header><p className="eyebrow">IDEAS AND PHYSICAL COPIES</p><h1>Deck Builder</h1><p>Plan freely in theorycraft. Physical decks reserve owned copies transactionally.</p></header>
    <p className="warning">Legality is Unverified. Format and section labels do not establish official limits. No deck is marked Ready without verified rules.</p>
    <details className="panel create-deck"><summary>Create a deck</summary><h2>Create a deck</h2><form className="filters" onSubmit={create}><label>Deck name<input name="name" required maxLength={120}/></label><label>Mode<select name="mode" defaultValue="theorycraft"><option value="theorycraft">Theorycraft</option><option value="physical">Physical</option></select></label><label>Format label<input name="format" maxLength={80} placeholder="Optional; unverified"/></label><button disabled={busy}>Create deck</button></form></details>
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
  const {s,run,busy}=useWorkspace();const summary=deckSummary(s,deck);
  return <><details className="panel deck-details"><summary>Deck details & actions</summary>
    <form className="filters" onSubmit={async e=>{e.preventDefault();const data=new FormData(e.currentTarget);await run('rename_deck',{deck_id:deck.id,name:String(data.get('name')),format:String(data.get('format'))});}}><label>Rename deck<input key={deck.name} name="name" defaultValue={deck.name} required maxLength={120}/></label><label>Format label<input key={deck.format} name="format" defaultValue={deck.format??''} maxLength={80}/></label><button disabled={busy}>Save deck details</button></form>
    <div className="action-row"><button disabled={busy} className="secondary" onClick={()=>void run('set_mode',{deck_id:deck.id,mode:deck.mode==='physical'?'theorycraft':'physical'})}>{deck.mode==='physical'?'Switch to theorycraft & release reservations':'Switch to physical'}</button>
      <button disabled={busy} className="secondary" onClick={async()=>{const result=await run('duplicate_deck',{deck_id:deck.id,name:`${deck.name.slice(0,115)} copy`});if(result.ok&&result.id)onDuplicate(result.id);}}>Duplicate as theorycraft</button>
      <button className="secondary" onClick={onExport}>Export text list</button>
      <button disabled={busy} className="danger" onClick={()=>{if(window.confirm(`Delete "${deck.name}" and release all its reservations?`))void run('delete_deck',{deck_id:deck.id});}}>Delete deck & release reservations</button></div>
    <ManualLineEditor deck={deck} initialCard={initialCard} initialPrinting={initialPrinting}/>
  </details><DeckBuilder deck={deck} initialCard={initialCard} initialPrinting={initialPrinting}/>
  {summary.unresolved>0&&<p className="muted">Resolve planned printings to calculate exact acquisition demand.</p>}</>;
}
