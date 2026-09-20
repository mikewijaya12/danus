import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, TextInput, NumberInput, Select } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { formatNumber, formatDate } from '@/lib/format';
import { useBranches, useProducts } from '@/lib/lookups';

interface AdjRow {
  id: string; txn_no: string; txn_date: string; qty_change: number; reason: string;
  branch_name?: string; product_name?: string; sku?: string;
}

export default function AdjustmentsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['adjustments'],
    queryFn: async (): Promise<AdjRow[]> => {
      const { data, error } = await supabase
        .from('stock_adjustments')
        .select('id, txn_no, txn_date, qty_change, reason, branches(name), products(name, sku)')
        .eq('status', 'active').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((a) => ({
        id: a.id, txn_no: a.txn_no, txn_date: a.txn_date, qty_change: a.qty_change, reason: a.reason,
        branch_name: (a as { branches?: { name?: string } }).branches?.name,
        product_name: (a as { products?: { name?: string } }).products?.name,
        sku: (a as { products?: { sku?: string } }).products?.sku,
      }));
    },
  });

  return (
    <div>
      <PageHeader title="Penyesuaian Stok" subtitle="Koreksi stok manual (opname, rusak, hilang, dll)"
        actions={<Can module="adjustments" action="create"><Button onClick={() => setCreating(true)}>+ Penyesuaian</Button></Can>} />
      <div className="card"><div className="card-pad">
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : (data ?? []).length === 0 ? (
          <EmptyState icon="⚖️" message="Belum ada penyesuaian stok." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>No</th><th>Tanggal</th><th>Barang</th><th>Cabang</th><th className="num">Perubahan</th><th>Alasan</th></tr></thead>
            <tbody>
              {(data ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.txn_no}</td>
                  <td className="muted nowrap">{formatDate(a.txn_date)}</td>
                  <td>{a.product_name} <span className="muted">({a.sku})</span></td>
                  <td>{a.branch_name}</td>
                  <td className="num"><Badge tone={a.qty_change >= 0 ? 'green' : 'red'}>{a.qty_change >= 0 ? '+' : ''}{formatNumber(a.qty_change)}</Badge></td>
                  <td className="muted">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {creating && <AdjustmentForm canCreate={can('adjustments', 'create')} onClose={() => setCreating(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['adjustments'] }); qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['movements'] }); setCreating(false); }} />}
    </div>
  );
}

function AdjustmentForm({ canCreate, onClose, onSaved }: { canCreate: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { data: branches = [] } = useBranches(true);
  const { data: products = [] } = useProducts(true);
  const [branchId, setBranchId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('0');
  const [reason, setReason] = useState('');

  const activeProducts = useMemo(() => products, [products]);

  const save = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('VALIDATION: Pilih cabang');
      if (!productId) throw new Error('VALIDATION: Pilih barang');
      if (!Number(qty)) throw new Error('VALIDATION: Perubahan qty tidak boleh 0');
      if (!reason.trim()) throw new Error('VALIDATION: Alasan wajib diisi');
      const { error } = await supabase.rpc('create_adjustment', {
        p_branch: branchId, p_product: productId, p_qty_change: Number(qty), p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Penyesuaian stok tersimpan'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open title="Penyesuaian Stok" onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canCreate}>Simpan</Button></>}>
      <div className="form-grid">
        <Field label="Cabang">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">— Pilih cabang —</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field label="Barang">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— Pilih barang —</option>
            {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </Select>
        </Field>
        <Field label="Perubahan qty (+/-)"><NumberInput value={qty} onChange={(e) => setQty(e.target.value)} placeholder="mis. -3 atau 10" /></Field>
        <Field label="Alasan"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Opname / rusak / hilang" /></Field>
      </div>
      <p className="muted mt-8" style={{ marginBottom: 0 }}>Nilai negatif mengurangi stok (akan ditolak jika stok tidak cukup).</p>
    </Modal>
  );
}
