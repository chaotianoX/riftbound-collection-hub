'use client';
import { createContext, useContext } from 'react';
import type { Snapshot } from '@/lib/domain/workspace';
import type { MutationResult } from '@/app/actions';
export type WorkspaceContextType={s:Snapshot;busy:boolean;run:(action:string,payload:Record<string,unknown>)=>Promise<MutationResult>};
export const WorkspaceContext=createContext<WorkspaceContextType|null>(null);
export function useWorkspace(){const c=useContext(WorkspaceContext);if(!c)throw new Error('Workspace context is missing');return c;}
