import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Loading, ErrorState } from '@/components/ui/states';
import { friendlyError } from '@/lib/errors';
import { formatCurrency, formatNumber } from '@/lib/format';
import { DateRangeFilter, computeRange, type RangeState } from './DateRangeFilter';

interface Summary {
  omzet: number; hpp: number; laba: number; purchase_total: number;
  sales_count: number; purchases_count: number; total_products: number;
  total_stock: number; stock_value: number;
}
interface SeriesPoint { day: string; omzet: number; laba: number; hpp: number }
interface LowStockRow { sku: string; product_name: string; branch_name: string; qty: number }

export default function DashboardPage() {
  const [range, setRange] = useState<RangeState>({ preset: 'month', from: '', to: '', branchId: '' });
  const { from, to } = useMemo(() => computeRange(range.preset, range.from, range.to), [range]);
  const branch = range.branchId || null;

  const summaryQ = useQuery({
    queryKey: ['dashboard-summary', from, to, branch],
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc('dashboard_summary', { p_from: from, p_to: to, p_branch: branch });
      if (error) throw error;
      return data as unknown as Summary;
    },
    enabled: !!from && !!to,
  });

  const seriesQ = useQuery({
    queryKey: ['dashboard-series', from, to, branch],
    queryFn: async (): Promise<SeriesPoint[]> => {
      const { data, error } = await supabase.rpc('sales_timeseries', { p_from: from, p_to: to, p_branch: branch });
      if (error) throw error;
      return (data ?? []) as SeriesPoint[];
    },
    enabled: !!from && !!to,
  });

  const lowQ = useQuery({
    queryKey: ['dashboard-low', branch],
    queryFn: async (): Promise<LowStockRow[]> => {
      const { data, error } = await supabase.rpc('low_stock', { p_threshold: 5, p_branch: branch });
      if (error) throw error;
      return (data ?? []) as LowStockRow[];
    },
  });

  const s = summaryQ.data;
  const chartData = (seriesQ.data ?? []).map((p) => ({ ...p, label: p.day.slice(5) }));

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Ringkasan kinerja usaha" actions={<DateRangeFilter value={range} onChange={setRange} />} />

      {summaryQ.isLoading ? <Loading /> : summaryQ.isError ? <ErrorState message={friendlyError(summaryQ.error)} onRetry={summaryQ.refetch} /> : s && (
        <>
          <div className="stat-grid">
            <StatCard label="Omzet" value={formatCurrency(s.omzet)} tone="var(--brand)" />
            <StatCard label="Modal / HPP" value={formatCurrency(s.hpp)} tone="var(--warning)" />
            <StatCard label="Laba" value={formatCurrency(s.laba)} tone="var(--success)" />
            <StatCard label="Total Pembelian" value={formatCurrency(s.purchase_total)} tone="var(--text)" />
            <StatCard label="Transaksi Penjualan" value={formatNumber(s.sales_count)} />
            <StatCard label="Transaksi Pembelian" value={formatNumber(s.purchases_count)} />
            <StatCard label="Total Barang" value={formatNumber(s.total_products)} />
            <StatCard label="Total Stok" value={formatNumber(s.total_stock)} sub={`Nilai: ${formatCurrency(s.stock_value)}`} />
          </div>

          <div className="grid mt-24" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card">
              <div className="card-header"><b>Grafik Omzet</b></div>
              <div className="card-pad">
                {chartData.length === 0 ? <div className="state muted">Belum ada data penjualan pada periode ini.</div> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="omzet" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => formatNumber(v)} width={70} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Area type="monotone" dataKey="omzet" stroke="#4f46e5" fill="url(#omzet)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><b>Grafik Laba</b></div>
              <div className="card-pad">
                {chartData.length === 0 ? <div className="state muted">Belum ada data.</div> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis fontSize={12} tickFormatter={(v) => formatNumber(v)} width={70} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="laba" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="card mt-24">
            <div className="card-header"><b>Barang Stok Rendah</b> <span className="muted">(≤ 5)</span></div>
            <div className="card-pad">
              {lowQ.isLoading ? <Loading /> : (lowQ.data ?? []).length === 0 ? (
                <div className="state muted">Tidak ada barang stok rendah. 🎉</div>
              ) : (
                <div className="table-wrap"><table className="data">
                  <thead><tr><th>SKU</th><th>Barang</th><th>Cabang</th><th className="num">Stok</th></tr></thead>
                  <tbody>
                    {(lowQ.data ?? []).map((r, i) => (
                      <tr key={i}>
                        <td>{r.sku}</td><td>{r.product_name}</td><td>{r.branch_name}</td>
                        <td className="num"><Badge tone={r.qty <= 0 ? 'red' : 'amber'}>{formatNumber(r.qty)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: tone }}>{value}</div>
      {sub && <div className="stat-sub muted">{sub}</div>}
    </div>
  );
}
