import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { TextInput, Select } from '@/components/ui/Field';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';
import { formatDateTime } from '@/lib/format';

const ACTION_TONE: Record<string, 'green' | 'red' | 'amber' | 'gray' | 'indigo'> = {
  CREATE: 'green', UPDATE: 'indigo', DELETE: 'red', VOID: 'amber',
};

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit'],
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const modules = useMemo(() => Array.from(new Set((data ?? []).map((a) => a.module))), [data]);
  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((a) => {
      const matchS = !s || `${a.summary ?? ''} ${a.user_email ?? ''}`.toLowerCase().includes(s);
      const matchM = !module || a.module === module;
      return matchS && matchM;
    });
  }, [data, search, module]);

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Riwayat perubahan data (siapa, kapan, apa)"
        actions={<Button variant="secondary" disabled={!filtered.length} onClick={() => exportToExcel(filtered.map((a) => ({
          Waktu: a.created_at, User: a.user_email ?? '', Aksi: a.action, Modul: a.module, Ringkasan: a.summary ?? '',
        })), 'audit-log')}>⬇ Export</Button>} />
      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <TextInput placeholder="Cari ringkasan / user…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Semua modul</option>
            {modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState icon="📝" message="Belum ada aktivitas tercatat." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Modul</th><th>Ringkasan</th><th></th></tr></thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td className="muted nowrap">{formatDateTime(a.created_at)}</td>
                  <td>{a.user_email ?? '-'}</td>
                  <td><Badge tone={ACTION_TONE[a.action] ?? 'gray'}>{a.action}</Badge></td>
                  <td className="muted">{a.module}</td>
                  <td>{a.summary}</td>
                  <td className="text-right">
                    {(a.old_value || a.new_value) ? <Button size="sm" variant="ghost" onClick={() => setDetail(a)}>Detail</Button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {detail && (
        <Modal open size="lg" title={`Detail — ${detail.action} ${detail.module}`} onClose={() => setDetail(null)}
          footer={<Button variant="secondary" onClick={() => setDetail(null)}>Tutup</Button>}>
          <p className="muted" style={{ marginTop: 0 }}>{detail.summary}</p>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <h4>Nilai lama</h4>
              <pre style={{ background: '#fafafc', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(detail.old_value ?? {}, null, 2)}</pre>
            </div>
            <div>
              <h4>Nilai baru</h4>
              <pre style={{ background: '#fafafc', padding: 12, borderRadius: 8, overflow: 'auto', fontSize: 12 }}>{JSON.stringify(detail.new_value ?? {}, null, 2)}</pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
