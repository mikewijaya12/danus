import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { InventoryView } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TextInput, Select } from '@/components/ui/Field';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useBranches } from '@/lib/lookups';

const LOW_STOCK = 5;

export default function InventoryPage() {
  const { data: branches = [] } = useBranches();
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['inventory'],
    queryFn: async (): Promise<InventoryView[]> => {
      const { data, error } = await supabase.from('v_inventory').select('*').order('product_name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((r) => {
      const matchS = !s || r.product_name.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s);
      const matchB = !branchId || r.branch_id === branchId;
      const matchLow = !onlyLow || Number(r.qty) <= LOW_STOCK;
      return matchS && matchB && matchLow;
    });
  }, [data, search, branchId, onlyLow]);

  const totalValue = filtered.reduce((sum, r) => sum + Number(r.stock_value), 0);

  function doExport() {
    exportToExcel(filtered.map((r) => ({
      SKU: r.sku, Barang: r.product_name, Kategori: r.category_name ?? '', Cabang: r.branch_name,
      Satuan: r.unit, Stok: r.qty, 'Rata2 Modal': r.avg_cost, 'Nilai Stok': r.stock_value, 'Harga Jual': r.sell_price,
    })), 'stok');
  }

  return (
    <div>
      <PageHeader title="Stok" subtitle="Stok per barang per cabang (dihitung dari stock movement)"
        actions={<Button variant="secondary" onClick={doExport} disabled={!filtered.length}>⬇ Export</Button>} />

      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <TextInput placeholder="Cari barang / SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Semua cabang</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <label className="row"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Stok rendah (≤ {LOW_STOCK})</label>
          <div style={{ marginLeft: 'auto' }} className="muted">Total nilai stok: <b>{formatCurrency(totalValue)}</b></div>
        </div>

        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState icon="🧮" message="Belum ada data stok. Stok muncul setelah ada pembelian atau penyesuaian." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr>
              <th>SKU</th><th>Barang</th><th>Cabang</th><th className="num">Stok</th>
              <th className="num">Rata² Modal</th><th className="num">Nilai Stok</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.branch_id}-${r.product_id}`}>
                  <td><Badge tone="indigo">{r.sku}</Badge></td>
                  <td style={{ fontWeight: 500 }}>{r.product_name} <span className="muted">/ {r.unit}</span></td>
                  <td>{r.branch_name}</td>
                  <td className="num">
                    {Number(r.qty) <= LOW_STOCK ? <Badge tone={Number(r.qty) <= 0 ? 'red' : 'amber'}>{formatNumber(r.qty)}</Badge> : formatNumber(r.qty)}
                  </td>
                  <td className="num">{formatCurrency(r.avg_cost)}</td>
                  <td className="num">{formatCurrency(r.stock_value)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}
