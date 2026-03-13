import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth';
import Login from './pages/Login';
import WorkerHome from './pages/WorkerHome';
import CaptureFlow from './pages/CaptureFlow';
import SupervisorDashboard from './pages/SupervisorDashboard';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import MyCaptures from './pages/MyCaptures';
import Chatbot from './components/Chatbot';
import { Toaster } from 'sonner';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: string[] }) {
  const user = useAuthStore((state) => state.user);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  const user = useAuthStore((state) => state.user);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-brand-bg text-brand-text font-sans">
        <Toaster position="top-center" theme="dark" />
        <Routes>
          <Route
            path="/login"
            element={user ? <Navigate to="/" replace /> : <Login />}
          />

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

          <Route
            path="/my-captures"
            element={
              <ProtectedRoute allowedRoles={['worker']}>
                <MyCaptures />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
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
