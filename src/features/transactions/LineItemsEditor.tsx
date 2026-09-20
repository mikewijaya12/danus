import { Button } from '@/components/ui/Button';
import { NumberInput, Select } from '@/components/ui/Field';
import { formatCurrency } from '@/lib/format';
import type { Product } from '@/types/supabase';

export interface LineItem {
  product_id: string;
  qty: string;
  unit_price: string;
  discount?: string; // sales only
}

interface Props {
  items: LineItem[];
  products: Product[];
  onChange: (items: LineItem[]) => void;
  showDiscount?: boolean;
  /** map product_id -> available stock (sales) to warn on shortage */
  availableStock?: Record<string, number>;
}

export function LineItemsEditor({ items, products, onChange, showDiscount, availableStock }: Props) {
  function update(idx: number, patch: Partial<LineItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function add() {
    onChange([...items, { product_id: '', qty: '1', unit_price: '0', discount: '0' }]);
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function onProductPick(idx: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    const price = showDiscount ? String(p?.sell_price ?? 0) : String(p?.default_cost ?? 0);
    update(idx, { product_id: productId, unit_price: price });
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ minWidth: 200 }}>Barang</th>
              <th className="num" style={{ width: 90 }}>Qty</th>
              <th className="num" style={{ width: 130 }}>{showDiscount ? 'Harga Jual' : 'Harga Beli'}</th>
              {showDiscount && <th className="num" style={{ width: 110 }}>Diskon</th>}
              <th className="num" style={{ width: 130 }}>Subtotal</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const qty = Number(it.qty) || 0;
              const price = Number(it.unit_price) || 0;
              const disc = Number(it.discount) || 0;
              const subtotal = qty * price - (showDiscount ? disc : 0);
              const avail = availableStock?.[it.product_id];
              const short = showDiscount && avail !== undefined && qty > avail;
              return (
                <tr key={idx}>
                  <td>
                    <Select value={it.product_id} error={short} onChange={(e) => onProductPick(idx, e.target.value)}>
                      <option value="">— Pilih barang —</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </Select>
                    {short && <span className="field-error">Stok hanya {avail}</span>}
                  </td>
                  <td><NumberInput value={it.qty} min={0} onChange={(e) => update(idx, { qty: e.target.value })} /></td>
                  <td><NumberInput value={it.unit_price} min={0} onChange={(e) => update(idx, { unit_price: e.target.value })} /></td>
                  {showDiscount && <td><NumberInput value={it.discount ?? '0'} min={0} onChange={(e) => update(idx, { discount: e.target.value })} /></td>}
                  <td className="num">{formatCurrency(subtotal)}</td>
                  <td className="text-right"><Button size="sm" variant="ghost" onClick={() => remove(idx)}>✕</Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-8"><Button size="sm" variant="secondary" onClick={add}>+ Tambah baris</Button></div>
    </div>
  );
}
