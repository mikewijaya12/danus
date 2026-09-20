import { Select, TextInput } from '@/components/ui/Field';
import { useBranches } from '@/lib/lookups';

export type RangePreset = 'today' | 'week' | 'month' | 'custom';

export interface RangeState {
  preset: RangePreset;
  from: string;
  to: string;
  branchId: string;
}

export function computeRange(preset: RangePreset, from: string, to: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === 'today') return { from: iso(today), to: iso(today) };
  if (preset === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - 6);
    return { from: iso(start), to: iso(today) };
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(start), to: iso(today) };
  }
  return { from, to };
}

export function DateRangeFilter({ value, onChange }: { value: RangeState; onChange: (v: RangeState) => void }) {
  const { data: branches = [] } = useBranches();
  return (
    <div className="toolbar" style={{ marginBottom: 0 }}>
      <Select value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value as RangePreset })}>
        <option value="today">Hari ini</option>
        <option value="week">7 hari</option>
        <option value="month">Bulan ini</option>
        <option value="custom">Custom</option>
      </Select>
      {value.preset === 'custom' && (
        <>
          <TextInput type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          <span className="muted">s/d</span>
          <TextInput type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </>
      )}
      <Select value={value.branchId} onChange={(e) => onChange({ ...value, branchId: e.target.value })}>
        <option value="">Semua cabang</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </Select>
    </div>
  );
}
