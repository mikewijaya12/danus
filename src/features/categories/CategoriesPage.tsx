import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types/supabase';
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
import { formatDate } from '@/lib/format';

export default function CategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Category | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['categories-page'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Kategori dihapus');
      qc.invalidateQueries({ queryKey: ['categories-page'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      setToDelete(null);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div>
      <PageHeader
        title="Kategori"
        subtitle="Kelompok kategori barang"
        actions={
          <>
            <Button variant="secondary" onClick={() => exportToExcel(filtered as unknown as Record<string, unknown>[], 'kategori')} disabled={!filtered.length}>⬇ Export</Button>
            <Can module="categories" action="create"><Button onClick={() => setCreating(true)}>+ Tambah</Button></Can>
          </>
        }
      />

      <div className="card">
        <div className="card-pad">
          <div className="toolbar">
            <TextInput placeholder="Cari kategori…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
            <EmptyState message="Tidak ada kategori." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>Nama</th><th>Deskripsi</th><th>Status</th><th>Dibuat</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="muted">{c.description || '-'}</td>
                      <td><StatusBadge active={c.is_active} /></td>
                      <td className="muted nowrap">{formatDate(c.created_at)}</td>
                      <td className="text-right nowrap">
                        <Can module="categories" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Ubah</Button></Can>
                        <Can module="categories" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(c)}>Hapus</Button></Can>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <CategoryForm
          initial={editing}
          canEdit={editing ? can('categories', 'edit') : can('categories', 'create')}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['categories-page'] });
            qc.invalidateQueries({ queryKey: ['categories'] });
            setCreating(false); setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Hapus kategori?"
        message={`Kategori "${toDelete?.name}" akan dihapus permanen.`}
        loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function CategoryForm({ initial, canEdit, onClose, onSaved }: {
  initial: Category | null; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('VALIDATION: Nama kategori wajib diisi');
      if (initial) {
        const { error } = await supabase.from('categories').update({ name: name.trim(), description, is_active: isActive }).eq('id', initial.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('categories').insert({ name: name.trim(), description, is_active: isActive });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(initial ? 'Kategori diperbarui' : 'Kategori ditambahkan'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal
      open
      title={initial ? 'Ubah Kategori' : 'Tambah Kategori'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button>
        </>
      }
    >
      <div className="grid">
        <Field label="Nama kategori"><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Deskripsi"><TextArea value={description ?? ''} onChange={(e) => setDescription(e.target.value)} /></Field>
        <label className="row" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif
        </label>
      </div>
    </Modal>
  );
}
