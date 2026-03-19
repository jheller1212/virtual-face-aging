import { useRef, useState, useEffect, useCallback } from 'react';
import {
  bootstrapCameraKit,
  createMediaStreamSource,
  Transform2D,
} from '@snap/camera-kit';
import type { CameraKit, CameraKitSession, Lens } from '@snap/camera-kit';
import {
  Camera, CameraOff, Loader2, SlidersHorizontal, Download,
  HelpCircle, AlertCircle,
} from 'lucide-react';

function Tooltip({ text }: { text: string }) {
  return (
    <div className="relative group/tip inline-flex">
      <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-white bg-slate-800 rounded-lg shadow-lg opacity-0 group-hover/tip:opacity-100 pointer-events-none transition-opacity w-52 text-center z-20">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
}

// Use staging token for localhost, production for deployed
const API_TOKEN = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? import.meta.env.VITE_SNAP_STAGING_TOKEN ?? ''
  : import.meta.env.VITE_SNAP_PRODUCTION_TOKEN ?? '';

const LENS_GROUP_ID = import.meta.env.VITE_SNAP_LENS_GROUP_ID ?? '28a68bc3-4c98-421f-b6c3-7febcf6867b7';

export default function WebcamAging() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraKitRef = useRef<CameraKit | null>(null);
  const sessionRef = useRef<CameraKitSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [activeLensIdx, setActiveLensIdx] = useState(0);
  const [noToken, setNoToken] = useState(false);

  // Initialize Camera Kit SDK
  useEffect(() => {
    if (!API_TOKEN) {
      setNoToken(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const cameraKit = await bootstrapCameraKit({ apiToken: API_TOKEN });
        if (cancelled) return;
        cameraKitRef.current = cameraKit;

        // Load lenses from group
        const result = await cameraKit.lensRepository.loadLensGroups([LENS_GROUP_ID]);
        if (cancelled) return;
        // loadLensGroups returns Lens[] or { lenses: Lens[] } depending on version
        const loadedLenses = Array.isArray(result) ? result : (result as { lenses: Lens[] }).lenses ?? [];
        setLenses(loadedLenses);
        setSdkReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(`Failed to initialize Snap Camera Kit: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const startCamera = useCallback(async () => {
    if (!cameraKitRef.current || !canvasRef.current) return;

    setLoading(true);
    setError(null);

    try {
      const cameraKit = cameraKitRef.current;

      // Create session
      const session = await cameraKit.createSession({
        liveRenderTarget: canvasRef.current,
      });
      sessionRef.current = session;

      // Set canvas size
      canvasRef.current.width = 640;
      canvasRef.current.height = 480;

      // Get webcam stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;

      // Connect webcam to Camera Kit — mirror the front camera
      const source = createMediaStreamSource(stream, {
        transform: Transform2D.MirrorX,
        cameraType: 'user',
      });
      await session.setSource(source);

      // Apply first lens if available
      if (lenses.length > 0) {
        await session.applyLens(lenses[0]);
        setActiveLensIdx(0);
      }

      // Start rendering
      await session.play();

      setCameraOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start camera.');
    } finally {
      setLoading(false);
    }
  }, [lenses]);

  const stopCamera = useCallback(() => {
    sessionRef.current?.pause();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    sessionRef.current = null;
    setCameraOn(false);
  }, []);

  const switchLens = useCallback(async (idx: number) => {
    if (!sessionRef.current || !lenses[idx]) return;
    try {
      await sessionRef.current.applyLens(lenses[idx]);
      setActiveLensIdx(idx);
    } catch {
      setError('Failed to switch lens.');
    }
  }, [lenses]);

  const removeLens = useCallback(async () => {
    if (!sessionRef.current) return;
    await sessionRef.current.removeLens();
    setActiveLensIdx(-1);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sessionRef.current?.pause();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webcam-aged-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  if (noToken) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
        <AlertCircle className="w-8 h-8 mx-auto text-amber-500" />
        <h3 className="text-lg font-semibold text-slate-800">Snap Camera Kit not configured</h3>
        <p className="text-sm text-slate-600 max-w-lg mx-auto">
          The live webcam aging feature requires a Snap Camera Kit API token. Add your tokens to the
          environment variables <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">VITE_SNAP_STAGING_TOKEN</code> and <code className="px-1.5 py-0.5 bg-amber-100 rounded text-xs">VITE_SNAP_PRODUCTION_TOKEN</code> to enable this feature.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <SlidersHorizontal className="w-4 h-4" />
              AR Lens Controls
            </div>

            {/* Lens selector */}
            {lenses.length > 0 && cameraOn && (
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                  <span>Active lens</span>
                  <Tooltip text="Select which AR aging lens to apply. Each lens provides a different aging style and intensity." />
                </div>
                <div className="flex flex-wrap gap-2">
                  {lenses.map((lens, idx) => (
                    <button
                      key={lens.id}
                      onClick={() => switchLens(idx)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        activeLensIdx === idx
                          ? 'bg-amber-100 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'
                      }`}
                    >
                      {lens.name || `Lens ${idx + 1}`}
                    </button>
                  ))}
                  <button
                    onClick={removeLens}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      activeLensIdx === -1
                        ? 'bg-slate-100 border-slate-300 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    No filter
                  </button>
                </div>
              </div>
            )}

            {lenses.length === 0 && sdkReady && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  No lenses found in your lens group. Add an aging lens in the <a href="https://my-lenses.snapchat.com" target="_blank" rel="noopener noreferrer" className="underline">Snap Lens Scheduler</a> to enable AR effects.
                </p>
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 leading-relaxed">
                AR effects run entirely in your browser via Snap Camera Kit. No camera images are sent to any server. Face processing happens locally on this device.
              </p>
            </div>
          </div>

          {/* Camera buttons */}
          <div className="flex gap-3">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                disabled={loading || !sdkReady}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting camera...</>
                ) : !sdkReady ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading AR engine...</>
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

          {!sdkReady && !error && !noToken && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Initializing Snap Camera Kit...
            </div>
          )}
        </div>

        {/* Right: Video feed */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 min-h-[400px] flex items-center justify-center overflow-hidden">
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                borderRadius: '0.5rem',
                display: cameraOn ? 'block' : 'none',
              }}
            />
            {!cameraOn && (
              <div className="text-center space-y-3">
                <Camera className="w-10 h-10 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">Click "Start Camera" to begin live AR aging</p>
                <p className="text-xs text-slate-300">Requires camera permission. All processing happens locally — no images leave your device.</p>
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
