import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';

export default function Login() {
  const { signIn, signUp } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await signIn(email, password);
        nav('/');
      } else {
        await signUp(email, password, fullName);
        toast.success('Akun dibuat. Silakan login. (Admin perlu memberi role/izin.)');
        setMode('login');
      }
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="logo">D</span> Danus
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Dana Usaha — manajemen barang, stok & keuangan</p>

        <div className="grid" style={{ marginTop: 20 }}>
          {mode === 'signup' && (
            <Field label="Nama lengkap">
              <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Nama Anda" />
            </Field>
          )}
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label="Password">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} />
          </Field>
          <Button type="submit" loading={loading}>{mode === 'login' ? 'Masuk' : 'Daftar'}</Button>
        </div>

        <p className="muted" style={{ textAlign: 'center', marginTop: 18, marginBottom: 0 }}>
          {mode === 'login' ? (
            <>Belum punya akun? <a onClick={() => setMode('signup')} style={{ cursor: 'pointer' }}>Daftar</a></>
          ) : (
            <>Sudah punya akun? <a onClick={() => setMode('login')} style={{ cursor: 'pointer' }}>Masuk</a></>
          )}
        </p>
      </form>
    </div>
  );
}
