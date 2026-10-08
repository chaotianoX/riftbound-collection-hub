'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mutateWorkspace, type MutationResult } from '@/app/actions';
import type { Snapshot } from '@/lib/domain/workspace';
import { WorkspaceContext } from './workspace-context';
import { CollectionPanel } from './collection-panel';
import { WishlistPanel } from './wishlist-panel';
import { DashboardPanel } from './dashboard-panel';
import { DecksPanel } from './decks-panel';
import { Navigation } from './navigation';
import { CardDetail } from './card-detail';
export type Screen='dashboard'|'collection'|'masterset'|'wishlist'|'decks'|'card';
export function Workspace({screen,initial,printingId}:{screen:Screen;initial:Snapshot;printingId?:string}) {
  const router=useRouter();const [saving,setSaving]=useState(false);const [refreshing,startTransition]=useTransition();const [notice,setNotice]=useState<MutationResult|null>(null);
  const busy=saving||refreshing;
  const inFlight=useRef(false);
  useEffect(()=>{if(!busy)inFlight.current=false;},[busy]);
  async function run(action:string,payload:Record<string,unknown>) {
    if(busy||inFlight.current)return {ok:false,message:'Wait for the current change to finish.'};
    inFlight.current=true;
    setSaving(true);setNotice(null);
    let result:MutationResult;
    try {result=await mutateWorkspace(action,payload);}catch{result={ok:false,message:'Connection unavailable. The change was not confirmed.'};}
    setNotice(result);setSaving(false);
    if(result.ok)startTransition(()=>router.refresh());
    return result;
  }
  return <WorkspaceContext.Provider value={{s:initial,busy,run,saveState:saving?'saving':refreshing?'refreshing':notice?(notice.ok?'saved':'error'):'idle'}}>
    <div className={`shell ${screen==='decks'?'deck-shell':''}`}><Navigation/><main id="content">
    {initial.printings.some(p=>p.is_fixture)&&<div className="fixture-banner" role="status"><strong>TEST ONLY DATA</strong> · Synthetic local fixtures, not official Riot cards or a verified checklist. No official images or legality are provided.</div>}
    {busy&&<p className="save-notice" role="status">{saving?'Saving…':'Refreshing workspace…'}</p>}
    {notice&&<div className={`save-notice ${notice.ok?'success':'failure'}`} role={notice.ok?'status':'alert'}>{notice.message}</div>}
    <fieldset className="workspace-fieldset" disabled={busy}>
      {screen==='dashboard'?<DashboardPanel/>:screen==='collection'?<CollectionPanel/>:screen==='masterset'?<CollectionPanel mastersetMode/>:screen==='wishlist'?<WishlistPanel/>:screen==='decks'?<DecksPanel/>:<CardDetail id={printingId??''}/>}
    </fieldset>
    </main></div>
  </WorkspaceContext.Provider>;
}
