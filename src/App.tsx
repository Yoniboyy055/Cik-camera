import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './store/auth';
import WorkerHome from './pages/WorkerHome';
import CaptureFlow from './pages/CaptureFlow';
import SupervisorDashboard from './pages/SupervisorDashboard';
import Chatbot from './components/Chatbot';
import { Toaster } from 'sonner';

// ── TEMPORARY: auth bypassed — auto-login as guest worker ──────────────────
// TODO: re-enable login once Vercel env vars are confirmed working
const GUEST_USER = { id: 'u1', name: 'Worker', email: 'worker@cik.com', role: 'worker' };

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const user = useAuthStore((state) => state.user);

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const { user, login } = useAuthStore();

  // Auto-seed guest user so the app is always accessible (run once on mount)
  useEffect(() => {
    if (!useAuthStore.getState().user) {
      login(GUEST_USER);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-brand-bg text-brand-text font-sans">
        <Toaster position="top-center" theme="dark" />
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                {user?.role === 'supervisor' ? <SupervisorDashboard /> : <WorkerHome />}
              </ProtectedRoute>
            }
          />

          <Route
            path="/capture"
            element={
              <ProtectedRoute allowedRoles={['worker']}>
                <CaptureFlow />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {user && <Chatbot />}
      </div>
    </BrowserRouter>
  );
}
