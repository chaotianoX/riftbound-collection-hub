'use server';
import { supabaseServer } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
export type MutationResult={ok:boolean;message:string;id?:string|null};
const allowed=new Set(['set_owned','save_sort','save_wishlist','add_wishlist_reason','remove_wishlist_reason','delete_wishlist','create_deck','rename_deck','set_mode','delete_deck','duplicate_deck','set_line','set_line_printing','allocate','import_deck','move_line','reorder_lines']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validate(action:string,p:Record<string,unknown>):boolean {
  if(!allowed.has(action)||JSON.stringify(p).length>150000)return false;
  for(const [key,value] of Object.entries(p)) {
    if(key.endsWith('_id')&&value!==null&&value!==''&&(typeof value!=='string'||!uuid.test(value)))return false;
    if(['quantity','target'].includes(key)&&(!Number.isInteger(value)||Number(value)<0||Number(value)>2147483647))return false;
    if(key==='name'&&(typeof value!=='string'||value.trim().length<1||value.length>120))return false;
    if(key==='section'&&(typeof value!=='string'||!value.trim()||value.length>80||/[\t\r\n]/.test(value)))return false;
    if(key==='format'&&value!==null&&(typeof value!=='string'||value.length>80))return false;
    if(key==='note'&&(typeof value!=='string'||value.length>1000))return false;
  }
  if(action==='import_deck') {
    if(!Array.isArray(p.lines)||p.lines.length<1||p.lines.length>500)return false;
    return p.lines.every(line=>line&&typeof line==='object'&&validate('set_line',line)&&Number(line.quantity)>0);
  }
  if(action==='reorder_lines'&&(!Array.isArray(p.line_ids)||p.line_ids.length<1||p.line_ids.length>5000||!p.line_ids.every(id=>typeof id==='string'&&uuid.test(id))))return false;
  return true;
}
export async function mutateWorkspace(action:string,payload:Record<string,unknown>):Promise<MutationResult> {
  if(!payload||typeof payload!=='object'||!validate(action,payload))return {ok:false,message:'Invalid input. Check quantities and required fields.'};
  try {
    const client=await supabaseServer();
    if(!client)return {ok:false,message:'Supabase is not configured.'};
    const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user)return {ok:false,message:'Your session has expired. Sign in again.'};
    const {data,error}=await client.rpc(action==='move_line'||action==='reorder_lines'?'edit_deck_layout':'mutate_workspace',{action,payload});
    if(error) {
      const expected=['Authentication required','Quantity must','Quantity is','Printing is not eligible','Release allocations','Insufficient available copies','Owned quantity cannot','Allocation exceeds','Allocation must match','Printing equivalence','Printing identity','Invalid sort','Unknown sort','Invalid wishlist','Import requires','Duplicate import','Deck line not found','Deck not found'];
      const safe=[...expected,'Destination printing','Display order'].some(prefix=>error.message.startsWith(prefix))?error.message:'This change could not be saved. Check your inputs and retry.';
      const detail=error.message.startsWith('Owned quantity cannot')&&error.details?` Affected decks: ${error.details.slice(0,800)}`:'';
      return {ok:false,message:safe+detail};
    }
    for(const path of ['/','/collection','/masterset','/wishlist','/decks'])revalidatePath(path);
    revalidatePath('/cards/[id]','page');
    return {ok:true,message:'Saved successfully.',id:data};
  } catch {return {ok:false,message:'Connection unavailable. Your change was not confirmed; retry before continuing.'};}
}
