import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '@/auth/AuthProvider';
import type { Module } from '@/lib/permissions';

interface Item { to: string; label: string; icon: string; module?: Module }
interface Group { section: string; items: Item[] }

const NAV: Group[] = [
  { section: '', items: [{ to: '/', label: 'Dashboard', icon: '📊' }] },
  {
    section: 'Master Data',
    items: [
      { to: '/products', label: 'Barang', icon: '📦', module: 'products' },
      { to: '/categories', label: 'Kategori', icon: '🏷️', module: 'categories' },
      { to: '/suppliers', label: 'Supplier', icon: '🚚', module: 'suppliers' },
      { to: '/branches', label: 'Cabang', icon: '🏢', module: 'branches' },
    ],
  },
  {
    section: 'Inventory',
    items: [
      { to: '/inventory', label: 'Stok', icon: '🧮', module: 'inventory' },
      { to: '/movements', label: 'Stock Movement', icon: '🔁', module: 'inventory' },
      { to: '/adjustments', label: 'Penyesuaian Stok', icon: '⚖️', module: 'adjustments' },
    ],
  },
  {
    section: 'Transaksi',
    items: [
      { to: '/purchases', label: 'Pembelian', icon: '🛒', module: 'purchases' },
      { to: '/sales', label: 'Penjualan', icon: '💰', module: 'sales' },
    ],
  },
  {
    section: 'Laporan',
    items: [{ to: '/reports', label: 'Laporan & Export', icon: '📈', module: 'reports' }],
  },
  {
    section: 'Administrasi',
    items: [
      { to: '/users', label: 'User', icon: '👥', module: 'users' },
      { to: '/roles', label: 'Role & Permission', icon: '🔑', module: 'roles' },
      { to: '/audit', label: 'Audit Log', icon: '📝', module: 'audit' },
    ],
  },
];

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { can } = useAuth();
  return (
    <aside className={clsx('sidebar', open && 'open')}>
      <div className="sidebar-brand">
        <span className="logo">D</span> Danus
      </div>
      <nav className="sidebar-nav">
        {NAV.map((g) => {
          const visible = g.items.filter((i) => !i.module || can(i.module, 'view'));
          if (visible.length === 0) return null;
          return (
            <div key={g.section || 'main'}>
              {g.section && <div className="nav-section">{g.section}</div>}
              {visible.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  end={i.to === '/'}
                  className={({ isActive }) => clsx('nav-link', isActive && 'active')}
                  onClick={onNavigate}
                >
                  <span className="ico">{i.icon}</span> {i.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
