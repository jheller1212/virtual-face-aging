import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera, CameraOff, Loader2, Download, HelpCircle, AlertCircle, MonitorSmartphone,
} from 'lucide-react';

function Tooltip({ text }: { text: string }) {
  return (
    <div className="relative group/tip inline-flex">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity w-56 text-center z-20">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

export default function WebcamAging() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [hasSnapCamera, setHasSnapCamera] = useState(false);

  // Enumerate cameras on mount
  useEffect(() => {
    (async () => {
      try {
        // Need a brief getUserMedia call to trigger permission prompt, then enumerate
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(t => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices
          .filter(d => d.kind === 'videoinput')
          .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));

        setCameras(videoDevices);

        // Auto-detect Snapchat Camera
        const snapCam = videoDevices.find(d =>
          d.label.toLowerCase().includes('snap') || d.label.toLowerCase().includes('snapchat')
        );
        if (snapCam) {
          setSelectedCamera(snapCam.deviceId);
          setHasSnapCamera(true);
        } else if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch {
        setError('Camera access denied. Please allow camera permissions and reload.');
      }
    })();
  }, []);

  const startCamera = useCallback(async () => {
    if (!selectedCamera) { setError('No camera selected.'); return; }

    setLoading(true);
    setError(null);

    try {
      // Stop existing stream if any
      streamRef.current?.getTracks().forEach(t => t.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCamera }, width: 640, height: 480 },
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
          if (video.readyState >= 1) resolve();
        });
        await video.play();
      }
      setCameraOn(true);
    } catch {
      setError('Failed to start camera. Make sure the selected camera is available.');
    } finally {
      setLoading(false);
    }
  }, [selectedCamera]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  const switchCamera = useCallback(async (deviceId: string) => {
    setSelectedCamera(deviceId);
    if (cameraOn) {
      // Restart with new camera
      streamRef.current?.getTracks().forEach(t => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError('Failed to switch camera.');
      }
    }
  }, [cameraOn]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webcam-capture-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
          {/* Camera selector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MonitorSmartphone className="w-4 h-4" />
              Camera Source
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <span>Select camera</span>
                <Tooltip text="Choose your camera source. If you have the Snapchat Camera for Chrome extension installed with an aging lens active, select 'Snapchat Camera' for real-time face aging." />
              </div>
              <select
                value={selectedCamera}
                onChange={(e) => switchCamera(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none"
              >
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                    {cam.label.toLowerCase().includes('snap') ? ' (Aging filter)' : ''}
                  </option>
                ))}
                {cameras.length === 0 && <option value="">No cameras found</option>}
              </select>
            </div>

            {hasSnapCamera && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0" />
                <p className="text-xs text-green-700">Snapchat Camera detected — aging filter will be applied in real-time.</p>
              </div>
            )}

            {!hasSnapCamera && cameras.length > 0 && (
              <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs text-amber-700 mb-1 font-medium">For real-time face aging:</p>
                <ol className="text-xs text-amber-600 space-y-0.5 list-decimal list-inside">
                  <li>Install the <a href="https://chromewebstore.google.com/detail/snapchat-camera-for-chrom/mgijmfgdpljgnhcmokgeokdibogckgoj" target="_blank" rel="noopener noreferrer" className="underline font-medium">Snapchat Camera for Chrome</a> extension</li>
                  <li>Open the extension and select an aging lens</li>
                  <li>Reload this page — "Snapchat Camera" will appear in the dropdown above</li>
                </ol>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 leading-relaxed">
                All video processing happens locally on this device through the Snapchat Camera extension. No camera images are sent to any server by this website.
              </p>
            </div>
          </div>

          {/* Camera buttons */}
          <div className="flex gap-3">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                disabled={loading || cameras.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting camera...</>
                ) : (
                  <><Camera className="w-4 h-4" /> Start Camera</>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={stopCamera}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-red-600 border border-red-300 rounded-xl hover:bg-red-50 transition-colors"
                >
                  <CameraOff className="w-4 h-4" /> Stop Camera
                </button>
                <button
                  onClick={handleCapture}
                  className="flex items-center gap-2 px-6 py-3 text-sm font-medium border border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-4 h-4" /> Capture
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right: Video feed */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 min-h-[400px] flex items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                maxWidth: '100%',
                borderRadius: '0.5rem',
                display: cameraOn ? 'block' : 'none',
                transform: 'scaleX(-1)',
              }}
            />
            {!cameraOn && (
              <div className="text-center space-y-3">
                <Camera className="w-10 h-10 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">Click "Start Camera" to begin</p>
                <p className="text-xs text-slate-300">
                  {hasSnapCamera
                    ? 'Snapchat Camera detected — your aging filter is ready.'
                    : 'Use the Snapchat Camera extension for real-time face aging effects.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
