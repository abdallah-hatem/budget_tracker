import React, { createContext, useContext } from 'react';
import { usePending } from './usePending';
import type { Transaction } from '../../types';

export interface PendingCtx {
  data: Transaction[];
  count: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PendingCtx | null>(null);

export function PendingProvider({ children }: { children: React.ReactNode }) {
  const pending = usePending();
  return <Ctx.Provider value={pending}>{children}</Ctx.Provider>;
}

export function usePendingContext(): PendingCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePendingContext must be used within PendingProvider');
  return c;
}
