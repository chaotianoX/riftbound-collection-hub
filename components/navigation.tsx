'use client';
import Link from 'next/link';
import { useContext } from 'react';
import { WorkspaceContext } from './workspace-context';
import { usePathname } from 'next/navigation';
export function Navigation() {
  const path=usePathname();const workspace=useContext(WorkspaceContext);
  return <aside><Link className="brand" href="/">RIFTBOUND<span>Collection Hub</span></Link><nav aria-label="Main navigation">
    {Object.entries({'/':'Dashboard','/collection':'Collection','/masterset':'Masterset','/wishlist':'Wishlist','/decks':'Decks','/settings':'Settings'}).map(([href,label])=><Link key={href} href={href} prefetch={false} aria-disabled={workspace?.busy||undefined} onClick={e=>{if(workspace?.busy)e.preventDefault();}} aria-current={path===href?'page':undefined}>{label}</Link>)}
    <span>Rules Assistant<small>Planned</small></span></nav><p className="aside-note">Independent workspace.<br/>Not an official Riot product.</p></aside>;
}
