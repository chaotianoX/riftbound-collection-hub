import { readFile, writeFile, stat } from 'node:fs/promises';
import { download, imageInfo } from '../lib/catalog/download';
import { buildPlan, digest, httpsUrl, repository, validateReview } from '../lib/catalog/normalize';
import { publishCatalog, reviewChecksum, type VerifiedImage } from '../lib/catalog/publish';

const args=process.argv.slice(2);
function option(name:string):string|undefined {const i=args.indexOf(name);if(i<0)return;const value=args[i+1];if(!value || value.startsWith('--'))throw new Error(`Missing ${name} value.`);return value;}
const permitted=new Set(['--file','--version','--sha256','--review','--report','--publish','--partial']);
for(let i=0;i<args.length;i++){if(!permitted.has(args[i]))throw new Error('Unknown catalog option.');if(!['--publish','--partial'].includes(args[i]))i++;}
const review=validateReview(JSON.parse(await readFile(option('--review')??'config/catalog-review.json','utf8')));
const publishing=args.includes('--publish');
let db:import('pg').Client|undefined;let runId:string|undefined;
let stage='configuration';let committed=false;
try {
  if(publishing){
    const url=process.env.CATALOG_DATABASE_URL;
    if(!url)throw new Error('Configure CATALOG_DATABASE_URL in the administrative environment.');
    // Keep privileged credentials out of the Next.js runtime. Remote connections
    // must verify their TLS peer; use the Supabase direct/pooler certificate chain.
    const target=new URL(url);if(!['postgres:','postgresql:'].includes(target.protocol))throw new Error('Expected a PostgreSQL administrative connection.');const local=['localhost','127.0.0.1','[::1]'].includes(target.hostname);
    if(!local && target.searchParams.get('sslmode')!=='verify-full')throw new Error('Remote administrative databases require sslmode=verify-full.');
    const {default:pg}=await import('pg');db=new pg.Client({connectionString:url});await db.connect();
    const run=await db.query("insert into public.catalog_sync_runs(status) values('running') returning id");runId=run.rows[0].id;
  }
  stage='snapshot download';
  let version=option('--version');let expected=option('--sha256');let bytes:Uint8Array;
  const file=option('--file');
  if(file){
    stage='snapshot verification';
  if(!version || !expected)throw new Error('Local snapshot requires --version and --sha256 from the pinned release.');
    if((await stat(file)).size>8_000_000)throw new Error('Snapshot exceeds size limit.');
    bytes=await readFile(file);if(bytes.length>8_000_000)throw new Error('Snapshot exceeds size limit.');
  }else{
    if(version && !/^v\d{4}-\d{2}-\d{2}$/.test(version))throw new Error('Expected a dated release version.');
    const url=`https://api.github.com/repos/${repository}/releases/${version?`tags/${version}`:'latest'}`;
    const metadata=JSON.parse(new TextDecoder().decode(await download(url,['api.github.com'],1_000_000,['application/json'])));
    if(metadata.draft || metadata.prerelease || !/^v\d{4}-\d{2}-\d{2}$/.test(metadata.tag_name))throw new Error('Unsupported source release.');
    const asset=metadata.assets?.find((a:{name:string})=>a.name==='cards.json');
    if(!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest) || asset.size>8_000_000)throw new Error('Release needs a cards.json asset with verified SHA-256.');
    const expectedUrl=`https://github.com/${repository}/releases/download/${metadata.tag_name}/cards.json`;
    if(asset.browser_download_url!==expectedUrl)throw new Error('Unexpected release asset location.');
    version=metadata.tag_name;expected=asset.digest.slice(7);
    bytes=await download(expectedUrl,['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'],8_000_000,['application/json','application/octet-stream']);
  }
  stage='snapshot verification';
  if(!version || !/^v\d{4}-\d{2}-\d{2}$/.test(version) || !expected || !/^[a-f0-9]{64}$/.test(expected) || digest(bytes)!==expected)throw new Error('Snapshot checksum/version verification failed.');
  stage='catalog normalization';
  const retrievedAt=new Date().toISOString();const plan=buildPlan(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),review);
  const report={repository,version,checksum:expected,reviewChecksum:reviewChecksum(review),retrievedAt,input:plan.inputCount,included:plan.cards.length,counts:plan.counts,excluded:plan.excluded,unresolved:plan.unresolved,provingGroundsVerified:!!review.provingGrounds,artworkAuthorized:!!review.images};
  if(option('--report'))await writeFile(option('--report')!,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({...report,excluded:plan.excluded.length,unresolved:plan.unresolved.length},null,2));
  if(!publishing){console.log('Preview only: no database or artwork downloads. Use --report to inspect exclusions and unresolved records.');}
  else {
    stage='publication review';
    if(plan.unresolved.length && !args.includes('--partial'))throw new Error('Unresolved records remain. Review the report or explicitly publish --partial with visible incomplete status.');
    if(plan.unresolved.some(x=>x.reason.startsWith('Set ')))throw new Error('Every discovered set must have an explicit sequence before publication.');
    if(review.provingGrounds){
      const source=await download(review.provingGrounds.sourceUrl,['playriftbound.com','riftbound.leagueoflegends.com'],8_000_000,['text/html','application/json','application/pdf']);
      if(digest(source)!==review.provingGrounds.checksum)throw new Error('Official product source changed; review the complete checklist again.');
    }
    stage='artwork staging';
    const images=new Map<string,VerifiedImage>();const failedImages=new Set<string>();let imageErrors=0;
    if(review.images){
      const rights=review.images;
      // Bounded concurrency; all results are staged before the transaction.
      let next=0;
      await Promise.all(Array.from({length:4},async()=>{
        while(next<plan.cards.length){const c=plan.cards[next++];if(!c.imageUrl)continue;
          try{httpsUrl(c.imageUrl,rights.hosts);const data=await download(c.imageUrl,rights.hosts,8_000_000,['image/png','image/jpeg','image/webp']);images.set(c.key,{url:c.imageUrl,...imageInfo(data)});}
          catch{imageErrors++;failedImages.add(c.key);}
        }
      }));
    }
    stage='transactional publication';
    const result=await publishCatalog(db!,plan,review,{version,checksum:expected,retrievedAt,reviewChecksum:report.reviewChecksum},images,failedImages);
    committed=true;stage='sync status';
    await db!.query(`update public.catalog_sync_runs set status=$2,finished_at=now(),version=$3,checksum=$4,counts=$5,unresolved=$6,images_ready=$7,images_failed=$8,retained=$9 where id=$1`,[runId,plan.unresolved.length || imageErrors || result.retained?'partial':'success',version,expected,JSON.stringify(plan.counts),plan.unresolved.length,images.size,imageErrors,result.retained]);
    console.log(`Published ${result.published} editions; ${result.retained} previously imported editions retained. ${images.size} reviewed images ready; ${imageErrors} failed.`);
  }
} catch {
  // Never echo raw driver/fetch errors: connection strings and signed URLs can
  // contain credentials. The previous committed catalog stays available.
  if(db && runId && !committed)await db.query("update public.catalog_sync_runs set status='error',finished_at=now(),error_code='IMPORT_FAILED' where id=$1",[runId]).catch(()=>{});
  console.error(committed?'Catalog published; sync status was not confirmed. Check the administrative connection before retrying.':`Catalog import was not confirmed during ${stage}. Check review, checksum, unresolved report and administrative database configuration. The last committed catalog remains available.`);
  process.exitCode=1;
} finally {if(db)await db.end();}
