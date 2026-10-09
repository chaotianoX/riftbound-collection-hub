import type pg from 'pg';
import { digest, httpsUrl, sourceUrl, stableId, type ImportPlan, type Review } from './normalize';
export type VerifiedImage={url:string;width:number;height:number;checksum:string};
export type Receipt={version:string;checksum:string;retrievedAt:string;reviewChecksum:string};

// Administrative CLI only. No public RPC and no browser service-role credential.
export async function publishCatalog(db:pg.Client,plan:ImportPlan,review:Review,receipt:Receipt,images:Map<string,VerifiedImage>,failedImages:Set<string>=new Set()):Promise<{published:number;retained:number}> {
  if((images.size || failedImages.size) && !review.images)throw new Error('Artwork authorization review is required.');
  for(const [key,image] of images){
    const candidate=plan.cards.find(c=>c.key===key);
    if(!candidate || candidate.imageUrl!==image.url || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width<=0 || image.height<=0 || !/^[a-f0-9]{64}$/.test(image.checksum))throw new Error('Invalid reviewed image metadata.');
    httpsUrl(image.url,review.images!.hosts);
  }
  if(!plan.cards.length)throw new Error('Refusing an empty catalog publication.');
  await db.query('begin isolation level read committed');
  try {
    // SHARE locks permit all readers and serialize catalog writers. Personal
    // mutation functions take their first write on collection_entries/decks;
    // this order is fixed across imports and prevents eligibility TOCTOU.
    await db.query("set local lock_timeout='10s'");
    await db.query('select pg_advisory_xact_lock(807410081)');
    await db.query('lock table public.collection_entries, public.decks, public.wishlist_entries, public.deck_cards, public.deck_allocations in share row exclusive mode');
    await db.query('lock table public.catalog_sources, public.sets, public.cards, public.card_printings, public.products, public.product_contents, public.card_images, private.catalog_import_keys in share row exclusive mode');
    const fixtures=await db.query('select 1 from public.catalog_sources where is_fixture limit 1');
    if(fixtures.rowCount)throw new Error('Refusing to mix TEST ONLY fixtures with the real catalog. Use a separate project.');
    const unmanaged=await db.query('select 1 from public.card_printings p left join private.catalog_import_keys k on k.printing_id=p.id where k.printing_id is null limit 1');
    if(unmanaged.rowCount)throw new Error('Existing catalog identities require explicit adoption before this provider can publish.');
    const version=`${receipt.version}:${receipt.checksum}:${receipt.reviewChecksum}`;
    const sid=stableId('source',version);
    const previous=await db.query('select checksum from public.catalog_sources where url=$1 and version=$2',[sourceUrl,version]);
    if(previous.rowCount && previous.rows[0].checksum!==receipt.checksum)throw new Error('An immutable catalog version changed.');
    await db.query(`insert into public.catalog_sources(id,url,version,retrieved_at,checksum,usage_notes,official_verified,is_fixture)
      values($1,$2,$3,$4,$5,$6,false,false) on conflict(url,version) do nothing`,[sid,sourceUrl,version,receipt.retrievedAt,receipt.checksum,`Community mirror selected by owner; not official verification. Code MIT; card data © Riot Games. Review SHA-256: ${receipt.reviewChecksum}. Artwork authorization: ${review.images?.reference??'Not reviewed; placeholders only'}`]);
    const sets=new Map<string,string>();
    for(const s of plan.sets){
      const result=await db.query(`insert into public.sets(id,code,name,sort_order,released_on,source_id) values($1,$2,$3,$4,$5,$6)
        on conflict(code) do update set name=excluded.name,sort_order=excluded.sort_order,released_on=excluded.released_on,source_id=excluded.source_id returning id`,[stableId('set',s.code),s.code,s.name,s.order,s.releasedOn,sid]);sets.set(s.code,result.rows[0].id);
    }
    for(const c of plan.cards){
      const cardId=stableId('card',c.canonicalKey);const printingId=stableId('printing',c.key);
      const key=await db.query('select card_id from private.catalog_import_keys where card_code=$1',[c.key]);
      if(key.rowCount && key.rows[0].card_id!==cardId)throw new Error('A reviewed identity changed; reconcile explicitly before publishing.');
      const existing=await db.query('select card_id,treatment from public.card_printings where id=$1',[printingId]);
      if(existing.rowCount && (existing.rows[0].card_id!==cardId || existing.rows[0].treatment!==c.treatment))throw new Error('Printing identity/treatment changed; explicit reconciliation is required.');
      await db.query(`insert into public.cards(id,name,card_type,domains,attributes,collection_category,source_id) values($1,$2,$3,$4,$5,$6,$7)
        on conflict(id) do update set name=excluded.name,card_type=excluded.card_type,domains=excluded.domains,attributes=excluded.attributes,collection_category=excluded.collection_category,source_id=excluded.source_id`,[cardId,c.name,c.type,c.domains,JSON.stringify(c.attributes),c.category,sid]);
      await db.query(`insert into public.card_printings(id,card_id,set_id,card_number,language,rarity,variant,treatment,printed_text,source_id,previewed)
        values($1,$2,$3,$4,'en',$5,'standard',$6,$7,$8,$9)
        on conflict(id) do update set card_number=excluded.card_number,rarity=excluded.rarity,printed_text=excluded.printed_text,source_id=excluded.source_id,previewed=excluded.previewed`,[printingId,cardId,sets.get(c.setCode),c.number,c.rarity,c.treatment,c.printedText,sid,c.previewed]);
      await db.query(`insert into private.catalog_import_keys(card_code,canonical_key,card_id,printing_id) values($1,$2,$3,$4) on conflict(card_code) do nothing`,[c.key,c.canonicalKey,cardId,printingId]);
      const image=images.get(c.key);
      await db.query(`insert into public.card_images(printing_id,authorized_url,source_id,usage_verified,checksum,width,height,state)
        values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(printing_id) do update set authorized_url=excluded.authorized_url,storage_key=null,source_id=excluded.source_id,usage_verified=excluded.usage_verified,checksum=excluded.checksum,width=excluded.width,height=excluded.height,state=excluded.state`,[printingId,image?.url??null,sid,!!image,image?.checksum??null,image?.width??null,image?.height??null,image?'ready':failedImages.has(c.key)?'error':'pending']);
    }
    if(review.provingGrounds){
      const p=review.provingGrounds;const psid=stableId('pg-source',`${p.sourceUrl}/${p.version}/${p.checksum}`);
      await db.query(`insert into public.catalog_sources(id,url,version,retrieved_at,checksum,usage_notes,official_verified,is_fixture) values($1,$2,$3,$4,$5,'Administratively reviewed complete official Proving Grounds checklist',true,false) on conflict(url,version) do nothing`,[psid,p.sourceUrl,p.version,receipt.retrievedAt,p.checksum]);
      const productId=stableId('product','proving-grounds');
      const product=await db.query(`insert into public.products(id,code,name,is_proving_grounds,checklist_verified,source_id) values($1,'PG','Proving Grounds',true,true,$2)
        on conflict(code) do update set checklist_verified=true,source_id=excluded.source_id returning id`,[productId,psid]);
      const pid=product.rows[0].id;
      // Do not delete prior product memberships: changed complete composition
      // requires explicit reconciliation instead of changing existing goals.
      const old=await db.query('select printing_id from public.product_contents where product_id=$1',[pid]);
      const ids=new Set(p.contents.map(x=>stableId('printing',x.cardCode)));
      if(old.rows.some(x=>!ids.has(x.printing_id)))throw new Error('Official product composition changed; reconcile before publishing.');
      for(const item of p.contents)await db.query(`insert into public.product_contents(product_id,printing_id,published_quantity,source_id) values($1,$2,$3,$4)
        on conflict(product_id,printing_id) do update set published_quantity=excluded.published_quantity,source_id=excluded.source_id`,[pid,stableId('printing',item.cardCode),item.quantity,psid]);
    }
    const old=await db.query('select card_code from private.catalog_import_keys');
    const current=new Set(plan.cards.map(c=>c.key));const retained=old.rows.filter(x=>!current.has(x.card_code)).length;
    // Publication never deletes cards absent from a scrape or updates quantities.
    // Existing eligibility/inventory/wishlist constraint triggers run at COMMIT.
    await db.query('set constraints all immediate');
    await db.query('commit');return {published:plan.cards.length,retained};
  } catch(error){await db.query('rollback');throw error;}
}
export function reviewChecksum(review:Review):string {return digest(JSON.stringify(review));}
