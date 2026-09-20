import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Supplier } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput, TextArea } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';

export default function SuppliersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['suppliers-page'],
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((s) => `${s.name} ${s.phone ?? ''} ${s.email ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('suppliers').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Supplier dihapus'); qc.invalidateQueries({ queryKey: ['suppliers-page'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); setToDelete(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div>
      <PageHeader title="Supplier" subtitle="Daftar pemasok barang"
        actions={<>
          <Button variant="secondary" onClick={() => exportToExcel(filtered as unknown as Record<string, unknown>[], 'supplier')} disabled={!filtered.length}>⬇ Export</Button>
          <Can module="suppliers" action="create"><Button onClick={() => setCreating(true)}>+ Tambah</Button></Can>
        </>} />
      <div className="card"><div className="card-pad">
        <div className="toolbar"><TextInput placeholder="Cari supplier…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState message="Belum ada supplier." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Nama</th><th>Telepon</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td className="muted">{s.phone || '-'}</td>
                  <td className="muted">{s.email || '-'}</td>
                  <td><StatusBadge active={s.is_active} /></td>
                  <td className="text-right nowrap">
                    <Can module="suppliers" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Ubah</Button></Can>
                    <Can module="suppliers" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(s)}>Hapus</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {(creating || editing) && (
        <SupplierForm initial={editing} canEdit={editing ? can('suppliers', 'edit') : can('suppliers', 'create')}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['suppliers-page'] }); qc.invalidateQueries({ queryKey: ['suppliers'] }); setCreating(false); setEditing(null); }} />
      )}
      <ConfirmDialog open={!!toDelete} title="Hapus supplier?" message={`Supplier "${toDelete?.name}" akan dihapus.`} loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function SupplierForm({ initial, canEdit, onClose, onSaved }: { initial: Supplier | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('VALIDATION: Nama supplier wajib diisi');
      const payload = { name: name.trim(), phone: phone || null, email: email || null, address: address || null, is_active: isActive };
      if (initial) { const { error } = await supabase.from('suppliers').update(payload).eq('id', initial.id); if (error) throw error; }
      else { const { error } = await supabase.from('suppliers').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(initial ? 'Supplier diperbarui' : 'Supplier ditambahkan'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open title={initial ? 'Ubah Supplier' : 'Tambah Supplier'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      <div className="form-grid">
        <Field label="Nama supplier" className="full"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Telepon"><TextInput value={phone ?? ''} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="Email"><TextInput type="email" value={email ?? ''} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Alamat" className="full"><TextArea value={address ?? ''} onChange={(e) => setAddress(e.target.value)} /></Field>
        <label className="row full" style={{ cursor: 'pointer' }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif</label>
      </div>
    </Modal>
  );
}
