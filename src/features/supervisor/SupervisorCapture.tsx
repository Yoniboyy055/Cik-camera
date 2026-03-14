import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import { ArrowLeft, Camera, RotateCcw, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/auth';

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1920 },
  height: { ideal: 1080 },
};

export default function SupervisorCapture() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const webcamRef = useRef<Webcam>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleCapture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) setCapturedImage(imageSrc);
  }, []);

  const handleRetake = () => setCapturedImage(null);

  const dataUrlToBlob = (dataUrl: string): Blob => {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg';
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const handleSubmit = async () => {
    if (!capturedImage) return;
    setUploading(true);
    toast.loading('Uploading supervisor capture…', { id: 'sv-upload' });
    try {
      const geo = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) { resolve(null); return; }
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          enableHighAccuracy: true, timeout: 10_000, maximumAge: 0,
        });
      });

      const formData = new FormData();
      formData.append('photo', dataUrlToBlob(capturedImage), 'supervisor_capture.jpg');
      formData.append('capture_source', 'supervisor');
      if (note.trim()) formData.append('note', note.trim());
      if (geo) {
        formData.append('latitude', String(geo.coords.latitude));
        formData.append('longitude', String(geo.coords.longitude));
      }

      const res = await fetch('/api/captures', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());

      toast.success('Supervisor capture uploaded!', { id: 'sv-upload' });
      navigate('/');
    } catch (err) {
      console.error(err);
      toast.error('Upload failed. Please retry.', { id: 'sv-upload' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text flex flex-col">
      {/* Header */}
      <header className="bg-brand-surface border-b border-brand-border px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-brand-border/50 text-brand-text-muted">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="font-bold text-brand-text">Supervisor Capture</h1>
          <p className="text-xs text-brand-text-muted">{user?.name}</p>
        </div>
      </header>

      {/* Camera / Preview */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {capturedImage ? (
          <img src={capturedImage} alt="Captured" className="max-h-full max-w-full object-contain" />
        ) : (
          <Webcam
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.92}
            videoConstraints={VIDEO_CONSTRAINTS}
            className="w-full h-full object-cover"
            mirrored={false}
          />
        )}

        {/* Watermark */}
        <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none">
          <p className="text-white text-xs font-semibold tracking-wide">GrandProof · Supervisor</p>
        </div>

        {/* Retake button when image captured */}
        {capturedImage && (
          <button
            onClick={handleRetake}
            className="absolute top-4 right-4 p-2.5 bg-black/60 rounded-full text-white hover:bg-black/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="bg-brand-surface border-t border-brand-border p-4 flex flex-col gap-3">
        {capturedImage ? (
          <>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)…"
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2 text-sm text-brand-text resize-none h-16 focus:outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-brand-text-muted"
            />
            <div className="flex gap-3">
              <button
                onClick={handleRetake}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-border text-brand-text-muted hover:bg-brand-border/50 transition-colors font-semibold text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                Retake
              </button>
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-primary text-white font-bold text-sm disabled:opacity-50 hover:bg-brand-primary/90 transition-colors shadow-lg shadow-brand-primary/20"
              >
                <Upload className="w-4 h-4" />
                {uploading ? 'Uploading…' : 'Submit Capture'}
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={handleCapture}
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-brand-primary text-white font-bold text-base shadow-lg shadow-brand-primary/30 hover:bg-brand-primary/90 active:scale-95 transition-all"
          >
            <Camera className="w-6 h-6" />
            Take Photo
          </button>
        )}
      </div>
    </div>
  );
}
