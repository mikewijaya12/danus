import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Purchase } from '@/types/supabase';
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
import { useBranches, useSuppliers, useProducts } from '@/lib/lookups';
import { LineItemsEditor, type LineItem } from '@/features/transactions/LineItemsEditor';

interface PurchaseRow extends Purchase { supplier_name?: string | null; branch_name?: string | null }

export default function PurchasesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<PurchaseRow | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['purchases'],
    queryFn: async (): Promise<PurchaseRow[]> => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*, suppliers(name), branches(name)')
        .eq('status', 'active').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p, supplier_name: (p as { suppliers?: { name?: string } }).suppliers?.name ?? null,
        branch_name: (p as { branches?: { name?: string } }).branches?.name ?? null,
      }));
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.rpc('delete_purchase', { p_id: id }); if (error) throw error; },
    onSuccess: () => { toast.success('Pembelian dihapus & stok dikoreksi'); invalidate(); setToDelete(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  function invalidate() {
    ['purchases', 'inventory', 'movements'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  function doExport() {
    exportToExcel((data ?? []).map((p) => ({
      No: p.txn_no, Tanggal: p.txn_date, Supplier: p.supplier_name ?? '', Cabang: p.branch_name ?? '',
      Subtotal: p.items_subtotal, Pajak: p.tax, Impor: p.import_fee, Kirim: p.shipping_fee, Lain: p.other_fee, 'Total Modal': p.total_cost,
    })), 'pembelian');
  }

  return (
    <div>
      <PageHeader title="Pembelian" subtitle="Catat pembelian. Stok cabang otomatis bertambah."
        actions={<>
          <Button variant="secondary" onClick={doExport} disabled={!data?.length}>⬇ Export</Button>
          <Can module="purchases" action="create"><Button onClick={() => setCreating(true)}>+ Pembelian</Button></Can>
        </>} />
      <div className="card"><div className="card-pad">
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : (data ?? []).length === 0 ? (
          <EmptyState icon="🛒" message="Belum ada transaksi pembelian." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>No</th><th>Tanggal</th><th>Supplier</th><th>Cabang</th><th className="num">Total Modal</th><th></th></tr></thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}>
                  <td><Badge tone="indigo">{p.txn_no}</Badge></td>
                  <td className="muted nowrap">{formatDate(p.txn_date)}</td>
                  <td>{p.supplier_name || '-'}</td>
                  <td>{p.branch_name}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatCurrency(p.total_cost)}</td>
                  <td className="text-right nowrap">
                    <Can module="purchases" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>Ubah</Button></Can>
                    <Can module="purchases" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(p)}>Hapus</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {(creating || editing) && (
        <PurchaseForm purchaseId={editing} onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { invalidate(); setCreating(false); setEditing(null); }} />
      )}
      <ConfirmDialog open={!!toDelete} title="Hapus pembelian?"
        message={`Pembelian ${toDelete?.txn_no} akan dibatalkan dan stok dikembalikan. Ditolak jika barang sudah terjual.`}
        loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function PurchaseForm({ purchaseId, onClose, onSaved }: { purchaseId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { can } = useAuth();
  const { data: branches = [] } = useBranches(true);
  const { data: suppliers = [] } = useSuppliers(true);
  const { data: products = [] } = useProducts(true);

  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [txnDate, setTxnDate] = useState(new Date().toISOString().slice(0, 10));
  const [tax, setTax] = useState('0');
  const [importFee, setImportFee] = useState('0');
  const [shippingFee, setShippingFee] = useState('0');
  const [otherFee, setOtherFee] = useState('0');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', qty: '1', unit_price: '0' }]);

  const { isLoading: loadingExisting } = useQuery({
    queryKey: ['purchase-detail', purchaseId],
    enabled: !!purchaseId,
    queryFn: async () => {
      const { data: p, error } = await supabase.from('purchases').select('*').eq('id', purchaseId!).single();
      if (error) throw error;
      const { data: its, error: e2 } = await supabase.from('purchase_items').select('*').eq('purchase_id', purchaseId!);
      if (e2) throw e2;
      setBranchId(p.branch_id); setSupplierId(p.supplier_id ?? ''); setTxnDate(p.txn_date);
      setTax(String(p.tax)); setImportFee(String(p.import_fee)); setShippingFee(String(p.shipping_fee)); setOtherFee(String(p.other_fee));
      setNote(p.note ?? '');
      setItems((its ?? []).map((i) => ({ product_id: i.product_id, qty: String(i.qty), unit_price: String(i.unit_price) })));
      return p;
    },
  });

  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);
  const extra = Number(tax) + Number(importFee) + Number(shippingFee) + Number(otherFee);
  const total = subtotal + extra;
  const canEdit = purchaseId ? can('purchases', 'edit') : can('purchases', 'create');

  const save = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error('VALIDATION: Pilih cabang tujuan');
      const cleanItems = items.filter((it) => it.product_id && Number(it.qty) > 0);
      if (cleanItems.length === 0) throw new Error('VALIDATION: Tambahkan minimal 1 barang');
      const payload = cleanItems.map((it) => ({ product_id: it.product_id, qty: Number(it.qty), unit_price: Number(it.unit_price) }));
      const args = {
        p_branch: branchId, p_supplier: supplierId || null, p_txn_date: txnDate,
        p_tax: Number(tax), p_import_fee: Number(importFee), p_shipping_fee: Number(shippingFee), p_other_fee: Number(otherFee),
        p_note: note || null, p_items: payload,
      };
      if (purchaseId) {
        const { error } = await supabase.rpc('update_purchase', { p_id: purchaseId, ...args });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('create_purchase', args);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success(purchaseId ? 'Pembelian diperbarui & stok dikoreksi' : 'Pembelian tersimpan & stok bertambah'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open size="lg" title={purchaseId ? 'Ubah Pembelian' : 'Pembelian Baru'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      {loadingExisting ? <Loading /> : (
        <>
          <div className="form-grid">
            <Field label="Tanggal"><TextInput type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></Field>
            <Field label="Cabang tujuan">
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">— Pilih cabang —</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label="Supplier" className="full">
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Tanpa supplier —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>

          <h4 className="mt-16">Item</h4>
          <LineItemsEditor items={items} products={products} onChange={setItems} />

          <h4 className="mt-16">Biaya tambahan (masuk ke modal / landed cost)</h4>
          <div className="form-grid">
            <Field label="Pajak"><NumberInput value={tax} min={0} onChange={(e) => setTax(e.target.value)} /></Field>
            <Field label="Biaya impor"><NumberInput value={importFee} min={0} onChange={(e) => setImportFee(e.target.value)} /></Field>
            <Field label="Ongkos kirim"><NumberInput value={shippingFee} min={0} onChange={(e) => setShippingFee(e.target.value)} /></Field>
            <Field label="Biaya lain"><NumberInput value={otherFee} min={0} onChange={(e) => setOtherFee(e.target.value)} /></Field>
            <Field label="Catatan" className="full"><TextArea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>

          <div className="card mt-16" style={{ padding: 14, background: '#fafafc' }}>
            <div className="row-between"><span className="muted">Subtotal barang</span><b>{formatCurrency(subtotal)}</b></div>
            <div className="row-between"><span className="muted">Biaya tambahan</span><b>{formatCurrency(extra)}</b></div>
            <div className="row-between" style={{ fontSize: 16, marginTop: 6 }}><b>Total Modal</b><b className="text-success">{formatCurrency(total)}</b></div>
            <p className="muted mt-8" style={{ marginBottom: 0, fontSize: 12 }}>Biaya tambahan dialokasikan proporsional ke tiap item → menentukan landed cost (rata² modal WMA).</p>
          </div>
        </>
      )}
    </Modal>
  );
}
