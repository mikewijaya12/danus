import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Loading, EmptyState, ErrorState } from '@/components/ui/states';
import { friendlyError } from '@/lib/errors';
import { exportToExcel } from '@/lib/excel';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { DateRangeFilter, computeRange, type RangeState } from '@/features/dashboard/DateRangeFilter';

type ReportTab = 'sales' | 'purchases' | 'stock' | 'profit';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'sales', label: 'Penjualan' },
  { key: 'purchases', label: 'Pembelian' },
  { key: 'stock', label: 'Stok' },
  { key: 'profit', label: 'Laba' },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('sales');
  const [range, setRange] = useState<RangeState>({ preset: 'month', from: '', to: '', branchId: '' });
  const { from, to } = useMemo(() => computeRange(range.preset, range.from, range.to), [range]);
  const branch = range.branchId || null;

  return (
    <div>
      <PageHeader title="Laporan & Export" subtitle="Laporan penjualan, pembelian, stok, dan laba" actions={<DateRangeFilter value={range} onChange={setRange} />} />
      <div className="card">
        <div className="card-header row" style={{ gap: 6 }}>
          {TABS.map((t) => (
            <button key={t.key} className={`btn ${tab === t.key ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="card-pad">
          {tab === 'sales' && <SalesReport from={from} to={to} branch={branch} />}
          {tab === 'purchases' && <PurchasesReport from={from} to={to} branch={branch} />}
          {tab === 'stock' && <StockReport branch={branch} />}
          {tab === 'profit' && <ProfitReport from={from} to={to} branch={branch} />}
        </div>
      </div>
    </div>
  );
}

function useReport<T>(key: unknown[], fn: () => Promise<T[]>) {
  return useQuery({ queryKey: key, queryFn: fn });
}

function SalesReport({ from, to, branch }: { from: string; to: string; branch: string | null }) {
  const q = useReport(['rep-sales', from, to, branch], async () => {
    let filter = supabase.from('sales').select('txn_no, txn_date, customer_name, total, total_cogs, total_profit, branches(name)')
      .eq('status', 'active').gte('txn_date', from).lte('txn_date', to);
    if (branch) filter = filter.eq('branch_id', branch);
    const { data, error } = await filter.order('txn_date');
    if (error) throw error;
    return (data ?? []).map((s) => ({
      No: s.txn_no, Tanggal: s.txn_date, Cabang: (s as { branches?: { name?: string } }).branches?.name ?? '',
      Pelanggan: s.customer_name ?? '', Omzet: s.total, HPP: s.total_cogs, Laba: s.total_profit,
    }));
  });
  const totals = (q.data ?? []).reduce((a, r) => ({ omzet: a.omzet + r.Omzet, hpp: a.hpp + r.HPP, laba: a.laba + r.Laba }), { omzet: 0, hpp: 0, laba: 0 });
  return <ReportTable q={q} fileName="laporan-penjualan" columns={['No', 'Tanggal', 'Cabang', 'Pelanggan', 'Omzet', 'HPP', 'Laba']} numeric={['Omzet', 'HPP', 'Laba']}
    footer={<tr><td colSpan={4} className="text-right"><b>Total</b></td><td className="num"><b>{formatCurrency(totals.omzet)}</b></td><td className="num"><b>{formatCurrency(totals.hpp)}</b></td><td className="num"><b>{formatCurrency(totals.laba)}</b></td></tr>} />;
}

function PurchasesReport({ from, to, branch }: { from: string; to: string; branch: string | null }) {
  const q = useReport(['rep-purchases', from, to, branch], async () => {
    let filter = supabase.from('purchases').select('txn_no, txn_date, items_subtotal, tax, import_fee, shipping_fee, other_fee, total_cost, suppliers(name), branches(name)')
      .eq('status', 'active').gte('txn_date', from).lte('txn_date', to);
    if (branch) filter = filter.eq('branch_id', branch);
    const { data, error } = await filter.order('txn_date');
    if (error) throw error;
    return (data ?? []).map((p) => ({
      No: p.txn_no, Tanggal: p.txn_date, Supplier: (p as { suppliers?: { name?: string } }).suppliers?.name ?? '',
      Cabang: (p as { branches?: { name?: string } }).branches?.name ?? '', Subtotal: p.items_subtotal,
      Biaya: p.tax + p.import_fee + p.shipping_fee + p.other_fee, 'Total Modal': p.total_cost,
    }));
  });
  const total = (q.data ?? []).reduce((a, r) => a + r['Total Modal'], 0);
  return <ReportTable q={q} fileName="laporan-pembelian" columns={['No', 'Tanggal', 'Supplier', 'Cabang', 'Subtotal', 'Biaya', 'Total Modal']} numeric={['Subtotal', 'Biaya', 'Total Modal']}
    footer={<tr><td colSpan={6} className="text-right"><b>Total</b></td><td className="num"><b>{formatCurrency(total)}</b></td></tr>} />;
}

function StockReport({ branch }: { branch: string | null }) {
  const q = useReport(['rep-stock', branch], async () => {
    let filter = supabase.from('v_inventory').select('*');
    if (branch) filter = filter.eq('branch_id', branch);
    const { data, error } = await filter.order('product_name');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      SKU: r.sku, Barang: r.product_name, Cabang: r.branch_name, Stok: r.qty, 'Rata2 Modal': r.avg_cost, 'Nilai Stok': r.stock_value,
    }));
  });
  const total = (q.data ?? []).reduce((a, r) => a + r['Nilai Stok'], 0);
  return <ReportTable q={q} fileName="laporan-stok" columns={['SKU', 'Barang', 'Cabang', 'Stok', 'Rata2 Modal', 'Nilai Stok']} numeric={['Rata2 Modal', 'Nilai Stok']} plainNum={['Stok']}
    footer={<tr><td colSpan={5} className="text-right"><b>Total Nilai</b></td><td className="num"><b>{formatCurrency(total)}</b></td></tr>} />;
}

function ProfitReport({ from, to, branch }: { from: string; to: string; branch: string | null }) {
  const q = useReport(['rep-profit', from, to, branch], async () => {
    const { data, error } = await supabase.rpc('sales_timeseries', { p_from: from, p_to: to, p_branch: branch });
    if (error) throw error;
    return (data ?? []).map((r: { day: string; omzet: number; hpp: number; laba: number }) => ({
      Tanggal: r.day, Omzet: r.omzet, HPP: r.hpp, Laba: r.laba,
    }));
  });
  const totals = (q.data ?? []).reduce((a, r) => ({ omzet: a.omzet + r.Omzet, hpp: a.hpp + r.HPP, laba: a.laba + r.Laba }), { omzet: 0, hpp: 0, laba: 0 });
  return <ReportTable q={q} fileName="laporan-laba" columns={['Tanggal', 'Omzet', 'HPP', 'Laba']} numeric={['Omzet', 'HPP', 'Laba']}
    footer={<tr><td className="text-right"><b>Total</b></td><td className="num"><b>{formatCurrency(totals.omzet)}</b></td><td className="num"><b>{formatCurrency(totals.hpp)}</b></td><td className="num"><b>{formatCurrency(totals.laba)}</b></td></tr>} />;
}

interface QueryLike<T> {
  data?: T[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}
interface ReportTableProps<T extends Record<string, unknown>> {
  q: QueryLike<T>;
  fileName: string; columns: string[]; numeric?: string[]; plainNum?: string[]; footer?: ReactNode;
}
function ReportTable<T extends Record<string, unknown>>({ q, fileName, columns, numeric = [], plainNum = [], footer }: ReportTableProps<T>) {
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={friendlyError(q.error)} onRetry={q.refetch} />;
  const rows = (q.data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return <EmptyState icon="📈" message="Tidak ada data pada periode ini." />;
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <span className="muted">{rows.length} baris</span>
        <Button variant="secondary" onClick={() => exportToExcel(rows, fileName)}>⬇ Export Excel</Button>
      </div>
      <div className="table-wrap"><table className="data">
        <thead><tr>{columns.map((c) => <th key={c} className={numeric.includes(c) || plainNum.includes(c) ? 'num' : ''}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c} className={numeric.includes(c) || plainNum.includes(c) ? 'num' : ''}>
                  {numeric.includes(c) ? formatCurrency(Number(r[c])) : plainNum.includes(c) ? formatNumber(Number(r[c])) : c === 'Tanggal' ? formatDate(String(r[c])) : String(r[c] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table></div>
    </div>
  );
}
