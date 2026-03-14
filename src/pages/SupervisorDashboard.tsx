import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import {
  LogOut, Search, Clock, CheckCircle, XCircle, FileText, Image as ImageIcon,
  Copy, FileOutput, Navigation, Settings, BarChart3, Menu, X, ChevronLeft,
  AlertTriangle, Download, Camera,
} from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { downloadEvidenceBundle, makeEvidenceAvailableOffline } from '../features/reports/ReportBundle';

// ─── Rejection reason modal ───────────────────────────────────────────────────

const REJECTION_CODES = [
  { code: 'poor_photo', label: 'Photo quality is insufficient' },
  { code: 'wrong_location', label: 'Wrong location / site mismatch' },
  { code: 'duplicate_capture', label: 'Duplicate capture detected' },
  { code: 'wrong_task', label: 'Capture does not match task scope' },
  { code: 'invalid_metadata', label: 'Metadata is incomplete or invalid' },
  { code: 'safety_issue', label: 'Safety issue observed' },
];

function RejectionModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (code: string, text: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-md shadow-xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <AlertTriangle className="w-5 h-5 text-brand-danger shrink-0" />
          <h3 className="font-bold text-brand-text text-lg">Rejection Reason</h3>
        </div>
        <div className="space-y-2 mb-4">
          {REJECTION_CODES.map((r) => (
            <button
              key={r.code}
              onClick={() => setCode(r.code)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm border transition-colors ${
                code === r.code
                  ? 'bg-brand-danger/10 border-brand-danger/40 text-brand-danger'
                  : 'bg-brand-bg border-brand-border text-brand-text hover:border-brand-danger/30'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Additional notes (optional)..."
          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text resize-none h-20 mb-5 focus:outline-none focus:ring-1 focus:ring-brand-danger placeholder:text-brand-text-muted"
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border border-brand-border text-brand-text-muted text-sm hover:bg-brand-border/50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!code}
            onClick={() => onConfirm(code, text)}
            className="flex-1 py-2.5 rounded-lg bg-brand-danger text-white font-semibold text-sm disabled:opacity-40 hover:bg-brand-danger/90 transition-colors"
          >
            Reject Package
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Sidebar constants ────────────────────────────────────────────────────────

const SIDEBAR_OPEN_W = 264;
const SIDEBAR_CLOSED_W = 72;

export default function SupervisorDashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [captures, setCaptures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCapture, setSelectedCapture] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Rejection modal
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  // Offline caching
  const [offlineCaching, setOfflineCaching] = useState(false);

  const fetchCaptures = () => {
    fetch('/api/captures')
      .then((res) => res.json())
      .then((data) => {
        // Group by package_id
        const grouped = data.reduce((acc: any, capture: any) => {
          const pkgId = capture.package_id || 'legacy';
          if (!acc[pkgId]) {
            acc[pkgId] = {
              id: pkgId,
              project_name: capture.project_name,
              template_name: capture.template_name || (capture.package_id ? 'Quick Capture' : 'Legacy Capture'),
              user_name: capture.user_name,
              created_at: capture.created_at,
              status: capture.status,
              captures: []
            };
          }
          acc[pkgId].captures.push(capture);
          return acc;
        }, {});
        setCaptures(Object.values(grouped));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchCaptures();
    const interval = setInterval(fetchCaptures, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredCaptures = useMemo(() => {
    return captures.filter((pkg: any) => {
      const search = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !search ||
        pkg.project_name?.toLowerCase().includes(search) ||
        pkg.user_name?.toLowerCase().includes(search) ||
        pkg.template_name?.toLowerCase().includes(search);
      const matchesWorker = !filterWorker || pkg.user_name === filterWorker;
      const matchesProject = !filterProject || pkg.project_name === filterProject;
      const matchesStatus = !filterStatus || pkg.status === filterStatus;
      const matchesDate = !filterDate || (pkg.created_at || '').startsWith(filterDate);
      return matchesSearch && matchesWorker && matchesProject && matchesStatus && matchesDate;
    });
  }, [captures, filterDate, filterProject, filterStatus, filterWorker, searchQuery]);

  const uniqueWorkers = useMemo(
    () => Array.from(new Set(captures.map((pkg: any) => pkg.user_name).filter(Boolean))),
    [captures]
  );

  const uniqueProjects = useMemo(
    () => Array.from(new Set(captures.map((pkg: any) => pkg.project_name).filter(Boolean))),
    [captures]
  );

  const imageUrlToDataUrl = async (url: string) => {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  };

  const updateStatus = async (id: string, status: string, rejectionCode?: string, rejectionText?: string) => {
    const endpoint = id === 'legacy' ? `/api/captures/${id}/status` : `/api/packages/${id}/status`;
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, rejection_reason_code: rejectionCode, rejection_reason_text: rejectionText }),
    });
    fetchCaptures();
    if (selectedCapture?.id === id) {
      setSelectedCapture({ ...selectedCapture, status });
    }
    toast.success(`Package marked as ${status}`);
  };

  const handleRejectConfirm = async (code: string, text: string) => {
    if (!rejectTarget) return;
    setRejectTarget(null);
    await updateStatus(rejectTarget, 'rejected', code, text);
  };

  const handleDownloadEvidence = () => {
    if (!selectedCapture) return;
    downloadEvidenceBundle(selectedCapture).catch(() =>
      toast.error('Failed to download evidence bundle.'),
    );
  };

  const handleMakeOffline = async () => {
    setOfflineCaching(true);
    toast.loading('Caching evidence images for offline access...', { id: 'offline' });
    try {
      const count = await makeEvidenceAvailableOffline(captures);
      toast.success(`${count} new images cached for offline access.`, { id: 'offline' });
    } catch {
      toast.error('Some images could not be cached.', { id: 'offline' });
    } finally {
      setOfflineCaching(false);
    }
  };

  const generateReport = async () => {
    if (captures.length === 0) {
      toast.error('No captures available to generate a report.');
      return;
    }

    toast.loading('Generating PDF report with images...', { id: 'pdf' });
    
    try {
      const doc = new jsPDF();
      const dateStr = format(new Date(), 'MMM d, yyyy');
      
      doc.setFontSize(22);
      doc.setTextColor(16, 185, 129); // emerald-500
      doc.text(`GrandProof Daily Site Report`, 14, 22);
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text(`Date: ${dateStr}`, 14, 32);
      doc.text(`Generated by: ${user?.name}`, 14, 38);
      doc.text(`Total Proof Packages: ${captures.length}`, 14, 44);
      
      let yPos = 55;
      
      for (const [index, pkg] of captures.entries()) {
        if (yPos > 240) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(16);
        doc.setTextColor(30, 41, 59); // slate-800
        doc.text(`Package #${index + 1}: ${pkg.project_name}`, 14, yPos);
        yPos += 8;
        
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text(`Template: ${pkg.template_name}`, 14, yPos);
        yPos += 6;
        doc.text(`Worker: ${pkg.user_name} | Time: ${format(new Date(pkg.created_at), 'h:mm a')}`, 14, yPos);
        yPos += 10;

        // Add thumbnails for the first 3 photos in the package
        const photos = pkg.captures.slice(0, 3);
        let xPos = 14;
        for (const capture of photos) {
          if (capture.photo_url) {
            try {
              const imageData = await imageUrlToDataUrl(capture.photo_url);
              doc.addImage(imageData, 'JPEG', xPos, yPos, 50, 65);
              xPos += 55;
            } catch (e) {
              doc.rect(xPos, yPos, 50, 65);
              doc.text('Image Error', xPos + 10, yPos + 30);
              xPos += 55;
            }
          }
        }
        
        if (photos.length > 0) yPos += 75;
        else yPos += 10;

        doc.setDrawColor(226, 232, 240); // slate-200
        doc.line(14, yPos, 196, yPos);
        yPos += 15;
      }
      
      doc.save(`grandproof-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('Report generated with images!', { id: 'pdf' });
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate report.', { id: 'pdf' });
    }
  };

  // ─── Sidebar nav items ─────────────────────────────────────────────────────

  const navItems = [
    { label: 'Proof Packages', icon: <FileText className="w-4 h-4 shrink-0" />, action: null, active: true },
    { label: 'Generate Daily Report', icon: <FileOutput className="w-4 h-4 shrink-0" />, action: generateReport },
    { label: 'Supervisor Capture', icon: <Camera className="w-4 h-4 shrink-0" />, action: () => navigate('/supervisor-capture') },
    { label: 'Site Intelligence', icon: <BarChart3 className="w-4 h-4 shrink-0" />, action: () => navigate('/analytics') },
    { label: 'Settings', icon: <Settings className="w-4 h-4 shrink-0" />, action: () => navigate('/settings') },
  ];

  const SidebarContent = ({ collapsed = false }: { collapsed?: boolean }) => (
    <div className="flex flex-col h-full">
      <div className={`p-4 border-b border-brand-border flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 bg-brand-primary rounded-lg flex items-center justify-center shadow-sm shrink-0">
          <ImageIcon className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <h1 className="font-bold text-brand-text text-lg tracking-tight whitespace-nowrap">GrandProof</h1>
        )}
      </div>
      <div className="p-3 flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.label}
            title={collapsed ? item.label : undefined}
            onClick={() => item.action?.()}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              item.active
                ? 'bg-brand-primary/10 text-brand-primary'
                : 'text-brand-text-muted hover:bg-brand-border/50 hover:text-brand-text'
            } ${collapsed ? 'justify-center' : ''}`}
          >
            {item.icon}
            {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
          </button>
        ))}
      </div>
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={handleMakeOffline}
            disabled={offlineCaching}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-brand-text-muted border border-brand-border hover:bg-brand-border/50 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 shrink-0" />
            {offlineCaching ? 'Caching…' : 'Make Available Offline'}
          </button>
        </div>
      )}
      <div className={`p-3 border-t border-brand-border mt-auto ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 bg-brand-border rounded-full flex items-center justify-center text-brand-text font-bold text-sm shrink-0">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-text truncate">{user?.name}</p>
              <p className="text-xs text-brand-text-muted">Supervisor</p>
            </div>
          </div>
        )}
        <button
          title={collapsed ? 'Sign Out' : undefined}
          onClick={logout}
          className={`flex items-center gap-2 px-3 py-2 text-brand-text-muted hover:bg-brand-border/50 rounded-lg text-sm font-medium border border-brand-border transition-colors ${collapsed ? '' : 'w-full justify-center'}`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-bg flex text-brand-text relative">

      {/* ── Desktop Collapsible Sidebar ────────────────────────────────────── */}
      <motion.aside
        animate={{ width: sidebarOpen ? SIDEBAR_OPEN_W : SIDEBAR_CLOSED_W }}
        transition={{ duration: sidebarOpen ? 0.22 : 0.18, ease: sidebarOpen ? 'easeOut' : 'easeIn' }}
        className="hidden md:flex flex-col bg-brand-surface border-r border-brand-border h-screen sticky top-0 overflow-hidden shrink-0 z-20"
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-3 right-2 z-10 p-1.5 rounded-md text-brand-text-muted hover:text-brand-text hover:bg-brand-border/50 transition-colors"
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
        <SidebarContent collapsed={!sidebarOpen} />
      </motion.aside>

      {/* ── Mobile hamburger ────────────────────────────────────────────────── */}
      <button
        className="md:hidden fixed top-4 left-4 z-30 p-2 bg-brand-surface border border-brand-border rounded-lg shadow"
        onClick={() => setMobileDrawerOpen(true)}
      >
        <Menu className="w-5 h-5 text-brand-text" />
      </button>

      {/* ── Mobile Drawer ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <motion.aside
              initial={{ x: -SIDEBAR_OPEN_W }}
              animate={{ x: 0 }}
              exit={{ x: -SIDEBAR_OPEN_W }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ width: SIDEBAR_OPEN_W }}
              className="fixed top-0 left-0 h-full z-50 bg-brand-surface border-r border-brand-border flex flex-col overflow-hidden"
            >
              <button
                className="absolute top-3 right-3 p-1.5 rounded-md text-brand-text-muted hover:text-brand-text"
                onClick={() => setMobileDrawerOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
              <SidebarContent collapsed={false} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>


      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        <header className="bg-brand-surface border-b border-brand-border px-6 py-4 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <h2 className="text-xl font-bold text-brand-text pl-10 md:pl-0">Proof Packages</h2>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
              <input
                type="text"
                placeholder="Search worker or project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-brand-bg border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary w-56 text-brand-text placeholder:text-brand-text-muted"
              />
            </div>
            <select value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)} className="px-2 py-2 bg-brand-bg border border-brand-border rounded-lg text-xs text-brand-text">
              <option value="">All Workers</option>
              {uniqueWorkers.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="px-2 py-2 bg-brand-bg border border-brand-border rounded-lg text-xs text-brand-text">
              <option value="">All Projects</option>
              {uniqueProjects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-2 bg-brand-bg border border-brand-border rounded-lg text-xs text-brand-text">
              <option value="">All Statuses</option>
              <option value="uploaded">Uploaded</option>
              <option value="submitted">Submitted</option>
              <option value="in_progress">In Progress</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="px-2 py-2 bg-brand-bg border border-brand-border rounded-lg text-xs text-brand-text" />
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 flex gap-6">
          {/* Feed */}
          <div className="flex-1 space-y-4 max-w-3xl">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-32 bg-brand-surface rounded-xl border border-brand-border animate-pulse"></div>)}
              </div>
            ) : filteredCaptures.length === 0 ? (
              <div className="text-center py-20 text-brand-text-muted">No packages found.</div>
            ) : (
              filteredCaptures.map((pkg) => (
                <div
                  key={pkg.id}
                  onClick={() => setSelectedCapture(pkg)}
                  className={`bg-brand-surface rounded-xl border p-4 flex gap-5 cursor-pointer transition-all hover:border-brand-primary/50 ${selectedCapture?.id === pkg.id ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-brand-border'}`}
                >
                  <div className="w-28 h-28 bg-brand-bg rounded-lg overflow-hidden shrink-0 border border-brand-border grid grid-cols-2 gap-0.5">
                    {pkg.captures.slice(0, 4).map((c: any, i: number) => (
                      <img key={i} src={c.photo_url} alt="" className="w-full h-full object-cover" />
                    ))}
                    {pkg.captures.length === 0 && <div className="col-span-2 flex items-center justify-center text-brand-text-muted text-xs">No Photos</div>}
                  </div>
                  <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
                    <div>
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-brand-text truncate">{pkg.project_name || 'Unknown Project'}</h3>
                        <span className={`ml-2 shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${pkg.status === 'approved' ? 'bg-brand-accent/20 text-brand-accent' : pkg.status === 'rejected' ? 'bg-brand-danger/20 text-brand-danger' : 'bg-brand-warning/20 text-brand-warning'}`}>
                          {pkg.status}
                        </span>
                      </div>
                      <p className="text-sm text-brand-text-muted">{pkg.template_name}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-sm text-brand-text-muted flex items-center gap-1.5">
                          <span className="w-5 h-5 bg-brand-border rounded-full flex items-center justify-center text-[10px] font-bold text-brand-text">{pkg.user_name?.charAt(0)}</span>
                          {pkg.user_name}
                        </p>
                        <span className="text-xs bg-brand-border/50 px-2 py-0.5 rounded text-brand-text-muted">{pkg.captures.length} Photos</span>
                      </div>
                    </div>
                    <p className="text-xs text-brand-text-muted flex items-center gap-1 mt-2">
                      <Clock className="w-3.5 h-3.5" /> {pkg.created_at ? format(new Date(pkg.created_at), 'MMM d, yyyy h:mm a') : '—'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Detail Panel */}
          <AnimatePresence>
          {selectedCapture && (
            <motion.div
              key="detail"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
              className="w-96 bg-brand-surface border border-brand-border rounded-xl shadow-sm flex flex-col h-fit sticky top-6 overflow-hidden shrink-0"
            >
              <div className="p-4 border-b border-brand-border flex justify-between items-center bg-brand-bg/50">
                <h3 className="font-bold text-brand-text">Package Details</h3>
                <button onClick={() => setSelectedCapture(null)} className="text-brand-text-muted hover:text-brand-text">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 overflow-y-auto max-h-[calc(100vh-260px)]">
                <div className="space-y-5">
                  {selectedCapture.captures.map((c: any) => (
                    <div key={c.id} className="space-y-3 border-b border-brand-border pb-5 last:border-0">
                      <p className="text-xs font-bold text-brand-primary uppercase tracking-widest">{c.requirement_label || 'Field Proof'}</p>
                      <div className="aspect-[3/4] bg-brand-bg rounded-lg overflow-hidden border border-brand-border">
                        <img src={c.photo_url} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                      </div>
                      {c.evidence_sha256 && (
                        <div className="bg-brand-bg p-2 rounded border border-brand-border text-xs">
                          <p className="text-brand-text-muted mb-0.5">Evidence SHA-256</p>
                          <p className="font-mono text-[10px] text-brand-text break-all">{c.evidence_sha256}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-brand-bg p-2 rounded border border-brand-border">
                          <p className="text-brand-text-muted mb-0.5">Measurement</p>
                          <p className="font-bold text-brand-text">{c.measurement ? `${c.measurement}${c.unit}` : 'N/A'}</p>
                        </div>
                        <div className="bg-brand-bg p-2 rounded border border-brand-border">
                          <div className="flex justify-between items-start">
                            <p className="text-brand-text-muted mb-0.5">Location</p>
                            {c.latitude && c.longitude && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(`${c.latitude}, ${c.longitude}`);
                                  toast.success('Coordinates copied');
                                }}
                                className="p-1 hover:bg-brand-primary/10 rounded text-brand-primary"
                                title="Copy Coordinates"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="font-bold text-brand-text truncate">{c.address || '—'}</p>
                        </div>
                      </div>
                      {c.note && (
                        <div className="bg-brand-bg p-2 rounded border border-brand-border text-xs">
                          <p className="text-brand-text-muted mb-0.5">Note</p>
                          <p className="text-brand-text">{c.note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-brand-border bg-brand-surface flex flex-col gap-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => setRejectTarget(selectedCapture.id)}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${selectedCapture.status === 'rejected' ? 'bg-brand-danger/20 text-brand-danger border border-brand-danger/30' : 'bg-brand-bg border border-brand-border text-brand-text hover:bg-brand-border/50'}`}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => updateStatus(selectedCapture.id, 'approved')}
                    className={`flex-1 py-2.5 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors ${selectedCapture.status === 'approved' ? 'bg-brand-accent text-brand-bg shadow-md shadow-brand-accent/20' : 'bg-brand-accent/10 border border-brand-accent/20 text-brand-accent hover:bg-brand-accent/20'}`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Approve
                  </button>
                </div>
                <button
                  onClick={handleDownloadEvidence}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs text-brand-text-muted border border-brand-border hover:bg-brand-border/50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Evidence Bundle
                </button>
              </div>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </main>

      {/* Rejection Modal */}
      <AnimatePresence>
        {rejectTarget && (
          <RejectionModal
            onConfirm={handleRejectConfirm}
            onCancel={() => setRejectTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
