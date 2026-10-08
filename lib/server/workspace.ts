import 'server-only';
import { supabaseServer } from '@/lib/supabase/server';
import type { Snapshot } from '@/lib/domain/workspace';
export type WorkspaceResult = { status:'ready'; snapshot:Snapshot; email:string } | { status:'unconfigured'|'signedout'|'error'; message:string };
export async function loadWorkspace():Promise<WorkspaceResult> {
  try {
    const client=await supabaseServer();
    if(!client)return {status:'unconfigured',message:'Configure local Supabase to open your workspace.'};
    const auth=await client.auth.getUser();
    if(auth.error&&auth.error.name!=='AuthSessionMissingError') return {status:'error',message:'Authentication is unavailable. Check your connection and retry.'};
    if(!auth.data.user)return {status:'signedout',message:'Sign in to view your collection and personal workspace.'};
    const {data,error}=await client.rpc('workspace_snapshot');
    if(error||!data)return {status:'error',message:'Workspace unavailable. Check the connection and apply all local migrations.'};
    const keys=['printings','cards','sets','products','contents','images','inventory','wishlist','decks','lines','allocations','sources'];
    if(keys.some(k=>!Array.isArray(data[k])))return {status:'error',message:'Workspace schema mismatch. Apply the current migrations.'};
    return {status:'ready',snapshot:data as Snapshot,email:auth.data.user.email??'Account'};
  } catch {return {status:'error',message:'Connection unavailable. Check local Supabase and retry.'};}
}
