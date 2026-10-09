'use client';
import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type KeyboardCoordinateGetter, type CollisionDetection } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useWorkspace } from './workspace-context';
import { CardImage } from './card-image';
import { LineEditor } from './deck-line-controls';
import { collectionRows, deckSummary, paginate, type CollectionRow, type Deck, type DeckLine, type Snapshot } from '@/lib/domain/workspace';
import { accepts, addPayload, categories, categoryOf, costOf, initialLibraryFilters, libraryRows, orderedLines, sections, type LibraryFilters } from '@/lib/domain/deck-builder';

type DragCard = { kind:'library'; printingId:string; cardId:string; type:string|null; name:string } | { kind:'line'; lineId:string; cardId:string; section:string; type:string|null; name:string };
const keyboardSections: KeyboardCoordinateGetter = (event,{context}) => {
  if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.code)) return;
  event.preventDefault();
  const card = context.active?.data.current as DragCard | undefined;
  if (!card) return;
  const targets = context.droppableContainers.getEnabled().filter(c => c.data.current?.kind === 'section' && accepts(card.type,c.data.current.section));
  if (!targets.length) return;
  const current = targets.findIndex(c => c.data.current?.section === context.over?.data.current?.section);
  const step = event.code === 'ArrowUp' || event.code === 'ArrowLeft' ? -1 : 1;
  const next = targets[(current+step+targets.length)%targets.length];
  // Destinations can be inside the other independently scrolling panel.
  const node=next?.node.current;
  node?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  const rect=node?.getBoundingClientRect()??(next && context.droppableRects.get(next.id));
  return rect ? {x:rect.left+(rect.width-(context.collisionRect?.width ?? 0))/2,y:rect.top+(rect.height-(context.collisionRect?.height ?? 0))/2} : undefined;
};
// Library drags target sections; deck-line drags retain sortable line targets.
const deckCollisions:CollisionDetection=incoming=>{
  const args=incoming.active.data.current?.kind==='library'
    ?{...incoming,droppableContainers:incoming.droppableContainers.filter(c=>c.data.current?.kind==='section')}:incoming;
  const hits=pointerWithin(args);
  const lineHits=hits.filter(hit=>args.droppableContainers.find(c=>c.id===hit.id)?.data.current?.kind==='line');
  return lineHits.length?lineHits:hits.length?hits:args.pointerCoordinates?rectIntersection(args):closestCenter(args);
};
function Artwork({s,printingId,name}:{s:Snapshot;printingId:string|null;name:string}) {
  const image = s.images.find(i => i.printing_id === printingId);
  return <CardImage name={name} metadata={image ? {state:image.state,usageVerified:image.usage_verified,authorizedUrl:image.authorized_url,checksum:image.checksum} : null}/>;
}

export function DeckBuilder({deck,initialCard='',initialPrinting=''}:{deck:Deck;initialCard?:string;initialPrinting?:string}) {
  const {s,run,busy,saveState='idle'} = useWorkspace();
  const [filters,setFilters] = useState<LibraryFilters>(() => ({...initialLibraryFilters,query:s.cards.find(c => c.id === initialCard)?.name ?? ''}));
  const [page,setPage] = useState(1);
  const [view,setView] = useState<'library'|'deck'>('library');
  const [destination,setDestination] = useState('');
  const [sort,setSort] = useState('manual');
  const [active,setActive] = useState<DragCard|null>(null);
  const [feedback,setFeedback] = useState<{ok:boolean;message:string}|null>(null);
  const sensors = useSensors(useSensor(PointerSensor,{activationConstraint:{distance:8}}),useSensor(TouchSensor,{activationConstraint:{delay:220,tolerance:8}}),useSensor(KeyboardSensor,{coordinateGetter:keyboardSections}));
  const rows = useMemo(() => libraryRows(s,filters),[s,filters]);
  const catalog = useMemo(() => collectionRows(s),[s]);
  const paged = paginate(rows,page,24);
  const lines = s.lines.filter(l => l.deck_id === deck.id);
  const summary = deckSummary(s,deck);
  // Existing descriptive/custom sections remain visible. Optional sections are
  // shown only when already present; their presence does not establish legality.
  const displayedSections = [...sections,...[...new Set(lines.map(l => l.section))].filter(id => !sections.some(section => section.id === id)).map(id => ({id,label:id === 'sideboard'?'Sideboard':id === 'bench'?'Bench':id}))];
  const updateFilters = (change:Partial<LibraryFilters>) => {setFilters(f => ({...f,...change}));setPage(1);};
  const reportError = (message:string) => setFeedback({ok:false,message});
  async function save(action:string,payload:Record<string,unknown>,message:string) {
    if (busy) return;
    setFeedback(null);
    const result = await run(action,payload);
    setFeedback({ok:result.ok,message:result.ok?message:result.message});
  }
  async function add(row:CollectionRow,section:string) {
    try {await save('set_line',addPayload(s,deck.id,row.id,section),`Added one ${row.name} to ${section}.`);} catch(error) {reportError(error instanceof Error?error.message:'Unable to add this card.');}
  }
  async function changeQuantity(line:DeckLine,quantity:number) {
    await save('set_line',{deck_id:deck.id,card_id:line.card_id,section:line.section,quantity},quantity?`Quantity saved: ${quantity}.`:'Card removed.');
  }
  async function move(line:DeckLine,section:string) {
    const card = s.cards.find(c => c.id === line.card_id);
    if (!accepts(card?.card_type ?? null,section)) {reportError('This card category cannot be moved to that section.');return;}
    await save('move_line',{deck_card_id:line.id,section},`Moved ${card?.name ?? 'card'} to ${section}.`);
  }
  async function reorder(section:string,ids:string[]) {
    await save('reorder_lines',{deck_id:deck.id,section,line_ids:ids},'Display order saved.');
  }
  async function drop(event:DragEndEvent) {
    setActive(null);
    const card = event.active.data.current as DragCard | undefined;
    const target = event.over?.data.current;
    if (!card || !target || busy) return;
    const section = target.section as string;
    if (card.kind === 'line' && target.kind === 'line' && section === card.section) {
      if (sort !== 'manual') {reportError('Choose Custom order before rearranging cards.');return;}
      const list = orderedLines(lines.filter(l => l.section === section),s,'manual');
      const from = list.findIndex(l => l.id === card.lineId), to = list.findIndex(l => l.id === target.lineId);
      if (from >= 0 && to >= 0 && from !== to) await reorder(section,arrayMove(list,from,to).map(l => l.id));
      return;
    }
    if (!accepts(card.type,section)) {reportError('Invalid destination: this card category does not belong in that section.');return;}
    if (card.kind === 'library') {const row = catalog.find(r => r.id === card.printingId);if (row) await add(row,section);}
    else {const line = lines.find(l => l.id === card.lineId);if (line && line.section !== section) await move(line,section);}
  }
  const selectedNames = (section:string) => lines.filter(l => l.section === section).map(l => s.cards.find(c => c.id === l.card_id)?.name ?? 'Unknown card').join(', ') || 'Not selected';
  const unique = (key:'card_type'|'rarity') => [...new Set(catalog.map(r => r[key]).filter((x):x is string => !!x))].sort();
  const costs = [...new Set(s.cards.map(c => costOf(s,c.id)).filter((x):x is number => x !== null))].sort((a,b) => a-b);
  return <DndContext sensors={sensors} collisionDetection={deckCollisions} onDragStart={e => {setFeedback(null);setActive(e.active.data.current as DragCard);}} onDragCancel={() => setActive(null)} onDragEnd={e => void drop(e)} accessibility={{screenReaderInstructions:{draggable:'Press Space to pick up a card. Use arrow keys to choose a valid deck section, Space to drop, or Escape to cancel. Quick-add and Move to controls are also available.'},announcements:{onDragStart:({active})=>`Picked up ${active.data.current?.name ?? 'card'}.`,onDragOver:({over})=>over?`Over ${over.data.current?.section ?? 'deck'}.`:'Outside deck sections.',onDragEnd:()=> 'Drop finished. Check the save status for confirmation.',onDragCancel:()=> 'Drag cancelled. No changes saved.'}}}>
    <div className="builder-mobile-tabs" role="group" aria-label="Deck builder view"><button type="button" aria-pressed={view==='library'} onClick={() => setView('library')}>Library</button><button type="button" aria-pressed={view==='deck'} onClick={() => setView('deck')}>Deck · {summary.required}</button></div>
    {feedback && <div className={`builder-feedback ${feedback.ok?'success':'failure'}`} role={feedback.ok?'status':'alert'}>{feedback.message}{!feedback.ok && <span> Your last confirmed deck remains visible. Review allocation or printing controls, then retry the action.</span>}</div>}
    <div className="deck-builder" data-mobile-view={view}>
      <section className="builder-library builder-panel" aria-labelledby="library-heading">
        <div className="builder-panel-head"><div><p className="eyebrow">EXPLORE YOUR CATALOG</p><h2 id="library-heading">Card library <span className="count">{paged.total}</span></h2></div><p className="muted">Drag a handle or tap + Add</p></div>
        <div className="library-controls"><label>Search cards<input type="search" placeholder="Name or CARD #" value={filters.query} onChange={e => updateFilters({query:e.target.value})}/></label>
          <div className="library-categories" role="group" aria-label="Card categories">{categories.map(c => <button type="button" key={c.id} aria-pressed={filters.category===c.id} onClick={() => updateFilters({category:c.id})}>{c.label==='Chosen Champion'?'Champion':c.label}</button>)}</div>
          <details className="library-filter-details"><summary>Filters · {[filters.set,filters.domain,filters.cost,filters.type,filters.rarity,filters.owned,filters.available].filter(Boolean).length} active</summary><div className="library-filters">
            <label>Set<select value={filters.set} onChange={e => updateFilters({set:e.target.value})}><option value="">All sets</option>{s.sets.map(set => <option key={set.id} value={set.id}>{set.code} · {set.name}</option>)}</select></label>
            <label>Domain<select value={filters.domain} onChange={e => updateFilters({domain:e.target.value})}><option value="">All domains</option>{[...new Set(catalog.flatMap(r => r.domains))].sort().map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Cost<select value={filters.cost} onChange={e => updateFilters({cost:e.target.value})}><option value="">All costs</option>{costs.map(x => <option key={x} value={x}>{x}</option>)}<option value="unknown">Unknown cost</option></select></label>
            <label>Card type<select value={filters.type} onChange={e => updateFilters({type:e.target.value})}><option value="">All types</option>{unique('card_type').map(x => <option key={x}>{x}</option>)}</select></label>
            <label>Rarity<select value={filters.rarity} onChange={e => updateFilters({rarity:e.target.value})}><option value="">All rarities</option>{unique('rarity').map(x => <option key={x}>{x}</option>)}</select></label>
          </div><p className="muted">Unknown costs stay unknown; filters use catalog metadata.</p></details>
          <div className="library-ownership"><label><input type="checkbox" checked={filters.owned} onChange={e => updateFilters({owned:e.target.checked})}/>Owned only</label><label><input type="checkbox" checked={filters.available} onChange={e => updateFilters({available:e.target.checked})}/>Available only</label><button type="button" className="secondary" onClick={() => {setFilters({...initialLibraryFilters});setPage(1);}}>Reset filters</button></div>
          <label>Quick-add destination<select value={destination} onChange={e => setDestination(e.target.value)}><option value="">Matching category</option>{displayedSections.map(x => <option value={x.id} key={x.id}>{x.label}</option>)}</select></label>
        </div>
        <div className="library-scroll"><div className="library-gallery">{paged.rows.map(row => <LibraryCard key={row.id} row={row} s={s} disabled={busy} destination={destination || categoryOf(row.card_type) || ''} preferred={row.id===initialPrinting} onAdd={section => void add(row,section)}/>)}</div>
          {!paged.total && <div className="builder-empty"><h3>{catalog.length?'No matching cards':'No eligible catalog cards'}</h3><p>{catalog.length?'Adjust your filters to explore more cards.':'Load an authorized normalized catalog to start building.'}</p></div>}
          <div className="pager"><span>{paged.total} printings · Page {paged.current} / {paged.pages}</span><div><button type="button" className="secondary" disabled={paged.current<=1} onClick={() => setPage(paged.current-1)}>Previous cards</button><button type="button" className="secondary" disabled={paged.current>=paged.pages} onClick={() => setPage(paged.current+1)}>Next cards</button></div></div>
        </div>
      </section>
      <section className="builder-editor builder-panel" aria-labelledby="deck-heading">
        <div className="builder-panel-head"><div><p className="eyebrow">YOUR DECK</p><h2 id="deck-heading">{deck.name}</h2></div><span className="deck-mode">{deck.mode==='physical'?'Physical':'Theorycraft'}</span></div>
        <div className="deck-overview"><div className="deck-selections"><p>Legend <strong>{selectedNames('legend')}</strong></p><p>Champion <strong>{selectedNames('champion')}</strong></p></div>
          <div className="deck-status-grid"><p>Inventory <strong>{summary.inventoryStatus}</strong></p><p>Legality <strong>{deck.legality_status}</strong></p><p>{deck.mode==='physical'?'Unallocated':'Hypothetical missing'} <strong>{summary.missing} copies</strong></p><p role="status">Autosave <strong>{({idle:'Up to date',saving:'Saving…',refreshing:'Refreshing…',saved:'Saved',error:'Save failed'})[saveState]}</strong></p></div>
          <p className="muted">{summary.assigned}/{summary.required} allocated · {summary.unresolved} copies with unresolved printings</p>
          <p className="inventory-explanation">{deck.mode==='physical'?'Choose an exact printing and explicitly allocate copies below. Adding a card never reserves inventory.':'No inventory required. This deck never reserves physical copies.'}</p>
          <label>Display order<select value={sort} onChange={e => setSort(e.target.value)}><option value="manual">Custom order</option><option value="name">Name</option><option value="cost">Cost, then name</option></select></label>
        </div>
        <div className="editor-scroll">{displayedSections.map(section => {
          const sectionLines = orderedLines(lines.filter(l => l.section===section.id),s,sort);
          return <DeckSection key={section.id} section={section.id} label={section.label} count={sectionLines.reduce((n,l) => n+l.quantity,0)} active={active}>
            <SortableContext items={sectionLines.map(l => `line:${l.id}`)} strategy={verticalListSortingStrategy}>{sectionLines.map((line,index) => <DeckCard key={line.id} line={line} deck={deck} s={s} disabled={busy} sectionOptions={displayedSections} onQuantity={quantity => void changeQuantity(line,quantity)} onMove={section => void move(line,section)} onOrder={step => {const next=arrayMove(sectionLines,index,index+step).map(l => l.id);void reorder(section.id,next);}} canUp={sort==='manual'&&index>0} canDown={sort==='manual'&&index<sectionLines.length-1}/>)}</SortableContext>
            {!sectionLines.length && <p className="section-empty">Drop {section.label.toLowerCase()} cards here, or use + Add in the library.</p>}
          </DeckSection>;
        })}<p className="muted section-note">Section labels organize your deck. Counts do not verify official format limits.</p></div>
      </section>
    </div>
    <DragOverlay dropAnimation={{duration:180,easing:'ease-out'}}>{active && <div className="card-drag-overlay"><Artwork s={s} printingId={active.kind==='library'?active.printingId:lines.find(l => l.id===active.lineId)?.preferred_printing_id ?? null} name={active.name}/><strong>{active.name}</strong><span>{active.kind==='library'?'+1 copy':'Move line'}</span></div>}</DragOverlay>
  </DndContext>;
}

function LibraryCard({row,s,disabled,destination,preferred,onAdd}:{row:CollectionRow;s:Snapshot;disabled:boolean;destination:string;preferred:boolean;onAdd:(section:string)=>void}) {
  const data:DragCard={kind:'library',printingId:row.id,cardId:row.card_id,type:row.card_type,name:row.name};
  const {attributes,listeners,setNodeRef,isDragging} = useDraggable({id:`library:${row.id}`,data,disabled});
  const valid = accepts(row.card_type,destination);
  return <article ref={setNodeRef} className={`library-card ${isDragging?'dragging':''} ${preferred?'preferred-printing':''}`} data-testid="library-card">
    <div className="library-art"><Artwork s={s} printingId={row.id} name={row.name}/><button type="button" className="drag-handle" {...attributes} {...listeners} disabled={disabled} aria-label={`Drag ${row.name}, ${row.set_code} ${row.card_number ?? '?'}`}>⠿</button></div>
    <div className="library-card-body"><h3>{row.name}</h3>{row.previewed&&<span className="badge">Previewed · Unreleased</span>}<p className="card-meta">{row.set_code} {row.card_number ?? '?'} · {row.rarity ?? 'Unknown rarity'}</p><p className="printing-meta">{row.treatment} · {row.language} · {row.card_type ?? 'Unknown type'}</p><p className="library-counts">Owned <b>{row.owned}</b> · Reserved <b>{row.reserved}</b> · Available <b>{row.available}</b></p>
      <button type="button" className="quick-add" disabled={disabled||!valid} aria-label={`Add ${row.name}, ${row.set_code} ${row.card_number ?? '?'} to ${destination || 'deck'}`} onClick={() => onAdd(destination)}>+ Add{valid?` to ${destination}`:''}</button>{!valid && <small>Choose a matching category. Unknown types require catalog resolution.</small>}
    </div>
  </article>;
}
function DeckSection({section,label,count,active,children}:{section:string;label:string;count:number;active:DragCard|null;children:React.ReactNode}) {
  const {setNodeRef,isOver} = useDroppable({id:`section:${section}`,data:{kind:'section',section}});
  const valid = !!active && accepts(active.type,section);
  return <section ref={setNodeRef} className={`deck-drop-section ${valid?'valid-drop':''} ${isOver?'drop-over':''} ${active&&!valid?'invalid-drop':''}`} data-testid={`deck-section-${section}`} aria-label={`${label} section`}>
    <header><h3>{label}</h3><span>{count} {count===1?'card':'cards'}</span>{active && <small>{valid?'Can drop here':'Category does not match'}</small>}</header>{children}
  </section>;
}
function DeckCard({line,deck,s,disabled,sectionOptions,onQuantity,onMove,onOrder,canUp,canDown}:{line:DeckLine;deck:Deck;s:Snapshot;disabled:boolean;sectionOptions:{id:string;label:string}[];onQuantity:(n:number)=>void;onMove:(section:string)=>void;onOrder:(step:number)=>void;canUp:boolean;canDown:boolean}) {
  const card = s.cards.find(c => c.id === line.card_id);
  const name = card?.name ?? 'Unknown card';
  const data:DragCard={kind:'line',lineId:line.id,cardId:line.card_id,section:line.section,type:card?.card_type ?? null,name};
  const {setNodeRef,attributes,listeners,transform,transition,isDragging} = useSortable({id:`line:${line.id}`,data,disabled});
  const assigned = s.allocations.filter(a => a.deck_card_id===line.id).reduce((n,a) => n+a.quantity,0);
  return <article ref={setNodeRef} className={`builder-deck-card ${isDragging?'dragging':''}`} style={{transform:CSS.Transform.toString(transform),transition}} data-testid="builder-deck-card">
    <div className="deck-card-row"><button type="button" className="drag-handle" {...attributes} {...listeners} disabled={disabled} aria-label={`Drag deck line ${name}`}>⠿</button><div className="deck-thumbnail"><Artwork s={s} printingId={line.preferred_printing_id} name={name}/></div><div className="deck-card-name"><strong>{name}</strong>{s.printings.find(p=>p.id===line.preferred_printing_id)?.previewed&&<span className="badge">Previewed · Unreleased</span>}<small>{line.preferred_printing_id ? s.printings.filter(p => p.id===line.preferred_printing_id).map(p => `${p.set_code} ${p.card_number ?? '?'}`).join('') : 'Printing unresolved'}</small><small>{deck.mode==='physical'?`${assigned}/${line.quantity} allocated · ${line.quantity-assigned} unallocated`:'No physical reservation'}</small></div>
      <div className="line-quantity"><button type="button" disabled={disabled} className="secondary" aria-label={`Decrease ${name}`} onClick={() => onQuantity(line.quantity-1)}>−</button><output aria-label={`${name} quantity`}>{line.quantity}</output><button type="button" disabled={disabled||line.quantity>=2147483647} className="secondary" aria-label={`Increase ${name}`} onClick={() => onQuantity(line.quantity+1)}>+</button></div>
    </div>
    <details className="line-controls"><summary>Printing, allocation & actions</summary><div className="line-tools"><label>Move to<select value={line.section} disabled={disabled} onChange={e => onMove(e.target.value)}>{sectionOptions.filter(x => x.id===line.section || accepts(card?.card_type ?? null,x.id)).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><button type="button" className="secondary" disabled={disabled||!canUp} onClick={() => onOrder(-1)}>Move up</button><button type="button" className="secondary" disabled={disabled||!canDown} onClick={() => onOrder(1)}>Move down</button><button type="button" className="danger" disabled={disabled} onClick={() => onQuantity(0)}>Remove {name}</button></div>
      {assigned>0 && <p className="warning">Release reservations before reducing below {assigned}, removing, or moving this line.</p>}<LineEditor deck={deck} line={line}/>
    </details>
  </article>;
}
