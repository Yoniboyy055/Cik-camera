import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { ArrowLeft, Camera, CheckCircle, Clock, MapPin, X, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function MyCaptures() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [myPackages, setMyPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/captures')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
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
              project_name: capture.project_name || 'Manual Capture',
              template_name: capture.template_name || 'Quick Capture',
              captures: [],
            };
          }
          acc[pkgId].captures.push(capture);
          return acc;
        }, {});

        setMyPackages(Object.values(grouped));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user?.id]);

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/')} className="p-2 text-brand-text-muted hover:text-brand-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">My Captures</h1>
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
                    <h2 className="font-semibold text-brand-text">{pkg.project_name}</h2>
                    <p className="text-xs text-brand-text-muted mt-0.5">{pkg.template_name}</p>
                  </div>
                  <div className="text-right">
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
                    <p className="text-[10px] text-brand-text-muted mt-2">{format(new Date(pkg.created_at), 'MMM d, h:mm a')}</p>
                  </div>
                </div>

                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                  {pkg.captures.map((capture: any) => (
                    <button
                      key={capture.id}
                      onClick={() => setSelectedImage(capture.photo_url)}
                      className="aspect-square bg-brand-bg border border-brand-border rounded-lg overflow-hidden text-left"
                    >
                      <img src={capture.photo_url} alt="capture" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
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
