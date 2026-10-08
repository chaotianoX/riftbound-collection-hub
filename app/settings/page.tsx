import { supabaseServer } from '@/lib/supabase/server';
import { AuthForm } from './auth-form';
import { signOut } from './actions';
import { Navigation } from '@/components/navigation';
export const dynamic='force-dynamic';
export default async function Settings({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const params=await searchParams;const client=await supabaseServer();let user=null;let unavailable=false;
  if(client){try{const result=await client.auth.getUser();user=result.data.user;unavailable=!!result.error&&result.error.name!=='AuthSessionMissingError';}catch{unavailable=true;}}
  return <div className="shell"><Navigation/><main id="content"><h1>Settings</h1><section className="panel"><h2>Account</h2>
    {params.error==='signout'&&<p role="alert">Sign out failed. Please try again.</p>}
    {!client?<p role="status">Local Supabase setup is required before signing in.</p>:unavailable?<p role="alert">Authentication is unavailable. Please retry.</p>:user?<><p>Signed in as {user.email}</p><form action={signOut}><button>Sign out</button></form></>:<AuthForm/>}
    <p className="muted">Your collection, wishlist and decks belong to your account.</p></section></main></div>;
}
