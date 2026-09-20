import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MovementView, MovementType } from '@/types/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TextInput, Select } from '@/components/ui/Field';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';
import { formatNumber, formatDateTime } from '@/lib/format';

const TYPE_LABELS: Record<MovementType, string> = {
  PURCHASE: 'Pembelian', SALE: 'Penjualan', PURCHASE_REVERSAL: 'Reversal Pembelian',
  SALE_REVERSAL: 'Reversal Penjualan', ADJUSTMENT: 'Penyesuaian', TRANSFER: 'Transfer',
};
const TYPE_TONE: Record<MovementType, 'green' | 'red' | 'amber' | 'gray' | 'indigo'> = {
  PURCHASE: 'green', SALE: 'red', PURCHASE_REVERSAL: 'amber', SALE_REVERSAL: 'amber', ADJUSTMENT: 'indigo', TRANSFER: 'gray',
};

export default function MovementsPage() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['movements'],
    queryFn: async (): Promise<MovementView[]> => {
      const { data, error } = await supabase.from('v_stock_movements').select('*').order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return (data ?? []).filter((m) => {
      const matchS = !s || m.product_name.toLowerCase().includes(s) || m.sku.toLowerCase().includes(s);
      const matchT = !type || m.type === type;
      return matchS && matchT;
    });
  }, [data, search, type]);

  function doExport() {
    exportToExcel(filtered.map((m) => ({
      Waktu: m.created_at, Tipe: TYPE_LABELS[m.type], SKU: m.sku, Barang: m.product_name,
      Cabang: m.branch_name, Qty: m.qty, 'Modal/unit': m.unit_cost, Referensi: m.ref_table ?? '', Oleh: m.created_by_name ?? '',
    })), 'stock-movement');
  }

  return (
    <div>
      <PageHeader title="Stock Movement" subtitle="Histori pergerakan stok (ledger, dapat diaudit)"
        actions={<Button variant="secondary" onClick={doExport} disabled={!filtered.length}>⬇ Export</Button>} />
      <div className="card"><div className="card-pad">
        <div className="toolbar">
          <TextInput placeholder="Cari barang / SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Semua tipe</option>
            {Object.keys(TYPE_LABELS).map((t) => <option key={t} value={t}>{TYPE_LABELS[t as MovementType]}</option>)}
          </Select>
        </div>
        {isLoading ? <Loading /> : isError ? <ErrorState message={friendlyError(error)} onRetry={refetch} /> : filtered.length === 0 ? (
          <EmptyState icon="🔁" message="Belum ada pergerakan stok." />
        ) : (
          <div className="table-wrap"><table className="data">
            <thead><tr><th>Waktu</th><th>Tipe</th><th>Barang</th><th>Cabang</th><th className="num">Qty</th><th>Referensi</th><th>Oleh</th></tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="muted nowrap">{formatDateTime(m.created_at)}</td>
                  <td><Badge tone={TYPE_TONE[m.type]}>{TYPE_LABELS[m.type]}</Badge></td>
                  <td>{m.product_name} <span className="muted">({m.sku})</span></td>
                  <td>{m.branch_name}</td>
                  <td className="num" style={{ color: Number(m.qty) >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                    {Number(m.qty) >= 0 ? '+' : ''}{formatNumber(m.qty)}
                  </td>
                  <td className="muted">{m.ref_table ?? '-'}</td>
                  <td className="muted">{m.created_by_name ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div></div>
    </div>
  );
}
