import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, Select } from '@/components/ui/Field';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { useRoles } from '@/lib/lookups';
import { MODULES, ACTIONS, MODULE_LABELS, ACTION_LABELS, permKey, type PermissionKey } from '@/lib/permissions';

interface UserRow {
  id: string; full_name: string | null; email: string | null; is_active: boolean;
  role_id: string | null; role_name: string | null;
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: roles = [] } = useRoles();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users-page'],
    queryFn: async (): Promise<UserRow[]> => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, email, is_active, role_id, roles(name)').order('created_at');
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id, full_name: p.full_name, email: p.email, is_active: p.is_active, role_id: p.role_id,
        role_name: (p as { roles?: { name?: string } }).roles?.name ?? null,
      }));
    },
  });

  const filtered = useMemo(
    () => (data ?? []).filter((u) => `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  );

  return (
    <div>
      <PageHeader title="User" subtitle="Kelola pengguna, role, dan hak akses" />
      <div className="card"><div className="card-pad">
        <div className="toolbar"><TextInput placeholder="Cari user…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState icon="👥" message="Belum ada user. User dibuat saat mereka mendaftar (sign up), lalu diberi role di sini." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.full_name || '-'}</td>
                  <td className="muted">{u.email}</td>
                  <td>{u.role_name === 'admin' ? <Badge tone="indigo">👑 Admin Utama</Badge> : u.role_name ? <Badge tone="gray">{u.role_name}</Badge> : <span className="muted">—</span>}</td>
                  <td><StatusBadge active={u.is_active} /></td>
                  <td className="text-right">
                    <Can module="users" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Atur Akses</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {editing && <UserAccessModal user={editing} roles={roles} canEdit={can('users', 'edit')} onClose={() => setEditing(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['users-page'] }); setEditing(null); }} />}
    </div>
  );
}

function UserAccessModal({ user, roles, canEdit, onClose, onSaved }: {
  user: UserRow; roles: { id: string; name: string }[]; canEdit: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [roleId, setRoleId] = useState(user.role_id ?? '');
  const [isActive, setIsActive] = useState(user.is_active);
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set());

  const { isLoading } = useQuery({
    queryKey: ['user-perms', user.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_permissions').select('permissions(module, action)').eq('user_id', user.id);
      if (error) throw error;
      const set = new Set<PermissionKey>();
      (data ?? []).forEach((up) => {
        const p = (up as { permissions?: { module: string; action: string } }).permissions;
        if (p) set.add(permKey(p.module as never, p.action as never));
      });
      setSelected(set);
      return set;
    },
  });

  const selectedRoleName = roles.find((r) => r.id === roleId)?.name;

  function toggle(key: PermissionKey) {
    setSelected((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('admin_set_user_access', {
        p_user: user.id, p_role: roleId || null, p_is_active: isActive, p_permissions: Array.from(selected),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Akses user diperbarui'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open size="lg" title={`Atur Akses — ${user.full_name || user.email}`} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <Field label="Role">
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">— Tanpa role —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <label className="row" style={{ height: 38 }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif</label>
        </Field>
      </div>

      {selectedRoleName === 'admin' ? (
        <div className="card" style={{ padding: 12, background: 'var(--brand-50)', borderColor: 'var(--brand)' }}>
          👑 Role <b>admin</b> otomatis mendapat akses penuh ke seluruh modul.
        </div>
      ) : (
        <>
          <p className="muted" style={{ marginTop: 0 }}>Izin tambahan langsung untuk user ini (di luar role). Role sudah memberi izin dasarnya.</p>
          {isLoading ? <Loading /> : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Modul</th>{ACTIONS.map((a) => <th key={a} style={{ textAlign: 'center' }}>{ACTION_LABELS[a]}</th>)}</tr></thead>
                <tbody>
                  {MODULES.map((m) => (
                    <tr key={m}>
                      <td style={{ fontWeight: 500 }}>{MODULE_LABELS[m]}</td>
                      {ACTIONS.map((a) => {
                        const k = permKey(m, a);
                        return <td key={a} style={{ textAlign: 'center' }}><input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} disabled={!canEdit} /></td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
