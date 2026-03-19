import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera, CameraOff, Loader2, Download, SlidersHorizontal,
  HelpCircle, AlertCircle,
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

interface FaceState {
  detected: boolean;
  x: number;
  y: number;
  s: number;
  rx: number;
  ry: number;
  rz: number;
  expressions: number[];
}

export default function WebcamAging() {
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const faceFilterRef = useRef<any>(null);
  const faceStateRef = useRef<FaceState>({
    detected: false, x: 0, y: 0, s: 0, rx: 0, ry: 0, rz: 0, expressions: [],
  });

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ageIntensity, setAgeIntensity] = useState(60);
  const [showWrinkles, setShowWrinkles] = useState(true);
  const [showSkinAging, setShowSkinAging] = useState(true);

  const ageIntensityRef = useRef(ageIntensity);
  const showWrinklesRef = useRef(showWrinkles);
  const showSkinAgingRef = useRef(showSkinAging);
  useEffect(() => { ageIntensityRef.current = ageIntensity; }, [ageIntensity]);
  useEffect(() => { showWrinklesRef.current = showWrinkles; }, [showWrinkles]);
  useEffect(() => { showSkinAgingRef.current = showSkinAging; }, [showSkinAging]);

  const drawAgingOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    const faceCanvas = faceCanvasRef.current;
    if (!overlay || !faceCanvas) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const W = faceCanvas.width;
    const H = faceCanvas.height;
    overlay.width = W;
    overlay.height = H;
    ctx.clearRect(0, 0, W, H);

    const face = faceStateRef.current;
    if (!face.detected) return;

    const factor = ageIntensityRef.current / 100;
    if (factor === 0) return;

    // Convert facefilter coordinates (-1..1) to canvas pixels
    const cx = (face.x + 1) * 0.5 * W;
    const cy = (1 - (face.y + 1) * 0.5) * H;
    const faceSize = face.s * W * 0.6;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-face.rz);

    // Skin aging: semi-transparent warm overlay on face region
    if (showSkinAgingRef.current) {
      const grad = ctx.createRadialGradient(0, 0, faceSize * 0.1, 0, 0, faceSize);
      grad.addColorStop(0, `rgba(120, 80, 50, ${factor * 0.15})`);
      grad.addColorStop(0.7, `rgba(100, 70, 45, ${factor * 0.1})`);
      grad.addColorStop(1, 'rgba(100, 70, 45, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, faceSize * 0.05, faceSize, faceSize * 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (showWrinklesRef.current) {
      const alpha = Math.min(factor * 0.8, 0.7);
      const lw = 1 + factor * 1.5;

      // Forehead wrinkles
      ctx.strokeStyle = `rgba(70, 40, 25, ${alpha})`;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';

      for (let i = 0; i < 4; i++) {
        const y = -faceSize * (0.6 + i * 0.08);
        const spread = faceSize * (0.35 - i * 0.03);
        ctx.beginPath();
        ctx.moveTo(-spread, y);
        ctx.quadraticCurveTo(0, y - 3 + Math.sin(i * 1.5) * 2, spread, y);
        ctx.stroke();
      }

      // Crow's feet (both sides)
      ctx.lineWidth = lw * 0.8;
      for (const side of [-1, 1]) {
        const ex = side * faceSize * 0.42;
        const ey = -faceSize * 0.15;
        for (let j = -2; j <= 2; j++) {
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(
            ex + side * faceSize * (0.08 + factor * 0.06),
            ey + j * faceSize * 0.04
          );
          ctx.stroke();
        }
      }

      // Nasolabial folds
      ctx.lineWidth = lw * 1.2;
      ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.8})`;
      for (const side of [-1, 1]) {
        const nx = side * faceSize * 0.18;
        ctx.beginPath();
        ctx.moveTo(nx, -faceSize * 0.05);
        ctx.quadraticCurveTo(
          nx + side * faceSize * 0.06,
          faceSize * 0.15,
          nx - side * faceSize * 0.02,
          faceSize * 0.35
        );
        ctx.stroke();
      }

      // Under-eye bags
      ctx.lineWidth = lw * 0.7;
      ctx.strokeStyle = `rgba(90, 55, 35, ${alpha * 0.5})`;
      for (const side of [-1, 1]) {
        const ux = side * faceSize * 0.2;
        const uy = -faceSize * 0.08;
        ctx.beginPath();
        ctx.moveTo(ux - faceSize * 0.1, uy);
        ctx.quadraticCurveTo(ux, uy + faceSize * 0.04, ux + faceSize * 0.1, uy);
        ctx.stroke();
      }

      // Lip lines
      ctx.lineWidth = lw * 0.5;
      ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.4})`;
      for (let i = -3; i <= 3; i++) {
        const lx = i * faceSize * 0.04;
        ctx.beginPath();
        ctx.moveTo(lx, faceSize * 0.25);
        ctx.lineTo(lx + (i > 0 ? 1.5 : -1.5), faceSize * 0.32);
        ctx.stroke();
      }

      // Age spots
      ctx.fillStyle = `rgba(100, 65, 35, ${alpha * 0.25})`;
      const spots = [
        [-0.25, -0.5, 3], [0.2, -0.55, 2.5], [-0.15, -0.3, 2],
        [0.3, -0.4, 3.5], [-0.3, 0.1, 2], [0.25, 0.05, 2.5],
        [0.35, -0.2, 2], [-0.35, -0.45, 3],
      ];
      for (const [rx, ry, r] of spots) {
        ctx.beginPath();
        ctx.arc(rx * faceSize, ry * faceSize, r * (0.5 + factor * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }

      // Forehead creases (vertical between brows)
      ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.6})`;
      ctx.lineWidth = lw;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * faceSize * 0.06, -faceSize * 0.45);
        ctx.lineTo(side * faceSize * 0.05, -faceSize * 0.55);
        ctx.stroke();
      }
    }

    ctx.restore();
  }, []);

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { JEELIZFACEFILTER, NN_4EXPR } = await import('facefilter');

      const canvas = faceCanvasRef.current;
      if (!canvas) throw new Error('Canvas not ready');

      faceFilterRef.current = JEELIZFACEFILTER;

      await new Promise<void>((resolve, reject) => {
        JEELIZFACEFILTER.init({
          canvas,
          NNC: NN_4EXPR,
          maxFacesDetected: 1,
          followZRot: true,

          callbackReady: (errCode: any) => {
            if (errCode) {
              reject(new Error(`FaceFilter error: ${errCode}`));
              return;
            }
            resolve();
          },

          callbackTrack: (state: any) => {
            faceStateRef.current = {
              detected: state.detected > 0.5,
              x: state.x,
              y: state.y,
              s: state.s,
              rx: state.rx,
              ry: state.ry,
              rz: state.rz,
              expressions: state.expressions ? [...state.expressions] : [],
            };

            // Draw aging overlay on the second canvas
            drawAgingOverlay();
          },
        });
      });

      setCameraOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start camera.');
    } finally {
      setLoading(false);
    }
  }, [drawAgingOverlay]);

  const stopCamera = useCallback(() => {
    try {
      faceFilterRef.current?.destroy();
    } catch {}
    faceFilterRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      try { faceFilterRef.current?.destroy(); } catch {}
    };
  }, []);

  const handleCapture = () => {
    const faceCanvas = faceCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!faceCanvas) return;

    // Composite both canvases
    const out = document.createElement('canvas');
    out.width = faceCanvas.width;
    out.height = faceCanvas.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(faceCanvas, 0, 0);
    if (overlay) ctx.drawImage(overlay, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aged-webcam-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Controls */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <SlidersHorizontal className="w-4 h-4" />
              Live Aging Controls
            </div>

            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">Aging intensity</span>
                  <Tooltip text="Controls the overall strength of the aging effect. Higher values show more pronounced wrinkles, skin changes, and age spots." />
                </div>
                <span className="font-medium text-slate-900">{ageIntensity}%</span>
              </div>
              <input
                type="range" min="0" max="100" value={ageIntensity}
                onChange={(e) => setAgeIntensity(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>None</span><span>Maximum</span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-600">Effect layers</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showWrinkles} onChange={(e) => setShowWrinkles(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Wrinkles, lines & age spots</span>
                <Tooltip text="Overlays wrinkle patterns on the forehead, around the eyes, nasolabial folds, lip lines, age spots, and frown lines — all tracked to the face in real-time." />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showSkinAging} onChange={(e) => setShowSkinAging(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Skin tone aging</span>
                <Tooltip text="Applies a warm, slightly desaturated overlay to the face region to simulate aged skin tone." />
              </label>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 leading-relaxed">
                All processing runs locally in your browser. No camera images are sent to any server.
              </p>
            </div>
          </div>

          {/* Camera buttons */}
          <div className="flex gap-3">
            {!cameraOn ? (
              <button
                onClick={startCamera}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
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
            <div className="relative" style={{ display: cameraOn ? 'block' : 'none' }}>
              <canvas
                ref={faceCanvasRef}
                width={640}
                height={480}
                style={{ maxWidth: '100%', borderRadius: '0.5rem' }}
              />
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '0.5rem',
                  pointerEvents: 'none',
                }}
              />
            </div>
            {!cameraOn && (
              <div className="text-center space-y-3">
                <Camera className="w-10 h-10 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">Click "Start Camera" to begin live aging</p>
                <p className="text-xs text-slate-300">All processing happens locally — no images leave your device.</p>
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
