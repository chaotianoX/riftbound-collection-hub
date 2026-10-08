import { WorkspacePage } from '@/components/workspace-page';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params; return <WorkspacePage screen="card" printingId={id}/>;
}
