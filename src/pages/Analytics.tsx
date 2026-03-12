import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { ArrowLeft, TrendingUp, Camera, CheckCircle, XCircle } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';

const CHART_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6'];

interface Capture {
  id: string;
  user_name: string;
  project_name: string;
  status: string;
  created_at: string;
}

export default function Analytics() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch('/api/captures')
      .then((res) => res.json())
      .then((data: Capture[]) => {
        setCaptures(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Derive stats
  const totalCaptures = captures.length;
  const approved = captures.filter((c) => c.status === 'approved').length;
  const rejected = captures.filter((c) => c.status === 'rejected').length;
  const pending = captures.filter((c) => c.status === 'pending').length;

  // Captures by project
  const byProject = captures.reduce<Record<string, number>>((acc, c) => {
    acc[c.project_name] = (acc[c.project_name] || 0) + 1;
    return acc;
  }, {});
  const projectData = Object.entries(byProject)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Status breakdown for pie
  const statusData = [
    { name: 'Approved', value: approved },
    { name: 'Rejected', value: rejected },
    { name: 'Pending', value: pending },
  ].filter((d) => d.value > 0);

  // Captures over last 7 days (single-pass aggregation)
  const now = new Date();
  const capturesByDate = captures.reduce<Record<string, number>>((acc, c) => {
    const d = c.created_at?.slice(0, 10);
    if (d) acc[d] = (acc[d] || 0) + 1;
    return acc;
  }, {});
  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString('en-US', { weekday: 'short' });
    return { day: label, count: capturesByDate[dateStr] || 0 };
  });

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text">
      <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex items-center gap-4 sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="p-2 text-brand-text-muted hover:text-brand-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-brand-text">Site Intelligence</h1>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-8">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-brand-surface rounded-xl border border-brand-border animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-brand-danger font-medium">Failed to load analytics data.</p>
            <p className="text-brand-text-muted text-sm mt-1">Please try again later.</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon={<Camera className="w-5 h-5" />} label="Total Captures" value={totalCaptures} color="text-brand-primary" />
              <KpiCard icon={<CheckCircle className="w-5 h-5" />} label="Approved" value={approved} color="text-brand-accent" />
              <KpiCard icon={<XCircle className="w-5 h-5" />} label="Rejected" value={rejected} color="text-brand-danger" />
              <KpiCard icon={<TrendingUp className="w-5 h-5" />} label="Pending" value={pending} color="text-brand-warning" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Trend */}
              <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
                <h3 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">
                  Captures — Last 7 Days
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: '#11161D', border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB' }} />
                    <Line type="monotone" dataKey="count" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4, fill: '#3B82F6' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Status Pie */}
              <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
                <h3 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">
                  Status Breakdown
                </h3>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4}>
                        {statusData.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 12, color: '#9CA3AF' }} />
                      <Tooltip contentStyle={{ background: '#11161D', border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB' }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-brand-text-muted text-sm">
                    No data available
                  </div>
                )}
              </div>
            </div>

            {/* Captures by Project */}
            <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
              <h3 className="text-sm font-semibold text-brand-text-muted uppercase tracking-wider mb-4">
                Captures by Project
              </h3>
              {projectData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={projectData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: '#11161D', border: '1px solid #1F2937', borderRadius: 8, color: '#E5E7EB' }} />
                    <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-brand-text-muted text-sm">
                  No project data available
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-brand-surface rounded-xl border border-brand-border p-4 flex flex-col gap-2">
      <div className={`${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-brand-text">{value}</p>
      <p className="text-xs text-brand-text-muted font-medium">{label}</p>
    </div>
  );
}
