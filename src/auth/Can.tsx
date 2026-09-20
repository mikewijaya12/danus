import type { ReactNode } from 'react';
import { useAuth } from './AuthProvider';
import type { Module, Action } from '@/lib/permissions';

/**
 * Conditionally render children if the user has the given permission.
 * NOTE: This is UI convenience only. Real enforcement is in the database (RLS + RPC).
 */
export function Can({ module, action, children, fallback = null }: {
  module: Module; action: Action; children: ReactNode; fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(module, action) ? children : fallback}</>;
}
