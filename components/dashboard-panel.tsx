'use client';
import Link from 'next/link';
import { useWorkspace } from './workspace-context';
import { dashboard } from '@/lib/domain/workspace';
export function DashboardPanel() {
  const {s}=useWorkspace();const d=dashboard(s);
  const realSources=s.sources.filter(source=>!source.is_fixture).sort((a,b)=>b.retrieved_at.localeCompare(a.retrieved_at));
  return <><header><p className="eyebrow">YOUR COLLECTION WORKSPACE</p><h1>Your cards. Your plans.</h1><p>Collection progress and physical availability from the same inventory.</p></header>
    <section className="summary-grid" aria-label="Collection metrics">{[
      ['Owned copies',d.owned,'/collection?ownership=owned'],['Distinct cards',d.distinct,'/collection?ownership=owned'],['Missing masterset copies',d.missing,'/masterset?ownership=missing'],['Wishlist remaining copies',d.wishlistDeficit,'/wishlist'],['Reserved copies',d.reserved,'/decks'],['Saved wishlist entries',d.wishlistCount,'/wishlist']
    ].map(([label,value,href])=><Link className="panel metric" key={String(label)} href={String(href)}><span>{label}</span><strong>{value}</strong></Link>)}</section>
    {!s.printings.length&&<section className="panel"><h2>No cards available</h2><p>Your catalog has no eligible editions. Import a verified source or explicitly use TEST ONLY local fixtures.</p></section>}
    <section className="panel"><h2>Mastersets by set</h2><div className="summary-grid">{d.sets.map(set=><Link href={`/masterset?set=${set.id}`} className="set-summary" key={set.id}><h3>{set.code} · {set.name}</h3><p>{set.progress.completion===null?'Completion not defined':`${set.progress.completion.toFixed(1)}% complete`}</p><p>{set.progress.covered} / {set.progress.total} confirmed copies · {set.progress.missing} missing</p>{set.progress.unresolved>0&&<p>{set.progress.unresolved} pending targets</p>}</Link>)}</div></section>
    <section className="panel"><h2>Physical decks</h2>{!d.physical.length?<p>No physical decks yet. <Link href="/decks">Create a deck</Link>.</p>:d.physical.map(deck=><Link className="deck-summary" href={`/decks?deck=${deck.id}`} key={deck.id}><strong>{deck.name}</strong><span>Inventory: {deck.inventoryStatus} · {deck.assigned}/{deck.required} allocated · {deck.missing} missing</span><span>Legality: {deck.legality_status}</span></Link>)}</section>
    <section className="panel"><h2>Catalog and rules status</h2><p>Catalog source retrieval: {realSources.length?new Date(realSources[0].retrieved_at).toLocaleString('en-US',{timeZone:'UTC'})+' UTC':'No official or authorized source retrieval recorded'}</p><p>Catalog sync job: Not configured</p><p>Rules snapshot: Not configured · Rules sync: Not configured</p><p className="muted">A source retrieval date is not an automatic sync or rules effective date.</p></section></>;
}
