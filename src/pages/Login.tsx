import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { Camera } from 'lucide-react';

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');

  // Sign-in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const switchMode = (next: 'signin' | 'register') => {
    setError('');
    setMode(next);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials');
      }
      login(data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (regPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (regPassword !== regConfirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const regRes = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: regName, email: regEmail, password: regPassword }),
      });

      if (!regRes.ok) {
        const data = await regRes.json();
        throw new Error(data.error || 'Registration failed');
      }

      // Auto-login after successful registration
      const loginRes = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });

      if (!loginRes.ok) {
        throw new Error('Registration succeeded but login failed. Please sign in.');
      }

      const loginData = await loginRes.json();
      login(loginData.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text focus:ring-1 focus:ring-brand-primary outline-none transition-all';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md bg-brand-surface rounded-2xl shadow-xl p-8 border border-brand-border">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-brand-text">GrandProof</h1>
          <p className="text-brand-text-muted text-sm mt-1">
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Toggle */}
        <div className="flex rounded-xl overflow-hidden border border-brand-border mb-6">
          <button
            type="button"
            onClick={() => switchMode('signin')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'signin'
                ? 'bg-brand-primary text-white'
                : 'bg-transparent text-brand-text-muted hover:text-brand-text'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              mode === 'register'
                ? 'bg-brand-primary text-white'
                : 'bg-transparent text-brand-text-muted hover:text-brand-text'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="bg-brand-danger/10 text-brand-danger p-3 rounded-lg text-sm mb-6 text-center border border-brand-danger/20">
            {error}
          </div>
        )}

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="worker@cik.com or supervisor@cik.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed border border-brand-primary/50 shadow-lg shadow-brand-primary/20"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Name</label>
              <input
                type="text"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className={inputClass}
                placeholder="Your full name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Email</label>
              <input
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Password</label>
              <input
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className={inputClass}
                placeholder="Choose a password"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-brand-text-muted mb-1">Confirm Password</label>
              <input
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                className={inputClass}
                placeholder="Repeat your password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white font-medium py-3 rounded-xl transition-colors disabled:opacity-70 disabled:cursor-not-allowed border border-brand-primary/50 shadow-lg shadow-brand-primary/20"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {mode === 'signin' && (
          <div className="mt-6 text-center text-xs text-brand-text-muted">
            <p>Demo Accounts:</p>
            <p>worker@cik.com / password</p>
            <p>supervisor@cik.com / password</p>
          </div>
        )}
      </div>
    </div>
  );
}
