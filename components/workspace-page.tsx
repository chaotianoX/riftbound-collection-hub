import Link from 'next/link';
import { loadWorkspace } from '@/lib/server/workspace';
import { Workspace } from './workspace';
import type { Screen } from './workspace';
import { Navigation } from './navigation';
export async function WorkspacePage({screen,printingId}:{screen:Screen;printingId?:string}) {
  const result=await loadWorkspace();
  if(result.status==='ready')return <Workspace key={`${screen}-${printingId??""}`} screen={screen} initial={result.snapshot} printingId={printingId}/>;
  return <div className="shell"><Navigation/><main id="content">
    <>
      <header><p className="eyebrow">YOUR COLLECTION WORKSPACE</p><h1>{screen==='dashboard'?'Your cards. Your plans.':screen[0].toUpperCase()+screen.slice(1)}</h1></header>
      <section className="status"><h2>{result.status==='unconfigured'?'Local setup required':result.status==='signedout'?'Sign in to continue':'Workspace unavailable'}</h2>
      <p role={result.status==='error'?'alert':'status'}>{result.message}</p>
      <Link className="button" href={result.status==='error'?screen==='dashboard'?'/':screen==='card'?`/cards/${printingId}`:`/${screen}`:'/settings'}>{result.status==='error'?'Retry connection':'Account settings'}</Link></section>
      <p className="muted">Use an authorized catalog, or explicitly load local TEST ONLY fixtures for a trial. No sample inventory is created automatically.</p>
    </>
  </main></div>;
}
