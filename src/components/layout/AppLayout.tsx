import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/auth/AuthProvider';

export function AppLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = (profile?.full_name || profile?.email || '?')
    .split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <div className={clsx('backdrop-mobile', sidebarOpen && 'show')} onClick={() => setSidebarOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" onClick={() => setSidebarOpen((o) => !o)}>☰</button>
          <div style={{ flex: 1 }} />
          <div className="user-menu">
            <div className="user-chip" style={{ cursor: 'pointer' }} onClick={() => setMenuOpen((o) => !o)}>
              <div className="avatar">{initials}</div>
              <div style={{ lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600 }}>{profile?.full_name || profile?.email}</div>
                <div className="muted" style={{ fontSize: 12 }}>{isAdmin ? 'Admin Utama' : profile?.role_name || 'User'}</div>
              </div>
            </div>
            {menuOpen && (
              <div className="user-dropdown" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={signOut}>🚪 Keluar</button>
              </div>
            )}
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
