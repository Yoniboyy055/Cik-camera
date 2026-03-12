import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { Camera, Clock, MapPin, CheckCircle, LogOut } from 'lucide-react';
import { format } from 'date-fns';

export default function WorkerHome() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [recentCaptures, setRecentCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/captures')
      .then((res) => res.json())
      .then((data) => {
        const userCaptures = data.filter((c: any) => c.user_id === user?.id);
        // Group by package_id
        const grouped = userCaptures.reduce((acc: any, capture: any) => {
          const pkgId = capture.package_id || 'legacy';
          if (!acc[pkgId]) {
            acc[pkgId] = {
              id: pkgId,
              project_name: capture.project_name,
              template_name: capture.template_name || 'Legacy Capture',
              created_at: capture.created_at,
              photos: []
            };
          }
          acc[pkgId].photos.push(capture);
          return acc;
        }, {});
        setRecentCaptures(Object.values(grouped).slice(0, 5));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-brand-bg pb-20 text-brand-text">
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-primary/20 rounded-full flex items-center justify-center">
            <span className="text-brand-primary font-bold text-lg">{user?.name?.charAt(0)}</span>
          </div>
          <div>
            <h1 className="font-semibold text-brand-text leading-tight">{user?.name}</h1>
            <p className="text-xs text-brand-text-muted">Field Worker</p>
          </div>
        </div>
        <button onClick={logout} className="p-2 text-brand-text-muted hover:text-brand-text transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      <main className="p-6 max-w-md mx-auto space-y-8">
        <section>
          <button
            onClick={() => navigate('/capture')}
            className="w-full bg-brand-primary hover:bg-brand-primary/90 text-white rounded-2xl p-6 shadow-lg shadow-brand-primary/20 transition-all flex flex-col items-center justify-center gap-4 active:scale-95 border border-brand-primary/50"
          >
            <div className="bg-white/20 p-4 rounded-full">
              <Camera className="w-10 h-10" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">Start Proof Session</h2>
              <p className="text-white/80 text-sm mt-1">Follow task-based checklist</p>
            </div>
          </button>
        </section>

        <section>
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-lg font-bold text-brand-text">Recent Sessions</h3>
            <span className="text-xs font-medium text-brand-primary bg-brand-primary/10 px-2 py-1 rounded-md">
              {recentCaptures.length} sessions
            </span>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-brand-surface rounded-xl h-24 animate-pulse border border-brand-border"></div>
              ))}
            </div>
          ) : recentCaptures.length === 0 ? (
            <div className="bg-brand-surface rounded-xl p-8 text-center border border-brand-border border-dashed">
              <Camera className="w-8 h-8 text-brand-text-muted mx-auto mb-3" />
              <p className="text-brand-text-muted text-sm">No sessions yet today.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCaptures.map((pkg: any) => (
                <div key={pkg.id} className="bg-brand-surface rounded-xl p-4 border border-brand-border flex gap-4 items-center">
                  <div className="w-16 h-16 rounded-lg bg-brand-bg overflow-hidden flex-shrink-0 relative border border-brand-border grid grid-cols-2 gap-0.5">
                    {pkg.photos.slice(0, 4).map((p: any, i: number) => (
                      <img key={i} src={p.photo_url} alt="" className="w-full h-full object-cover" />
                    ))}
                    {pkg.photos.length === 0 && <Camera className="w-6 h-6 text-brand-text-muted absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-brand-text truncate text-sm">{pkg.project_name}</h4>
                    <p className="text-xs text-brand-text-muted truncate mt-0.5">{pkg.template_name}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-brand-text-muted font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(pkg.created_at), 'h:mm a')}
                      </span>
                      <span className="flex items-center gap-1 text-brand-accent">
                        <CheckCircle className="w-3 h-3" />
                        {pkg.photos.length} Photos
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
