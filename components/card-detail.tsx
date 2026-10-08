'use client';
import Link from 'next/link';
import { useWorkspace } from './workspace-context';
import { collectionRows } from '@/lib/domain/workspace';
import { PrintingArt, CardFacts, OwnedForm } from './collection-panel';
export function CardDetail({id}:{id:string}) {
  const {s,run,busy}=useWorkspace();const row=collectionRows(s).find(r=>r.id===id);
  if(!row)return <section className="panel"><h1>Card not available</h1><p>This printing is absent or is not eligible.</p><Link href="/collection">Back to collection</Link></section>;
  const products=s.contents.filter(c=>c.printing_id===row.id).map(c=>({content:c,product:s.products.find(p=>p.id===c.product_id)}));
  const allocations=s.allocations.filter(a=>a.collection_entry_id===row.entryId).map(a=>({a,line:s.lines.find(l=>l.id===a.deck_card_id)}));
  return <><Link href="/collection">← Collection</Link><h1>{row.name}</h1><div className="workspace"><section className="panel"><PrintingArt row={row}/><CardFacts row={row}/><OwnedForm row={row}/><div className="action-row"><button className="secondary" disabled={busy||!row.missing} onClick={()=>void run('add_wishlist_reason',{printing_id:row.id,reason:'Masterset'})}>Add missing to wishlist</button><Link href={`/decks?card=${row.card_id}&printing=${row.id}`}>Use in a deck</Link></div></section>
    <section className="panel"><h2>Printed text</h2><p className="printed-text">{row.printed_text??'Printed text is unavailable.'}</p><h2>Effective text and errata</h2><p>Official errata ingestion is not configured. Effective text is unverified.</p><h2>Edition provenance</h2><p>{row.is_fixture?'TEST ONLY fixture; not Riot evidence':row.eligibility_basis}</p><p>Source version: {row.source_version}</p><a href={row.source_url} target="_blank" rel="noreferrer">Source reference</a><h2>Product membership</h2>{products.length?products.map(({content,product})=><p key={content.product_id}>{product?.name??'Unknown product'} · Published box quantity: {content.published_quantity??'Unknown'} · Checklist {product?.checklist_verified?'reviewed':'unverified'}</p>):<p>No product membership recorded.</p>}
    <h2>Allocated copies</h2>{allocations.length?allocations.map(({a,line})=><p key={a.id}>{s.decks.find(d=>d.id===line?.deck_id)?.name??'Deck'} · {line?.section} · {a.quantity} copies</p>):<p>No copies reserved.</p>}</section></div></>;
}
