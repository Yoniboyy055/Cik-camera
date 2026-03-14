import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { ArrowLeft, Camera, CheckCircle, Clock, X, XCircle, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { offlineDB } from '../offline/db';
import SyncStatusChip from '../components/offline/SyncStatusChip';
import QueueBadge from '../components/offline/QueueBadge';

export default function MyCaptures() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [myPackages, setMyPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // ── Server packages ──────────────────────────────────────────────────
      let serverPkgs: any[] = [];
      if (navigator.onLine) {
        try {
          const res = await fetch('/api/captures');
          const rows = res.ok ? await res.json() : [];
          const all = Array.isArray(rows) ? rows : [];
          const mine = all
            .filter((c: any) => c.user_id === user?.id)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          const grouped = mine.reduce((acc: Record<string, any>, capture: any) => {
            const pkgId = capture.package_id || `single-${capture.id}`;
            if (!acc[pkgId]) {
              acc[pkgId] = {
                id: pkgId,
                created_at: capture.created_at,
                status: capture.status,
                sync_state: 'confirmed',
                project_name: capture.project_name || 'Manual Capture',
                template_name: capture.template_name || 'Quick Capture',
                captures: [],
                isOffline: false,
              };
            }
            acc[pkgId].captures.push(capture);
            return acc;
          }, {});
          serverPkgs = Object.values(grouped);
        } catch {
          // Fall through — will show offline packages only
        }
      }

      // ── Offline packages from IDB ────────────────────────────────────────
      let offlinePkgs: any[] = [];
      try {
        const allOffline = await offlineDB.getAllPackages();
        const mine = allOffline.filter((p) => p.user_id === user?.id);
        // Filter out any that already exist in server results
        const serverIds = new Set(serverPkgs.map((p) => p.id));
        const pending = mine.filter((p) => !serverIds.has(p.package_id));

        offlinePkgs = await Promise.all(
          pending.map(async (p) => {
            const caps = await offlineDB.getCapturesByPackage(p.package_id);
            return {
              id: p.package_id,
              created_at: p.created_at,
              status: p.status,
              sync_state: p.sync_state,
              project_name: p.custom_project_name || p.project_id || 'Unsaved Project',
              template_name: p.custom_task_text || p.task_template_id || 'Quick Capture',
              captures: caps.map((c) => ({ ...c, photo_url: null, id: c.capture_id })),
              isOffline: true,
            };
          })
        );
      } catch {
        // IDB not available — skip
      }

      // Merge: offline first (most recent pending), then server
      const merged = [
        ...offlinePkgs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        ...serverPkgs,
      ];
      setMyPackages(merged);
      setLoading(false);
    }

    load();
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="p-2 text-brand-text-muted hover:text-brand-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold flex-1">My Captures</h1>
        <QueueBadge />
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 bg-brand-surface rounded-xl border border-brand-border animate-pulse"></div>
            ))}
          </div>
        ) : myPackages.length === 0 ? (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-10 text-center">
            <Camera className="w-8 h-8 text-brand-text-muted mx-auto mb-3" />
            <p className="text-brand-text-muted">No submitted captures yet.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {myPackages.map((pkg: any) => (
              <section key={pkg.id} className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-brand-border flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      {pkg.isOffline && <WifiOff className="w-3.5 h-3.5 text-yellow-400" />}
                      <h2 className="font-semibold text-brand-text">{pkg.project_name}</h2>
                    </div>
                    <p className="text-xs text-brand-text-muted mt-0.5">{pkg.template_name}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    {pkg.isOffline ? (
                      <SyncStatusChip state={pkg.sync_state ?? 'queued'} />
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold uppercase ${
                          pkg.status === 'approved'
                            ? 'bg-brand-accent/20 text-brand-accent'
                            : pkg.status === 'rejected'
                              ? 'bg-brand-danger/20 text-brand-danger'
                              : 'bg-brand-warning/20 text-brand-warning'
                        }`}
                      >
                        {pkg.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : null}
                        {pkg.status === 'rejected' ? <XCircle className="w-3 h-3" /> : null}
                        {pkg.status === 'uploaded' ? <Clock className="w-3 h-3" /> : null}
                        {pkg.status || 'uploaded'}
                      </span>
                    )}
                    <p className="text-[10px] text-brand-text-muted">{format(new Date(pkg.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {pkg.captures.map((capture: any) => (
                    <div
                      key={capture.id || capture.capture_id}
                      className="aspect-square bg-brand-bg border border-brand-border rounded-lg overflow-hidden"
                    >
                      {capture.photo_url ? (
                        <button onClick={() => setSelectedImage(capture.photo_url)} className="w-full h-full">
                          <img src={capture.photo_url} alt="capture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </button>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-brand-text-muted gap-1">
                          <WifiOff className="w-5 h-5" />
                          <span className="text-[10px]">Pending sync</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-6 right-6 p-2 bg-white/10 text-white rounded-full hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
          <img src={selectedImage} alt="full capture" className="max-w-full max-h-[85vh] rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}

