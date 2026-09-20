import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Sale } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput, NumberInput, Select, TextArea } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';
import { formatCurrency, formatDate } from '@/lib/format';
import { useBranches, useProducts } from '@/lib/lookups';
import { LineItemsEditor, type LineItem } from '@/features/transactions/LineItemsEditor';

interface SaleRow extends Sale { branch_name?: string | null }

export default function SalesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<SaleRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales'],
    queryFn: async (): Promise<SaleRow[]> => {
      const { data, error } = await supabase
        .from('sales').select('*, branches(name)')
        .eq('status', 'active').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((s) => ({ ...s, branch_name: (s as { branches?: { name?: string } }).branches?.name ?? null }));
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('delete_sale', { p_id: id }); if (error) throw error; },
    onSuccess: () => { toast.success('Penjualan dihapus & stok dikembalikan'); invalidate(); setToDelete(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  function invalidate() { ['sales', 'inventory', 'movements'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); }

  function doExport() {
    exportToExcel((data ?? []).map((s) => ({
      No: s.txn_no, Tanggal: s.txn_date, Cabang: s.branch_name ?? '', Pelanggan: s.customer_name ?? '',
      Omzet: s.total, HPP: s.total_cogs, Laba: s.total_profit,
    })), 'penjualan');
  }

  return (
    <div>
      <PageHeader title="Penjualan" subtitle="Catat penjualan. Stok otomatis berkurang; laba dihitung otomatis."
        actions={<>
          <Button variant="secondary" onClick={doExport} disabled={!data?.length}>⬇ Export</Button>
          <Can module="sales" action="create"><Button onClick={() => setCreating(true)}>+ Penjualan</Button></Can>
        </>} />
      <div className="card"><div className="card-pad">
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : (data ?? []).length === 0 ? (
          <EmptyState icon="💰" message="Belum ada transaksi penjualan." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>No</th><th>Tanggal</th><th>Cabang</th><th>Pelanggan</th><th className="num">Omzet</th><th className="num">HPP</th><th className="num">Laba</th><th></th></tr></thead>
            <tbody>
              {(data ?? []).map((s) => (
                <tr key={s.id}>
                  <td><Badge tone="indigo">{s.txn_no}</Badge></td>
                  <td className="muted nowrap">{formatDate(s.txn_date)}</td>
                  <td>{s.branch_name}</td>
                  <td className="muted">{s.customer_name || '-'}</td>
                  <td className="num">{formatCurrency(s.total)}</td>
                  <td className="num muted">{formatCurrency(s.total_cogs)}</td>
                  <td className="num" style={{ fontWeight: 600, color: s.total_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(s.total_profit)}</td>
                  <td className="text-right nowrap">
                    <Can module="sales" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(s.id)}>Ubah</Button></Can>
                    <Can module="sales" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(s)}>Hapus</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {(creating || editing) && (
        <SaleForm saleId={editing} onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { invalidate(); setCreating(false); setEditing(null); }} />
      )}
      <ConfirmDialog open={!!toDelete} title="Hapus penjualan?"
        message={`Penjualan ${toDelete?.txn_no} akan dibatalkan dan stok dikembalikan.`}
        loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function SaleForm({ saleId, onClose, onSaved }: { saleId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const { data: branches = [] } = useBranches(true);
  const { data: products = [] } = useProducts(true);

  const [branchId, setBranchId] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [customer, setCustomer] = useState('');
  const [discount, setDiscount] = useState('0');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', qty: '1', unit_price: '0', discount: '0' }]);

  // Live stock lookup for the selected branch (to warn on shortage before submit).
  const { data: stockMap = {} } = useQuery({
    queryKey: ['branch-stock', branchId],
    enabled: !!branchId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from('branch_inventory').select('product_id, qty').eq('branch_id', branchId);
      if (error) throw error;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r) => { m[r.product_id] = Number(r.qty); });
      return m;
    },
  });

  const { isLoading: loadingExisting } = useQuery({
    queryKey: ['sale-detail', saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const { data: s, error } = await supabase.from('sales').select('*').eq('id', saleId!).single();
      if (error) throw error;
      const { data: its, error: e2 } = await supabase.from('sale_items').select('*').eq('sale_id', saleId!);
      if (e2) throw e2;
      setBranchId(s.branch_id); setTxnDate(s.txn_date); setCustomer(s.customer_name ?? ''); setDiscount(String(s.discount)); setNote(s.note ?? '');
      setItems((its ?? []).map((i) => ({ product_id: i.product_id, qty: String(i.qty), unit_price: String(i.unit_price), discount: String(i.discount) })));
      return s;
    },
  });

  const subtotal = items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)), 0);
  const total = subtotal - Number(discount);
  const canEdit = saleId ? can('sales', 'edit') : can('sales', 'create');
  const hasShortage = useMemo(
    () => items.some((it) => it.product_id && stockMap[it.product_id] !== undefined && Number(it.qty) > stockMap[it.product_id]),
    [items, stockMap],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('VALIDATION: Pilih cabang');
      const cleanItems = items.filter((it) => it.product_id && Number(it.qty) > 0);
      if (cleanItems.length === 0) throw new Error('VALIDATION: Tambahkan minimal 1 barang');
      const payload = cleanItems.map((it) => ({ product_id: it.product_id, qty: Number(it.qty), unit_price: Number(it.unit_price), discount: Number(it.discount) || 0 }));
      const args = { p_branch: branchId, p_txn_date: txnDate, p_customer_name: customer || null, p_discount: Number(discount) || 0, p_note: note || null, p_items: payload };
      if (saleId) { const { error } = await supabase.rpc('update_sale', { p_id: saleId, ...args }); if (error) throw error; }
      else { const { error } = await supabase.rpc('create_sale', args); if (error) throw error; }
    },
    onSuccess: () => { toast.success(saleId ? 'Penjualan diperbarui & stok dikoreksi' : 'Penjualan tersimpan & stok berkurang'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open size="lg" title={saleId ? 'Ubah Penjualan' : 'Penjualan Baru'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      {loadingExisting ? <Loading /> : (
        <>
          <div className="form-grid">
            <Field label="Tanggal"><TextInput type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></Field>
            <Field label="Cabang">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— Pilih cabang —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Pelanggan (opsional)" className="full"><TextInput value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
          </div>

          <h4 className="mt-16">Item</h4>
          {!branchId && <p className="muted" style={{ marginTop: 0 }}>Pilih cabang dulu untuk melihat ketersediaan stok.</p>}
          <LineItemsEditor items={items} products={products} onChange={setItems} showDiscount availableStock={stockMap} />

          <div className="form-grid mt-16">
            <Field label="Diskon transaksi"><NumberInput value={discount} min={0} onChange={(e) => setDiscount(e.target.value)} /></Field>
            <Field label="Catatan"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>

          {hasShortage && (
            <div className="card mt-16" style={{ padding: 12, borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              ⚠️ Ada item dengan qty melebihi stok. Transaksi akan ditolak oleh sistem.
            </div>
          )}

          <div className="card mt-16" style={{ padding: 14, background: '#fafafc' }}>
            <div className="row-between"><span className="muted">Subtotal</span><b>{formatCurrency(subtotal)}</b></div>
            <div className="row-between"><span className="muted">Diskon transaksi</span><b>-{formatCurrency(Number(discount))}</b></div>
            <div className="row-between" style={{ fontSize: 16, marginTop: 6 }}><b>Total Omzet</b><b className="text-success">{formatCurrency(total)}</b></div>
            <p className="muted mt-8" style={{ marginBottom: 0, fontSize: 12 }}>HPP & laba dihitung otomatis oleh server berdasarkan rata² modal (WMA) saat transaksi.</p>
          </div>
        </>
      )}
    </Modal>
  );
}
