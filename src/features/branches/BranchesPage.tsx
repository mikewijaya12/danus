import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Branch } from '@/types/supabase';
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

export default function BranchesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Branch | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['branches-page'],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase.from('branches').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((b) => `${b.name} ${b.code ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('branches').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Cabang dihapus');
      qc.invalidateQueries({ queryKey: ['branches-page'] });
      qc.invalidateQueries({ queryKey: ['branches'] });
      setToDelete(null);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Cabang"
        subtitle="Daftar cabang / lokasi stok"
        actions={
          <>
            <Button variant="secondary" onClick={() => exportToExcel(filtered as unknown as Record<string, unknown>[], 'cabang')} disabled={!filtered.length}>⬇ Export</Button>
            <Can module="branches" action="create"><Button onClick={() => setCreating(true)}>+ Tambah</Button></Can>
          </>
        }
      />
      <div className="card"><div className="card-pad">
        <div className="toolbar"><TextInput placeholder="Cari cabang…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState message="Belum ada cabang." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Kode</th><th>Nama</th><th>Alamat</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>{b.code || '-'}</td>
                  <td style={{ fontWeight: 500 }}>{b.name}</td>
                  <td className="muted">{b.address || '-'}</td>
                  <td><StatusBadge active={b.is_active} /></td>
                  <td className="text-right nowrap">
                    <Can module="branches" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(b)}>Ubah</Button></Can>
                    <Can module="branches" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(b)}>Hapus</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {(creating || editing) && (
        <BranchForm
          initial={editing}
          canEdit={editing ? can('branches', 'edit') : can('branches', 'create')}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['branches-page'] }); qc.invalidateQueries({ queryKey: ['branches'] }); setCreating(false); setEditing(null); }}
        />
      )}
      <ConfirmDialog open={!!toDelete} title="Hapus cabang?" message={`Cabang "${toDelete?.name}" akan dihapus. Stok terkait juga akan terhapus.`} loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function BranchForm({ initial, canEdit, onClose, onSaved }: { initial: Branch | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('VALIDATION: Nama cabang wajib diisi');
      const payload = { code: code.trim() || null, name: name.trim(), address, is_active: isActive };
      if (initial) {
        const { error } = await supabase.from('branches').update(payload).eq('id', initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('branches').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(initial ? 'Cabang diperbarui' : 'Cabang ditambahkan'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open title={initial ? 'Ubah Cabang' : 'Tambah Cabang'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      <div className="form-grid">
        <Field label="Kode"><TextInput value={code ?? ''} onChange={(e) => setCode(e.target.value)} placeholder="BDG" /></Field>
        <Field label="Nama cabang"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Alamat" className="full"><TextArea value={address ?? ''} onChange={(e) => setAddress(e.target.value)} /></Field>
        <label className="row full" style={{ cursor: 'pointer' }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif</label>
      </div>
    </Modal>
  );
}
