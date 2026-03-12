import { useState } from 'react';
import { useAuthStore } from '../store/auth';
import { Camera } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      login(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-md bg-brand-surface rounded-2xl shadow-xl p-8 border border-brand-border">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-brand-primary/20">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-brand-text">CIK Proof Capture</h1>
          <p className="text-brand-text-muted text-sm mt-1">Sign in to your account</p>
        </div>

        {error && (
          <div className="bg-brand-danger/10 text-brand-danger p-3 rounded-lg text-sm mb-6 text-center border border-brand-danger/20">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text focus:ring-1 focus:ring-brand-primary outline-none transition-all"
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
              className="w-full px-4 py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text focus:ring-1 focus:ring-brand-primary outline-none transition-all"
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
        
        <div className="mt-6 text-center text-xs text-brand-text-muted">
          <p>Demo Accounts:</p>
          <p>worker@cik.com / password</p>
          <p>supervisor@cik.com / password</p>
        </div>
      </div>
    </div>
  );
}
