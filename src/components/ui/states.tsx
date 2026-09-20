import type { ReactNode } from 'react';

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="state">
      <div className="spinner center" />
      <div>{label}</div>
    </div>
  );
}

export function EmptyState({ icon = '📭', title = 'Belum ada data', message, action }: { icon?: string; title?: string; message?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="state-icon">{icon}</div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{title}</div>
      {message && <div className="mt-8">{message}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state-icon">⚠️</div>
      <div style={{ fontWeight: 600, color: 'var(--danger)' }}>Terjadi kesalahan</div>
      <div className="mt-8" style={{ maxWidth: 460, margin: '8px auto 0' }}>{message}</div>
      {onRetry && (
        <div className="mt-16">
          <button className="btn btn-secondary" onClick={onRetry}>Coba lagi</button>
        </div>
      )}
    </div>
  );
}
