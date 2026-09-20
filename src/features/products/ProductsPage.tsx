import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Field, TextInput, NumberInput, Select } from '@/components/ui/Field';
import { StatusBadge, Badge } from '@/components/ui/Badge';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/auth/AuthProvider';
import { Can } from '@/auth/Can';
import { friendlyError } from '@/lib/errors';
import { exportToExcel, parseExcel, downloadTemplate } from '@/lib/excel';
import { formatCurrency } from '@/lib/format';
import { useCategories } from '@/lib/lookups';

interface ProductRow extends Product { category_name?: string | null }

export default function ProductsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const { data: categories = [] } = useCategories();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Product | null>(null);
  const [importing, setImporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['products-page'],
    queryFn: async (): Promise<ProductRow[]> => {
      const { data, error } = await supabase.from('products').select('*, categories(name)').order('name');
      if (error) throw error;
      return (data ?? []).map((p) => ({ ...p, category_name: (p as { categories?: { name?: string } }).categories?.name ?? null }));
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((p) => {
      const matchSearch = !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s);
      const matchCat = !categoryId || p.category_id === categoryId;
      const matchStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.is_active : !p.is_active);
      return matchSearch && matchCat && matchStatus;
    });
  }, [data, search, categoryId, statusFilter]);

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('products').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Barang dihapus'); qc.invalidateQueries({ queryKey: ['products-page'] }); qc.invalidateQueries({ queryKey: ['products-lookup'] }); setToDelete(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  function doExport() {
    exportToExcel(filtered.map((p) => ({
      SKU: p.sku, Nama: p.name, Kategori: p.category_name ?? '', Satuan: p.unit,
      'Harga Modal': p.default_cost, 'Harga Jual': p.sell_price, Status: p.is_active ? 'Aktif' : 'Nonaktif',
    })), 'barang');
  }

  return (
    <div>
      <PageHeader title="Barang" subtitle="Master data barang & SKU"
        actions={<>
          <Button variant="secondary" onClick={doExport} disabled={!filtered.length}>⬇ Export</Button>
          <Can module="products" action="create"><Button variant="secondary" onClick={() => setImporting(true)}>⬆ Import</Button></Can>
          <Can module="products" action="create"><Button onClick={() => setCreating(true)}>+ Tambah</Button></Can>
        </>} />

      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <TextInput placeholder="Cari nama / SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">Semua status</option>
            <option value="active">Aktif</option>
            <option value="inactive">Nonaktif</option>
          </Select>
        </div>

        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState message="Tidak ada barang yang cocok." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>SKU</th><th>Nama</th><th>Kategori</th><th>Satuan</th>
              <th className="num">Harga Modal</th><th className="num">Harga Jual</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td><Badge tone="indigo">{p.sku}</Badge></td>
                  <td style={{ fontWeight: 500 }}>{p.name}</td>
                  <td className="muted">{p.category_name || '-'}</td>
                  <td className="muted">{p.unit}</td>
                  <td className="num">{formatCurrency(p.default_cost)}</td>
                  <td className="num">{formatCurrency(p.sell_price)}</td>
                  <td><StatusBadge active={p.is_active} /></td>
                  <td className="text-right nowrap">
                    <Can module="products" action="edit"><Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Ubah</Button></Can>
                    <Can module="products" action="delete"><Button size="sm" variant="ghost" onClick={() => setToDelete(p)}>Hapus</Button></Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>

      {(creating || editing) && (
        <ProductForm initial={editing} canEdit={editing ? can('products', 'edit') : can('products', 'create')} categories={categories}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['products-page'] }); qc.invalidateQueries({ queryKey: ['products-lookup'] }); setCreating(false); setEditing(null); }} />
      )}
      {importing && (
        <ProductImport onClose={() => setImporting(false)} onDone={() => { qc.invalidateQueries({ queryKey: ['products-page'] }); setImporting(false); }} />
      )}
      <ConfirmDialog open={!!toDelete} title="Hapus barang?"
        message={`Barang "${toDelete?.name}" (${toDelete?.sku}) akan dihapus. Jika sudah ada transaksi, pertimbangkan menonaktifkan saja.`}
        loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} onCancel={() => setToDelete(null)} />
    </div>
  );
}

function ProductForm({ initial, canEdit, categories, onClose, onSaved }: {
  initial: Product | null; canEdit: boolean; categories: { id: string; name: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? 'pcs');
  const [defaultCost, setDefaultCost] = useState(String(initial?.default_cost ?? 0));
  const [sellPrice, setSellPrice] = useState(String(initial?.sell_price ?? 0));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const save = useMutation({
    mutationFn: async () => {
      if (!sku.trim()) throw new Error('VALIDATION: SKU wajib diisi');
      if (!name.trim()) throw new Error('VALIDATION: Nama barang wajib diisi');
      const payload = {
        sku: sku.trim(), name: name.trim(), category_id: categoryId || null, unit: unit.trim() || 'pcs',
        default_cost: Number(defaultCost) || 0, sell_price: Number(sellPrice) || 0, is_active: isActive,
      };
      if (initial) { const { error } = await supabase.from('products').update(payload).eq('id', initial.id); if (error) throw error; }
      else { const { error } = await supabase.from('products').insert(payload); if (error) throw error; }
    },
    onSuccess: () => { toast.success(initial ? 'Barang diperbarui' : 'Barang ditambahkan'); onSaved(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open title={initial ? 'Ubah Barang' : 'Tambah Barang'} onClose={onClose}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!canEdit}>Simpan</Button></>}>
      <div className="form-grid">
        <Field label="SKU"><TextInput value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Unik, mis. IDM-001" autoFocus /></Field>
        <Field label="Nama barang"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Kategori">
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— Tanpa kategori —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Satuan"><TextInput value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs / box / kg" /></Field>
        <Field label="Harga modal (default)"><NumberInput value={defaultCost} min={0} onChange={(e) => setDefaultCost(e.target.value)} /></Field>
        <Field label="Harga jual"><NumberInput value={sellPrice} min={0} onChange={(e) => setSellPrice(e.target.value)} /></Field>
        <label className="row full" style={{ cursor: 'pointer' }}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Aktif</label>
      </div>
    </Modal>
  );
}

interface ImportRow { SKU?: string; Nama?: string; Satuan?: string; 'Harga Modal'?: number; 'Harga Jual'?: number }

function ProductImport({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  async function onFile(f: File) {
    try {
      const parsed = await parseExcel<ImportRow>(f);
      const errs: string[] = [];
      const seen = new Set<string>();
      parsed.forEach((r, i) => {
        const sku = String(r.SKU ?? '').trim();
        if (!sku) errs.push(`Baris ${i + 2}: SKU kosong`);
        else if (seen.has(sku)) errs.push(`Baris ${i + 2}: SKU "${sku}" duplikat dalam file`);
        seen.add(sku);
        if (!String(r.Nama ?? '').trim()) errs.push(`Baris ${i + 2}: Nama kosong`);
      });
      setRows(parsed);
      setErrors(errs);
    } catch (e) {
      toast.error(friendlyError(e));
    }
  }

  const doImport = useMutation({
    mutationFn: async () => {
      const payload = rows.map((r) => ({
        sku: String(r.SKU).trim(), name: String(r.Nama).trim(), unit: String(r.Satuan ?? 'pcs').trim() || 'pcs',
        default_cost: Number(r['Harga Modal']) || 0, sell_price: Number(r['Harga Jual']) || 0,
      }));
      const { error } = await supabase.from('products').upsert(payload, { onConflict: 'sku' });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`${rows.length} barang berhasil diimpor`); onDone(); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  return (
    <Modal open title="Import Barang dari Excel" onClose={onClose} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button onClick={() => doImport.mutate()} loading={doImport.isPending} disabled={!rows.length || errors.length > 0}>Import {rows.length ? `(${rows.length})` : ''}</Button>
      </>}>
      <p className="muted" style={{ marginTop: 0 }}>
        Kolom yang didukung: <b>SKU, Nama, Satuan, Harga Modal, Harga Jual</b>. SKU yang sudah ada akan diperbarui.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <Button variant="secondary" size="sm" onClick={() => downloadTemplate(
          ['SKU', 'Nama', 'Satuan', 'Harga Modal', 'Harga Jual'],
          { SKU: 'IDM-001', Nama: 'Indomie Goreng', Satuan: 'pcs', 'Harga Modal': 2500, 'Harga Jual': 3000 },
          'template-barang',
        )}>⬇ Unduh template</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button size="sm" onClick={() => fileRef.current?.click()}>Pilih file…</Button>
      </div>

      {errors.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)', padding: 12, marginBottom: 12 }}>
          <b className="text-danger">Validasi gagal ({errors.length}):</b>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{errors.slice(0, 10).map((e, i) => <li key={i} className="text-danger">{e}</li>)}</ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 320 }}>
          <table className="data">
            <thead><tr><th>SKU</th><th>Nama</th><th>Satuan</th><th className="num">Modal</th><th className="num">Jual</th></tr></thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}><td>{r.SKU}</td><td>{r.Nama}</td><td>{r.Satuan ?? 'pcs'}</td><td className="num">{r['Harga Modal'] ?? 0}</td><td className="num">{r['Harga Jual'] ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
