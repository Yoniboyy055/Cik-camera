import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { useAuthStore } from '../store/auth';
import { Camera, MapPin, CheckCircle, ArrowLeft, Loader2, RefreshCw, UploadCloud, Timer, Grid3X3, Copy, Mic, MicOff, Ruler, FileText, Image as ImageIcon, Zap, ListChecks, Navigation, SwitchCamera, ZoomIn, ZoomOut, X as XIcon, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import Map3D from '../components/Map3D';
import imageCompression from 'browser-image-compression';
import { offlineDB, type OfflinePackage, type OfflineCapture, type OfflineBlob } from '../offline/db';
import { enqueueCreatePackage, enqueueCreateCapture } from '../offline/syncManager';
import { sha256Blob } from '../offline/evidence';

const GPS_OPTIONS: Record<string, PositionOptions> = {
  low:    { enableHighAccuracy: false, maximumAge: 60_000, timeout: 3_000 },
  medium: { enableHighAccuracy: true,  maximumAge: 15_000, timeout: 6_000 },
  high:   { enableHighAccuracy: true,  maximumAge: 0,      timeout: 12_000 },
};

function getGpsOptions(): PositionOptions {
  const level = localStorage.getItem('gp_gps_accuracy') ?? 'high';
  return GPS_OPTIONS[level] ?? GPS_OPTIONS.high;
}

type Step = 'picker' | 'checklist' | 'camera' | 'review' | 'uploading' | 'success';

interface Requirement {
  id: string;
  label: string;
  capture_type: 'wide' | 'measurement' | 'detail';
  is_required: number;
  status?: 'pending' | 'captured';
}


export default function CaptureFlow() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  
  const [step, setStep] = useState<Step>('picker');
  const [projects, setProjects] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  
  const [projectId, setProjectId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [manualProjectName, setManualProjectName] = useState('');
  const [manualTemplateName, setManualTemplateName] = useState('');
  const [currentRequirementId, setCurrentRequirementId] = useState('');
  
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, { data: string; note: string; measurement: string; unit: string }>>({});
  
  const [note, setNote] = useState('');
  const [measurement, setMeasurement] = useState('');
  const [unit, setUnit] = useState('m');
  const [isQuickCapture, setIsQuickCapture] = useState(false);
  
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number; altitude?: number | null } | null>(null);
  const [address, setAddress] = useState('Acquiring location...');
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [timerCount, setTimerCount] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [saveToGallery, setSaveToGallery] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(1);
  const [isZoomSupported, setIsZoomSupported] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  const recognitionRef = useRef<any>(null);
  const handleCaptureRef = useRef<() => void>(() => {});

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const endpoint = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
      const res = await fetch(endpoint, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const displayName = data?.display_name;
      if (displayName && typeof displayName === 'string') {
        setAddress(displayName);
      }
    } catch {
      // Keep GPS fallback if reverse geocoding fails.
    }
  }, []);

  const handleUserMedia = useCallback((stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    if (!track?.getCapabilities) return;
    const capabilities = track.getCapabilities() as any;

    if (capabilities.zoom) {
      setIsZoomSupported(true);
      setMinZoom(capabilities.zoom.min || 1);
      setMaxZoom(capabilities.zoom.max || 3);
      setZoom(capabilities.zoom.min || 1);
    } else {
      setIsZoomSupported(false);
      setZoom(1);
      setMinZoom(1);
      setMaxZoom(1);
    }

    setIsTorchSupported(!!capabilities.torch);
  }, []);

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
      })
      .catch(() => { setProjects([]); });
    fetch('/api/task-templates')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setTemplates(list);
      })
      .catch(() => { setTemplates([]); });
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ 
            lat: pos.coords.latitude, 
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude
          });
          setAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
          reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => console.error(err),
        getGpsOptions()
      );
    }
  }, [reverseGeocode]);

  const startPackage = async () => {
    const customProjectName = manualProjectName.trim();
    const customTaskText = manualTemplateName.trim();
    const hasProject = !!projectId || !!customProjectName;
    const hasTemplate = isQuickCapture || !!templateId || !!customTaskText;
    if (!hasProject || !hasTemplate) return;

    const quickCaptureReq = [{
      id: 'quick-capture',
      label: 'Field Proof',
      capture_type: 'wide' as const,
      is_required: 0
    }];

    try {
      const res = await fetch('/api/capture-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: user?.id, 
          project_id: projectId || null,
          custom_project_name: projectId ? null : customProjectName,
          task_template_id: isQuickCapture ? null : (templateId || null),
          custom_task_text: isQuickCapture || templateId ? null : customTaskText
        }),
      });
      if (!res.ok) throw new Error('capture-packages API error');
      const { id } = await res.json();
      setPackageId(id);
      
      if (isQuickCapture || !templateId) {
        setRequirements(quickCaptureReq);
        setCurrentRequirementId('quick-capture');
        setStep('camera');
      } else {
        const reqRes = await fetch(`/api/task-templates/${templateId}/requirements`);
        const reqs = await reqRes.json();
        setRequirements(reqs);
        setStep('checklist');
      }
    } catch (err) {
      console.error(err);
      // Fallback: local package ID → Quick Capture so the worker is never blocked
      setPackageId(`local-${crypto.randomUUID()}`);
      setIsQuickCapture(true);
      setRequirements(quickCaptureReq);
      setCurrentRequirementId('quick-capture');
      setStep('camera');
    }
  };

  const drawOverlayAndCapture = useCallback(async () => {
    const video = webcamRef.current?.video;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw full resolution video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply slight sharpening (unsharp mask approximation)
    ctx.globalAlpha = 0.1;
    ctx.drawImage(canvas, 1, 1);
    ctx.drawImage(canvas, -1, -1);
    ctx.globalAlpha = 1.0;

    const padding = 40;
    const cardRadius = 24;
    const topCardW = canvas.width - padding * 2;
    const topCardH = 220;
    const bottomCardH = 220;

    // Helper to draw semi-transparent glass card
    const drawGlassCard = (x: number, y: number, w: number, h: number) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, cardRadius);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'; // Darker for better contrast in sunlight
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();
    };

    // --- Top Info Card ---
    drawGlassCard(padding, padding, topCardW, topCardH);
    
    // Approved evidence header format
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText('GRANDPROOF VERIFIED CAPTURE', padding + 40, padding + 60);

    // Project Name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 42px sans-serif';
    const projectName = projects.find(p => p.id === projectId)?.name || manualProjectName || 'Unknown Project';
    ctx.fillText(`Project: ${projectName}`, padding + 40, padding + 130);

    // Task Name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '32px sans-serif';
    const templateName = templates.find(t => t.id === templateId)?.name || manualTemplateName || 'Quick Capture';
    const reqLabel = requirements.find(r => r.id === currentRequirementId)?.label || '';
    ctx.fillText(`Task: ${templateName}${reqLabel ? ` - ${reqLabel}` : ''}`, padding + 40, padding + 178);

    // Date/Time (Top Right)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 30px monospace';
    ctx.textAlign = 'right';
    const dateStr = format(new Date(), 'MMM d, yyyy h:mm a');
    ctx.fillText(`Time: ${dateStr}`, canvas.width - padding - 40, padding + 60);
    ctx.textAlign = 'left';

    // --- Bottom Info Card ---
    const bottomY = canvas.height - padding - bottomCardH;
    drawGlassCard(padding, bottomY, topCardW, bottomCardH);

    // Location Address
    ctx.fillStyle = 'white';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(`Worker: ${user?.name ?? 'Unknown'}`, padding + 40, bottomY + 62);

    // GPS Coordinates + accuracy
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '28px monospace';
    const latStr = location?.lat.toFixed(7) || '0.0000000';
    const lngStr = location?.lng.toFixed(7) || '0.0000000';
    const accStr = location?.accuracy ? `±${location.accuracy.toFixed(1)}m` : '';
    ctx.fillText(`GPS: ${latStr}, ${lngStr}`, padding + 40, bottomY + 112);
    ctx.fillText(`Accuracy: ${accStr || 'n/a'}`, padding + 40, bottomY + 152);

    // Capture ID
    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    const captureStampId = `GP-${packageId ? packageId.slice(0, 8) : 'LOCAL'}-${Date.now().toString().slice(-6)}`;
    ctx.fillText(`Capture ID: ${captureStampId}`, padding + 40, bottomY + 192);

    // --- Map Snapshot (Bottom Right) ---
    const mapSize = 180;
    const mapX = canvas.width - padding - 40 - mapSize;
    const mapY = bottomY + 20;
    
    try {
      // Use a static map API (OpenStreetMap based)
      const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${location?.lat},${location?.lng}&zoom=15&size=${mapSize}x${mapSize}&maptype=mapnik&markers=${location?.lat},${location?.lng},red-pushpin`;
      const mapImg = new Image();
      mapImg.crossOrigin = 'anonymous';
      mapImg.src = mapUrl;
      
      await new Promise((resolve, reject) => {
        mapImg.onload = resolve;
        mapImg.onerror = reject;
        setTimeout(reject, 3000); // Timeout after 3s
      });
      
      ctx.drawImage(mapImg, mapX, mapY, mapSize, mapSize);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.strokeRect(mapX, mapY, mapSize, mapSize);
    } catch (e) {
      console.error('Failed to load map snapshot', e);
    }

    // Export high-quality JPEG
    const finalImage = canvas.toDataURL('image/jpeg', 0.95);
    setPhotoData(finalImage);
    setStep('review');
  }, [webcamRef, projectId, templateId, currentRequirementId, address, location, user, projects, templates, requirements, measurement, unit, manualProjectName, manualTemplateName]);

  const handleCapture = useCallback(async () => {
    await drawOverlayAndCapture();
  }, [drawOverlayAndCapture]);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onresult = (event: any) => {
          const lastResultIndex = event.results.length - 1;
          const transcript = event.results[lastResultIndex][0].transcript.toLowerCase();
          
          if (transcript.includes('capture') || transcript.includes('shoot') || transcript.includes('cheese') || transcript.includes('take photo')) {
            handleCaptureRef.current();
          }
        };

        recognitionRef.current.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
          if (event.error === 'not-allowed') {
            setIsVoiceActive(false);
          }
        };
        
        recognitionRef.current.onend = () => {
          if (isVoiceActive && step === 'camera') {
            try {
              recognitionRef.current?.start();
            } catch (e) {
              // Ignore already started errors
            }
          }
        };
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isVoiceActive, step]);

  useEffect(() => {
    if (isVoiceActive && step === 'camera' && recognitionRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error(e);
      }
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isVoiceActive, step]);

  useEffect(() => {
    const video = webcamRef.current?.video;
    if (!video?.srcObject) return;

    const track = (video.srcObject as MediaStream).getVideoTracks()[0];
    if (!track?.applyConstraints) return;

    const advanced: any[] = [];
    if (isZoomSupported) {
      advanced.push({ zoom });
    }
    if (isTorchSupported) {
      advanced.push({ torch: isTorchOn });
    }
    if (advanced.length === 0) return;

    track.applyConstraints({ advanced } as any).catch(() => {
      // Some browsers/devices reject runtime constraints.
    });
  }, [zoom, isZoomSupported, isTorchOn, isTorchSupported]);

  const handleTimerCapture = async () => {
    if (isTimerActive) return;
    setIsTimerActive(true);
    setTimerCount(3);
    
    let count = 3;
    const interval = setInterval(async () => {
      count -= 1;
      setTimerCount(count);
      if (count === 0) {
        clearInterval(interval);
        setIsTimerActive(false);
        await drawOverlayAndCapture();
      }
    }, 1000);
  };

  const savePhotoToPackage = () => {
    if (!photoData || !currentRequirementId) return;

    if (saveToGallery) {
      const link = document.createElement('a');
      link.href = photoData;
      link.download = `grandproof-capture-${format(new Date(), 'yyyyMMdd-HHmmss')}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setCapturedPhotos(prev => ({
      ...prev,
      [currentRequirementId]: { data: photoData, note, measurement, unit }
    }));
    setStep('checklist');
    setPhotoData(null);
    setNote('');
    setMeasurement('');
  };

  const handleUpload = async () => {
    setStep('uploading');

    // ── Offline path ──────────────────────────────────────────────────────────
    if (!navigator.onLine || packageId.startsWith('local-')) {
      try {
        const localPkgId = packageId.startsWith('local-') ? packageId : `local-${crypto.randomUUID()}`;

        const offlinePkg: OfflinePackage = {
          package_id: localPkgId,
          user_id: user?.id ?? '',
          project_id: projectId || null,
          custom_project_name: projectId ? null : manualProjectName || null,
          task_template_id: templateId || null,
          custom_task_text: templateId ? null : manualTemplateName || null,
          status: 'pending',
          sync_state: 'queued',
          created_at: new Date().toISOString(),
        };
        await offlineDB.savePackage(offlinePkg);
        await enqueueCreatePackage(localPkgId);

        for (const [reqId, photo] of Object.entries(capturedPhotos)) {
          const rawBlob = await (await fetch(photo.data)).blob();
          const sha256 = await sha256Blob(rawBlob);
          const captureId = `cap-${crypto.randomUUID()}`;
          const blobId = `blob-${crypto.randomUUID()}`;

          const offlineBlob: OfflineBlob = {
            blob_id: blobId,
            package_id: localPkgId,
            capture_id: captureId,
            blob: rawBlob,
            mime: 'image/jpeg',
            bytes: rawBlob.size,
          };
          await offlineDB.saveBlob(offlineBlob);

          const offlineCap: OfflineCapture = {
            capture_id: captureId,
            package_id: localPkgId,
            blob_id: blobId,
            user_id: user?.id ?? '',
            project_id: projectId || null,
            requirement_id: reqId === 'quick-capture' ? null : reqId,
            note: photo.note || null,
            measurement: photo.measurement || null,
            unit: photo.unit || null,
            latitude: location?.lat ?? null,
            longitude: location?.lng ?? null,
            gps_accuracy_m: location?.accuracy ?? null,
            altitude_m: location?.altitude ?? null,
            address: address || null,
            evidence_sha256: sha256,
            sync_state: 'queued',
            captured_at: new Date().toISOString(),
          };
          await offlineDB.saveCapture(offlineCap);
          await enqueueCreateCapture(captureId);
        }

        setStep('success');
        return;
      } catch (err) {
        console.error('Offline save failed:', err);
        alert('Failed to save offline. Please try again.');
        setStep('checklist');
        return;
      }
    }

    // ── Online path ───────────────────────────────────────────────────────────
    try {
      // Upload each photo in the package
      const uploadPromises = Object.entries(capturedPhotos).map(async ([reqId, photo]) => {
        // High quality compression
        const blob = await (await fetch(photo.data)).blob();
        const compressedFile = await imageCompression(blob as File, {
          maxSizeMB: 3,
          maxWidthOrHeight: 4000,
          useWebWorker: true,
          initialQuality: 0.95
        });
        
        const reader = new FileReader();
        const compressedBase64 = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(compressedFile);
        });
        const evidenceSha256 = await sha256Blob(compressedFile);

        return fetch('/api/captures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id,
            project_id: projectId || null,
            package_id: packageId.startsWith('local-') ? null : packageId,
            requirement_id: reqId === 'quick-capture' ? null : reqId,
            note: photo.note,
            measurement: photo.measurement,
            unit: photo.unit,
            latitude: location?.lat,
            longitude: location?.lng,
            address,
            evidence_sha256: evidenceSha256,
            photo_data: compressedBase64
          }),
        });
      });

      await Promise.all(uploadPromises);
      
      // Update package status
      await fetch(`/api/packages/${packageId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });

      setStep('success');
    } catch (err) {
      console.error(err);
      alert('Upload failed. Please try again.');
      setStep('checklist');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex flex-col">
      {/* Header */}
      <header className="px-4 py-4 flex items-center gap-4 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-50 border-b border-white/10">
        {step !== 'success' && step !== 'uploading' && (
          <button onClick={() => {
            if (step === 'picker') navigate('/');
            else if (step === 'checklist') setStep('picker');
            else if (step === 'camera') setStep('checklist');
            else if (step === 'review') setStep('camera');
          }} className="p-2 -ml-2 text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
        )}
        <h1 className="font-semibold text-lg flex-1">
          {step === 'picker' && 'Start Proof Session'}
          {step === 'checklist' && 'Proof Checklist'}
          {step === 'camera' && 'Capture Proof'}
          {step === 'review' && 'Review Capture'}
          {step === 'uploading' && (navigator.onLine ? 'Uploading Package...' : 'Saving Offline...')}
          {step === 'success' && 'Success'}
        </h1>
        {step === 'camera' && (
          <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <div className={`w-2 h-2 rounded-full ${location?.accuracy && location.accuracy < 10 ? 'bg-emerald-500' : 'bg-yellow-500'} animate-pulse`}></div>
            <span className="text-[10px] font-mono text-emerald-400">
              {location?.accuracy ? `${location.accuracy.toFixed(1)}m` : 'GPS...'}
            </span>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col relative">
        {step === 'picker' && (
          <div className="p-6 space-y-6 max-w-md mx-auto w-full">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">Project</label>
                <select 
                  value={projectId} 
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                >
                  <option value="" className="text-neutral-900">Select Project (optional if typing custom)</option>
                  {projects.map(p => <option key={p.id} value={p.id} className="text-neutral-900">{p.name}</option>)}
                </select>
                <input
                  type="text"
                  value={manualProjectName}
                  onChange={(e) => setManualProjectName(e.target.value)}
                  placeholder="Or type custom project name"
                  className="mt-2 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              
              {!isQuickCapture && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Task Template</label>
                  <select 
                    value={templateId} 
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                  >
                    <option value="" className="text-neutral-900">Select Template (optional if typing custom)</option>
                    {templates.map(t => <option key={t.id} value={t.id} className="text-neutral-900">{t.name}</option>)}
                  </select>
                  <input
                    type="text"
                    value={manualTemplateName}
                    onChange={(e) => setManualTemplateName(e.target.value)}
                    placeholder="Or type custom task/job text"
                    className="mt-2 w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>

            <div className="space-y-3 mt-8">
              <button 
                disabled={
                  (!projectId && !manualProjectName.trim()) ||
                  (!isQuickCapture && !templateId && !manualTemplateName.trim())
                }
                onClick={startPackage}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ListChecks className="w-5 h-5" />
                {isQuickCapture ? 'Start Quick Capture' : 'Start Template Session'}
              </button>
              
              <button 
                onClick={() => setIsQuickCapture(!isQuickCapture)}
                className="w-full bg-white/5 hover:bg-white/10 text-white/70 font-medium py-3 rounded-xl transition-all text-sm border border-white/10"
              >
                {isQuickCapture ? 'Use Task Template' : 'Skip Template (Quick Capture)'}
              </button>
            </div>
          </div>
        )}

        {step === 'checklist' && (
          <div className="p-6 space-y-6 max-w-md mx-auto w-full">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <h3 className="text-sm font-medium text-white/50 uppercase tracking-wider mb-4">Required Proof Photos</h3>
              <div className="space-y-3">
                {requirements.map((req, idx) => {
                  const isCaptured = !!capturedPhotos[req.id];
                  return (
                    <button
                      key={req.id}
                      onClick={() => {
                        setCurrentRequirementId(req.id);
                        setStep('camera');
                      }}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left ${
                        isCaptured 
                          ? 'bg-emerald-500/10 border-emerald-500/30' 
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isCaptured ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/30'
                      }`}>
                        {isCaptured ? <CheckCircle className="w-5 h-5" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                      </div>
                      <div className="flex-1">
                        <p className={`font-medium ${isCaptured ? 'text-emerald-400' : 'text-white'}`}>{req.label}</p>
                        <p className="text-xs text-white/40">{req.capture_type.toUpperCase()}</p>
                      </div>
                      <Camera className={`w-5 h-5 ${isCaptured ? 'text-emerald-500' : 'text-white/20'}`} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4">
              {!isOnline && (
                <div className="flex items-center gap-2 mb-3 text-yellow-400 text-xs bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  Offline — capture will be saved locally and synced when you reconnect.
                </div>
              )}
              <button
                onClick={handleUpload}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50"
              >
                {isOnline ? <UploadCloud className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
                {isOnline ? 'Finalize & Upload Package' : 'Save Offline'}
              </button>
              <p className="text-center text-xs text-white/30 mt-4 italic">
                You can upload even if some items are missing.
              </p>
            </div>
          </div>
        )}

        {step === 'camera' && (
          <div className="flex-1 flex flex-col relative bg-black">
            <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
                <p className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Current Requirement</p>
                <p className="text-sm font-bold text-emerald-400">{requirements.find(r => r.id === currentRequirementId)?.label}</p>
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden flex items-center justify-center">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                videoConstraints={{ 
                  facingMode,
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                }}
                onUserMedia={handleUserMedia}
                className="w-full h-full object-cover"
              />

              {isZoomSupported && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 bg-black/40 backdrop-blur-md p-2 rounded-full border border-white/10 z-20">
                  <button
                    onClick={() => setZoom((z) => Math.min(maxZoom, z + 0.5))}
                    className="p-2 text-white hover:text-emerald-400 transition-colors"
                  >
                    <ZoomIn className="w-5 h-5" />
                  </button>
                  <div className="h-28 w-1 bg-white/20 rounded-full relative">
                    <div
                      className="absolute bottom-0 w-full bg-emerald-400 rounded-full"
                      style={{ height: `${maxZoom > minZoom ? ((zoom - minZoom) / (maxZoom - minZoom)) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <button
                    onClick={() => setZoom((z) => Math.max(minZoom, z - 0.5))}
                    className="p-2 text-white hover:text-emerald-400 transition-colors"
                  >
                    <ZoomOut className="w-5 h-5" />
                  </button>
                </div>
              )}
              
              {/* Timer Overlay */}
              {isTimerActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                  <span className="text-9xl font-bold text-white drop-shadow-2xl animate-pulse">
                    {timerCount}
                  </span>
                </div>
              )}

              {/* Alignment Guides */}
              {showGrid && (
                <div className="absolute inset-0 pointer-events-none border-[1px] border-emerald-500/30 m-4 rounded-lg flex items-center justify-center z-10">
                  {/* Grid Lines */}
                  <div className="w-full h-[1px] bg-white/20 absolute top-1/3"></div>
                  <div className="w-full h-[1px] bg-white/20 absolute top-2/3"></div>
                  <div className="w-[1px] h-full bg-white/20 absolute left-1/3"></div>
                  <div className="w-[1px] h-full bg-white/20 absolute left-2/3"></div>
                  
                  {/* Center Crosshair (Tape Alignment) */}
                  <div className="w-12 h-[2px] bg-emerald-500/80 absolute"></div>
                  <div className="w-[2px] h-12 bg-emerald-500/80 absolute"></div>
                  
                  {/* Horizon Line */}
                  <div className="w-full h-[1px] bg-emerald-500/40 absolute top-1/2 border-t border-dashed border-emerald-500/50"></div>
                  
                  <div className="bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full text-xs font-mono text-emerald-400 absolute top-6 border border-emerald-500/30 shadow-lg">
                    Align tape measure with center crosshair
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-black pb-10 pt-6 px-6 flex justify-between items-center gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFacingMode((v) => (v === 'environment' ? 'user' : 'environment'))}
                  className="p-4 rounded-full bg-white/10 text-white/80 hover:text-white transition-colors"
                  title="Switch camera"
                >
                  <SwitchCamera className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setShowGrid(!showGrid)} 
                  className={`p-4 rounded-full transition-colors ${showGrid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50'}`}
                >
                  <Grid3X3 className="w-6 h-6" />
                </button>
                {isTorchSupported && (
                <button 
                  onClick={() => setIsTorchOn(!isTorchOn)} 
                  className={`p-4 rounded-full transition-colors ${isTorchOn ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/10 text-white/50'}`}
                >
                  <Zap className="w-6 h-6" />
                </button>
                )}
              </div>
              
              <button 
                onClick={handleCapture}
                disabled={isTimerActive}
                className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center p-1 active:scale-95 transition-transform disabled:opacity-50"
              >
                <div className="w-full h-full bg-white rounded-full"></div>
              </button>
              
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsVoiceActive(!isVoiceActive)} 
                  className={`p-4 rounded-full transition-colors ${isVoiceActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50'}`}
                  title="Voice Shutter"
                >
                  {isVoiceActive ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                </button>
                <button 
                  onClick={handleTimerCapture}
                  disabled={isTimerActive}
                  className={`p-4 rounded-full transition-colors ${isTimerActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white'}`}
                >
                  <Timer className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            {isVoiceActive && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full text-xs font-medium text-emerald-400 border border-emerald-500/30 shadow-lg flex items-center gap-2 z-20">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                Listening for "capture"
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="flex-1 flex flex-col bg-neutral-900 overflow-y-auto">
            <div className="relative aspect-[3/4] w-full max-w-md mx-auto bg-black">
              {photoData && <img src={photoData} alt="Captured" className="w-full h-full object-contain" />}
            </div>

            <div className="p-6 max-w-md mx-auto w-full space-y-6">
              {location && (
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="h-32 w-full">
                    <Map3D latitude={location.lat} longitude={location.lng} className="w-full h-full" />
                  </div>
                  <div className="p-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-white font-medium truncate">{address || 'Locating...'}</p>
                        <p className="text-[10px] text-white/40 font-mono">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(`${location.lat}, ${location.lng}`);
                          alert('Coordinates copied to clipboard');
                        }}
                        className="p-2 bg-white/10 rounded-lg text-white/70 hover:text-white"
                        title="Copy Coordinates"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setNavSheetOpen(true)}
                        className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500/30"
                        title="Navigate"
                      >
                        <Navigation className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Nav app action sheet */}
              {navSheetOpen && location && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4" onClick={() => setNavSheetOpen(false)}>
                  <div className="bg-brand-surface rounded-2xl w-full max-w-sm p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-3">
                      <p className="font-semibold text-brand-text text-sm">Open in Navigation App</p>
                      <button onClick={() => setNavSheetOpen(false)} className="text-brand-text-muted"><XIcon className="w-4 h-4" /></button>
                    </div>
                    {[
                      { label: 'Google Maps', url: `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}` },
                      { label: 'Apple Maps',  url: `http://maps.apple.com/?daddr=${location.lat},${location.lng}` },
                      { label: 'Waze',        url: `https://waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes` },
                    ].map(({ label, url }) => (
                      <button
                        key={label}
                        onClick={() => { window.open(url, '_blank'); setNavSheetOpen(false); }}
                        className="w-full py-3 rounded-xl bg-brand-bg border border-brand-border text-brand-text text-sm font-medium hover:bg-brand-border/50 transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={saveToGallery}
                  onChange={(e) => setSaveToGallery(e.target.checked)}
                  className="accent-emerald-500"
                />
                Save photo to device gallery
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Measurement</label>
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      value={measurement}
                      onChange={(e) => setMeasurement(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <select 
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-xl px-2 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="m" className="text-neutral-900">m</option>
                      <option value="cm" className="text-neutral-900">cm</option>
                      <option value="inch" className="text-neutral-900">inch</option>
                      <option value="ft" className="text-neutral-900">ft</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Note</label>
                  <input 
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Optional"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setStep('camera')}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-4 rounded-xl transition-all"
                >
                  Retake
                </button>
                <button 
                  onClick={savePhotoToPackage}
                  className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirm & Next
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 'uploading' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-6" />
            <h2 className="text-xl font-bold mb-2">Uploading Proof...</h2>
            <p className="text-white/50 text-sm max-w-xs">Securing photo, metadata, and GPS coordinates to the dashboard.</p>
          </div>
        )}

        {step === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Upload Complete</h2>
            <p className="text-white/60 text-sm max-w-xs mb-10">Your proof photo has been securely saved and is ready for supervisor review.</p>
            
            <button 
              onClick={() => navigate('/')}
              className="w-full max-w-xs bg-white text-black font-bold py-4 rounded-xl hover:bg-neutral-200 transition-all"
            >
              Back to Home
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
