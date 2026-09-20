import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { MODULES, ACTIONS, MODULE_LABELS, ACTION_LABELS, permKey, type PermissionKey } from '@/lib/permissions';

export default function RolesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [editingPerms, setEditingPerms] = useState<Role | null>(null);
  const [toDelete, setToDelete] = useState<Role | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['roles-page'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('*, role_permissions(permission_id)').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('roles').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Role dihapus'); qc.invalidateQueries({ queryKey: ['roles-page'] }); qc.invalidateQueries({ queryKey: ['roles'] }); setToDelete(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <div>
      <PageHeader title="Role & Permission" subtitle="Kelola role dan hak akses per modul"
        actions={<Can module="roles" action="create"><Button onClick={() => setCreating(true)}>+ Tambah Role</Button></Can>} />
      <div className="card"><div className="card-pad">
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : (data ?? []).length === 0 ? (
          <EmptyState message="Belum ada role." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Role</th><th>Deskripsi</th><th className="num">Jumlah Izin</th><th>Tipe</th><th></th></tr></thead>
            <tbody>
              {(data ?? []).map((r) => {
                const count = (r as { role_permissions?: unknown[] }).role_permissions?.length ?? 0;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.name === 'admin' ? '👑 ' : ''}{r.name}</td>
                    <td className="muted">{r.description || '-'}</td>
                    <td className="num">{r.name === 'admin' ? 'Semua' : count}</td>
                    <td>{r.is_system ? <Badge tone="indigo">Sistem</Badge> : <Badge tone="gray">Custom</Badge>}</td>
                    <td className="text-right nowrap">
                      <Can module="roles" action="edit">
                        <Button size="sm" variant="ghost" onClick={() => setEditingPerms(r)} disabled={r.name === 'admin'}>Atur Izin</Button>
                      </Can>
                      <Can module="roles" action="delete">
                        <Button size="sm" variant="ghost" onClick={() => setToDelete(r)} disabled={r.is_system}>Hapus</Button>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </div></div>

      {creating && <RoleForm canEdit={can('roles', 'create')} onClose={() => setCreating(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['roles-page'] }); qc.invalidateQueries({ queryKey: ['roles'] }); setCreating(false); }} />}

      {editingPerms && <PermissionMatrix role={editingPerms} canEdit={can('roles', 'edit')} onClose={() => setEditingPerms(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['roles-page'] }); setEditingPerms(null); }} />}

      <ConfirmDialog open={!!toDelete} title="Hapus role?" message={`Role "${toDelete?.name}" akan dihapus.`} loading={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function RoleForm({ canEdit, onClose, onSaved }: { canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('VALIDATION: Nama role wajib diisi');
      const { error } = await supabase.from('roles').insert({ name: name.trim().toLowerCase(), description });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Role dibuat'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <Modal open title="Tambah Role" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      <div className="grid">
        <Field label="Nama role"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. kasir" autoFocus /></Field>
        <Field label="Deskripsi"><TextInput value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PermissionMatrix({ role, canEdit, onClose, onSaved }: { role: Role; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set());

  // Fetch current role permissions with labels.
  const { isLoading } = useQuery({
    queryKey: ['role-perms', role.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permissions(module, action)')
        .eq('role_id', role.id);
      if (error) throw error;
      const set = new Set<PermissionKey>();
      (data ?? []).forEach((rp) => {
        const p = (rp as { permissions?: { module: string; action: string } }).permissions;
        if (p) set.add(permKey(p.module as never, p.action as never));
      });
      setSelected(set);
      return set;
    },
  });

  function toggle(key: PermissionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }
  function toggleModuleAll(module: (typeof MODULES)[number]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ACTIONS.every((a) => next.has(permKey(module, a)));
      ACTIONS.forEach((a) => { const k = permKey(module, a); allOn ? next.delete(k) : next.add(k); });
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_role_permissions', {
        p_role: role.id, p_permissions: Array.from(selected),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Izin role diperbarui'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open size="lg" title={`Atur Izin — ${role.name}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan Izin</Button></>}>
      {isLoading ? <Loading /> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Modul</th>{ACTIONS.map((a) => <th key={a} style={{ textAlign: 'center' }}>{ACTION_LABELS[a]}</th>)}<th style={{ textAlign: 'center' }}>Semua</th></tr></thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m}>
                  <td style={{ fontWeight: 500 }}>{MODULE_LABELS[m]}</td>
                  {ACTIONS.map((a) => {
                    const k = permKey(m, a);
                    return (
                      <td key={a} style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} disabled={!canEdit} />
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={ACTIONS.every((a) => selected.has(permKey(m, a)))} onChange={() => toggleModuleAll(m)} disabled={!canEdit} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
