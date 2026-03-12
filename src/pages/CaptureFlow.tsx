import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { useAuthStore } from '../store/auth';
import { Camera, MapPin, CheckCircle, ArrowLeft, Loader2, RefreshCw, UploadCloud, Timer, Grid3X3, Copy, Mic, MicOff, Ruler, FileText, Image as ImageIcon, Zap, ListChecks } from 'lucide-react';
import { format } from 'date-fns';
import Map3D from '../components/Map3D';
import imageCompression from 'browser-image-compression';

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
  
  const webcamRef = useRef<Webcam>(null);
  const recognitionRef = useRef<any>(null);
  const handleCaptureRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetch('/api/projects').then(res => res.json()).then(setProjects);
    fetch('/api/task-templates').then(res => res.json()).then(setTemplates);
    
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
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const startPackage = async () => {
    if (!projectId) return;
    try {
      const res = await fetch('/api/capture-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: user?.id, 
          project_id: projectId, 
          task_template_id: isQuickCapture ? null : templateId 
        }),
      });
      const { id } = await res.json();
      setPackageId(id);
      
      if (isQuickCapture) {
        // Create a generic requirement for quick capture
        setRequirements([{
          id: 'quick-capture',
          label: 'Field Proof',
          capture_type: 'wide',
          is_required: 0
        }]);
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
    
    // CIK Proof Title
    ctx.fillStyle = '#34d399'; // emerald-400
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('CIK Proof', padding + 40, padding + 60);

    // Project Name
    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px sans-serif';
    const projectName = projects.find(p => p.id === projectId)?.name || 'Unknown Project';
    ctx.fillText(`Project: ${projectName}`, padding + 40, padding + 130);

    // Task Name
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '36px sans-serif';
    const templateName = templates.find(t => t.id === templateId)?.name || 'Unknown Task';
    const reqLabel = requirements.find(r => r.id === currentRequirementId)?.label || '';
    ctx.fillText(`${templateName}: ${reqLabel}`, padding + 40, padding + 180);

    // Date/Time (Top Right)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'right';
    const dateStr = format(new Date(), 'MMM d, yyyy h:mm a');
    ctx.fillText(dateStr, canvas.width - padding - 40, padding + 60);
    ctx.textAlign = 'left';

    // --- Bottom Info Card ---
    const bottomY = canvas.height - padding - bottomCardH;
    drawGlassCard(padding, bottomY, topCardW, bottomCardH);

    // Location Address
    ctx.fillStyle = 'white';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`📍 ${address}`, padding + 40, bottomY + 70);

    // GPS Coordinates
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '36px monospace';
    const latStr = location?.lat.toFixed(7) || '0.0000000';
    const lngStr = location?.lng.toFixed(7) || '0.0000000';
    const accStr = location?.accuracy ? `±${location.accuracy.toFixed(1)}m` : '';
    ctx.fillText(`${latStr}, ${lngStr} ${accStr}`, padding + 40, bottomY + 130);

    // Worker Name & Measurement
    ctx.fillStyle = 'white';
    ctx.font = '36px sans-serif';
    const measurementStr = measurement ? ` | 📏 ${measurement}${unit}` : '';
    ctx.fillText(`Worker: ${user?.name}${measurementStr}`, padding + 40, bottomY + 180);

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
  }, [webcamRef, projectId, templateId, currentRequirementId, address, location, user, projects, templates, requirements, measurement, unit]);

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
    if (video && video.srcObject) {
      const track = (video.srcObject as MediaStream).getVideoTracks()[0];
      const capabilities = track.getCapabilities() as any;
      if (capabilities.torch) {
        track.applyConstraints({
          advanced: [{ torch: isTorchOn }]
        } as any);
      }
    }
  }, [isTorchOn]);

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

        return fetch('/api/captures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user?.id,
            project_id: projectId,
            package_id: packageId,
            requirement_id: reqId === 'quick-capture' ? null : reqId,
            note: photo.note,
            measurement: photo.measurement,
            unit: photo.unit,
            latitude: location?.lat,
            longitude: location?.lng,
            address,
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
          {step === 'uploading' && 'Uploading Package...'}
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
                  <option value="" disabled className="text-neutral-900">Select Project</option>
                  {projects.map(p => <option key={p.id} value={p.id} className="text-neutral-900">{p.name}</option>)}
                </select>
              </div>
              
              {!isQuickCapture && (
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Task Template</label>
                  <select 
                    value={templateId} 
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-emerald-500 appearance-none"
                  >
                    <option value="" disabled className="text-neutral-900">Select Template</option>
                    {templates.map(t => <option key={t.id} value={t.id} className="text-neutral-900">{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-3 mt-8">
              <button 
                disabled={!projectId || (!isQuickCapture && !templateId)}
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
              <button
                onClick={handleUpload}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/50"
              >
                <UploadCloud className="w-5 h-5" />
                Finalize & Upload Package
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
                  facingMode: "environment",
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
                }}
                className="w-full h-full object-cover"
              />
              
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
                  onClick={() => setShowGrid(!showGrid)} 
                  className={`p-4 rounded-full transition-colors ${showGrid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-white/50'}`}
                >
                  <Grid3X3 className="w-6 h-6" />
                </button>
                <button 
                  onClick={() => setIsTorchOn(!isTorchOn)} 
                  className={`p-4 rounded-full transition-colors ${isTorchOn ? 'bg-yellow-500/20 text-yellow-500' : 'bg-white/10 text-white/50'}`}
                >
                  <Zap className="w-6 h-6" />
                </button>
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
                        onClick={() => {
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`, '_blank');
                        }}
                        className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 hover:bg-emerald-500/30"
                        title="Navigate"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

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
