import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { Module } from '@/lib/permissions';
import { Loading, EmptyState } from '@/components/ui/states';

/** Requires an authenticated session; optionally a view permission on a module. */
export function ProtectedRoute({ module, children }: { module?: Module; children: ReactNode }) {
  const { session, loading, can, profile } = useAuth();

  if (loading) return <Loading label="Menyiapkan sesi…" />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile && !profile.is_active) {
    return <EmptyState icon="🔒" title="Akun nonaktif" message="Akun Anda dinonaktifkan. Hubungi admin." />;
  }
  if (module && !can(module, 'view')) {
    return <EmptyState icon="🔒" title="Akses ditolak" message="Anda tidak memiliki izin untuk mengakses halaman ini." />;
  }
  return <>{children}</>;
}
