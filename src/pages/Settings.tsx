import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { ArrowLeft, Sun, Moon, Bell, Shield, Globe, Save } from 'lucide-react';

export default function Settings() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const [sunlightMode, setSunlightMode] = useState(() => {
    // Migrate legacy key
    const legacy = localStorage.getItem('cik_sunlight_mode');
    if (legacy !== null) { localStorage.setItem('gp_sunlight_mode', legacy); localStorage.removeItem('cik_sunlight_mode'); }
    return localStorage.getItem('gp_sunlight_mode') === 'true';
  });
  const [notifications, setNotifications] = useState(
    () => localStorage.getItem('gp_notifications') !== 'false',
  );
  const [gpsAccuracy, setGpsAccuracy] = useState(
    () => localStorage.getItem('gp_gps_accuracy') ?? 'high',
  );

  useEffect(() => {
    localStorage.setItem('gp_notifications', String(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('gp_gps_accuracy', gpsAccuracy);
  }, [gpsAccuracy]);

  useEffect(() => {
    if (sunlightMode) {
      document.documentElement.classList.add('sunlight');
    } else {
      document.documentElement.classList.remove('sunlight');
    }
    localStorage.setItem('gp_sunlight_mode', String(sunlightMode));
  }, [sunlightMode]);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-brand-text-muted hover:text-brand-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-brand-text">Settings</h1>
      </header>

      <main className="p-6 max-w-lg mx-auto space-y-6">
        {/* Profile Info */}
        <section className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-brand-primary/20 rounded-full flex items-center justify-center">
              <span className="text-brand-primary font-bold text-xl">{user?.name?.charAt(0)}</span>
            </div>
            <div>
              <p className="font-semibold text-brand-text">{user?.name}</p>
              <p className="text-sm text-brand-text-muted">{user?.email}</p>
              <p className="text-xs text-brand-primary capitalize mt-0.5">{user?.role}</p>
            </div>
          </div>
        </section>

        {/* Sunlight Mode */}
        <section className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">Display</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {sunlightMode ? <Sun className="w-5 h-5 text-brand-warning" /> : <Moon className="w-5 h-5 text-brand-primary" />}
              <div>
                <p className="font-medium text-brand-text">Sunlight Mode</p>
                <p className="text-xs text-brand-text-muted">High-contrast outdoor display</p>
              </div>
            </div>
            <button
              onClick={() => setSunlightMode(!sunlightMode)}
              className={`relative w-12 h-7 rounded-full transition-colors ${sunlightMode ? 'bg-brand-warning' : 'bg-brand-border'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${sunlightMode ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">Notifications</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-brand-accent" />
              <div>
                <p className="font-medium text-brand-text">Push Notifications</p>
                <p className="text-xs text-brand-text-muted">Receive alerts for approvals</p>
              </div>
            </div>
            <button
              onClick={() => setNotifications(!notifications)}
              className={`relative w-12 h-7 rounded-full transition-colors ${notifications ? 'bg-brand-accent' : 'bg-brand-border'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${notifications ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
        </section>

        {/* GPS Accuracy */}
        <section className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">Location</h2>
          <div className="flex items-center gap-3 mb-3">
            <Globe className="w-5 h-5 text-brand-primary" />
            <p className="font-medium text-brand-text">GPS Accuracy</p>
          </div>
          <div className="flex gap-2">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => setGpsAccuracy(level)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  gpsAccuracy === level
                    ? 'bg-brand-primary text-white'
                    : 'bg-brand-bg border border-brand-border text-brand-text-muted hover:text-brand-text'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </section>

        {/* Security */}
        <section className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <h2 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">Security</h2>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-brand-accent" />
            <div>
              <p className="font-medium text-brand-text">Photo Tamper Protection</p>
              <p className="text-xs text-brand-text-muted">GPS & timestamp metadata locked</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
