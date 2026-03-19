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
  rz: number;
}

export default function WebcamAging() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const cameraOnRef = useRef(false);
  const faceFilterRef = useRef<any>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const faceStateRef = useRef<FaceState>({ detected: false, x: 0, y: 0, s: 0, rz: 0 });

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

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
        if (video.readyState >= 1) resolve();
      });
      await video.play();

      // Create a hidden canvas for facefilter (it needs its own WebGL canvas)
      const hiddenCanvas = document.createElement('canvas');
      hiddenCanvas.width = 320;
      hiddenCanvas.height = 240;
      hiddenCanvasRef.current = hiddenCanvas;

      // Init facefilter on the hidden canvas
      const { JEELIZFACEFILTER, NN_4EXPR } = await import('facefilter');
      faceFilterRef.current = JEELIZFACEFILTER;

      await new Promise<void>((resolve, reject) => {
        JEELIZFACEFILTER.init({
          canvas: hiddenCanvas,
          NNC: NN_4EXPR,
          maxFacesDetected: 1,
          followZRot: true,
          videoSettings: {
            videoElement: video,
          },

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
              rz: state.rz,
            };
          },
        });
      });

      cameraOnRef.current = true;
      setCameraOn(true);

      // Start render loop: draw video + aging overlay on visible canvas
      const renderLoop = () => {
        if (!cameraOnRef.current) return;

        const canvas = canvasRef.current;
        const vid = videoRef.current;
        if (!canvas || !vid || vid.readyState < 2) {
          animRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        const W = vid.videoWidth;
        const H = vid.videoHeight;
        canvas.width = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d')!;

        // Draw mirrored video
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(vid, 0, 0, W, H);
        ctx.restore();

        // Apply skin aging to the video pixels in the face region
        const face = faceStateRef.current;
        if (face.detected) {
          const factor = ageIntensityRef.current / 100;

          // Convert facefilter coords to canvas pixels (mirrored)
          const cx = (1 - (face.x + 1) * 0.5) * W; // mirrored
          const cy = (1 - (face.y + 1) * 0.5) * H;
          const faceSize = face.s * W * 0.55;

          // Skin desaturation in face region
          if (showSkinAgingRef.current && factor > 0) {
            const r = faceSize * 1.2;
            const sx = Math.max(0, Math.floor(cx - r));
            const sy = Math.max(0, Math.floor(cy - r));
            const sw = Math.min(W - sx, Math.ceil(r * 2));
            const sh = Math.min(H - sy, Math.ceil(r * 2));

            if (sw > 0 && sh > 0) {
              const imageData = ctx.getImageData(sx, sy, sw, sh);
              const d = imageData.data;
              const blend = factor * 0.25;
              const rcx = cx - sx;
              const rcy = cy - sy;

              for (let py = 0; py < sh; py++) {
                for (let px = 0; px < sw; px++) {
                  const dist = Math.sqrt((px - rcx) ** 2 + (py - rcy) ** 2);
                  if (dist > r) continue;
                  const falloff = 1 - (dist / r);
                  const b = blend * falloff;
                  const i = (py * sw + px) * 4;
                  const grey = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
                  d[i] = d[i] * (1 - b) + (grey + 10) * b;
                  d[i + 1] = d[i + 1] * (1 - b) + (grey - 2) * b;
                  d[i + 2] = d[i + 2] * (1 - b) + (grey - 8) * b;
                }
              }
              ctx.putImageData(imageData, sx, sy);
            }
          }

          // Draw wrinkle overlay
          if (showWrinklesRef.current && factor > 0) {
            drawWrinkles(ctx, cx, cy, faceSize, face.rz, factor);
          }
        }

        animRef.current = requestAnimationFrame(renderLoop);
      };

      animRef.current = requestAnimationFrame(renderLoop);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start camera.');
    } finally {
      setLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraOnRef.current = false;
    if (animRef.current) cancelAnimationFrame(animRef.current);
    try { faceFilterRef.current?.destroy(); } catch {}
    faceFilterRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      cameraOnRef.current = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      try { faceFilterRef.current?.destroy(); } catch {}
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
                <Tooltip text="Draws wrinkle lines, crow's feet, nasolabial folds, under-eye bags, lip lines, frown lines, and age spots — tracked to the face in real-time." />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showSkinAging} onChange={(e) => setShowSkinAging(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Skin tone aging</span>
                <Tooltip text="Desaturates and warms the skin tone within the face region using per-pixel processing with radial falloff." />
              </label>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 leading-relaxed">
                All processing runs locally in your browser. No camera images are sent to any server.
              </p>
            </div>
          </div>

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
            {/* Hidden video element for webcam stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }}
            />
            {/* Visible canvas with video + aging overlay composited */}
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

// ── Wrinkle drawing ─────────────────────────────────────────────────────────

function drawWrinkles(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  faceSize: number, rz: number,
  factor: number
) {
  const alpha = Math.min(factor * 0.8, 0.7);
  const lw = 1 + factor * 1.5;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-rz);
  ctx.lineCap = 'round';

  // Forehead wrinkles
  ctx.strokeStyle = `rgba(70, 40, 25, ${alpha})`;
  ctx.lineWidth = lw;
  for (let i = 0; i < 4; i++) {
    const y = -faceSize * (0.55 + i * 0.08);
    const spread = faceSize * (0.32 - i * 0.02);
    ctx.beginPath();
    ctx.moveTo(-spread, y);
    ctx.quadraticCurveTo(0, y - 2 + Math.sin(i * 1.5) * 2, spread, y);
    ctx.stroke();
  }

  // Crow's feet
  ctx.lineWidth = lw * 0.8;
  for (const side of [-1, 1]) {
    const ex = side * faceSize * 0.4;
    const ey = -faceSize * 0.12;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + side * faceSize * (0.07 + factor * 0.05), ey + j * faceSize * 0.035);
      ctx.stroke();
    }
  }

  // Nasolabial folds
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.8})`;
  for (const side of [-1, 1]) {
    const nx = side * faceSize * 0.16;
    ctx.beginPath();
    ctx.moveTo(nx, -faceSize * 0.02);
    ctx.quadraticCurveTo(nx + side * faceSize * 0.05, faceSize * 0.15, nx - side * faceSize * 0.02, faceSize * 0.32);
    ctx.stroke();
  }

  // Under-eye bags
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = `rgba(90, 55, 35, ${alpha * 0.5})`;
  for (const side of [-1, 1]) {
    const ux = side * faceSize * 0.18;
    const uy = -faceSize * 0.06;
    ctx.beginPath();
    ctx.moveTo(ux - faceSize * 0.09, uy);
    ctx.quadraticCurveTo(ux, uy + faceSize * 0.035, ux + faceSize * 0.09, uy);
    ctx.stroke();
  }

  // Lip lines
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.4})`;
  for (let i = -3; i <= 3; i++) {
    const lx = i * faceSize * 0.035;
    ctx.beginPath();
    ctx.moveTo(lx, faceSize * 0.22);
    ctx.lineTo(lx + (i > 0 ? 1.5 : -1.5), faceSize * 0.28);
    ctx.stroke();
  }

  // Frown lines between brows
  ctx.strokeStyle = `rgba(70, 40, 25, ${alpha * 0.6})`;
  ctx.lineWidth = lw;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * faceSize * 0.055, -faceSize * 0.38);
    ctx.lineTo(side * faceSize * 0.045, -faceSize * 0.48);
    ctx.stroke();
  }

  // Age spots
  ctx.fillStyle = `rgba(100, 65, 35, ${alpha * 0.2})`;
  const spots = [
    [-0.22, -0.45, 3], [0.18, -0.5, 2.5], [-0.12, -0.25, 2],
    [0.28, -0.35, 3.5], [-0.28, 0.08, 2], [0.22, 0.03, 2.5],
    [0.32, -0.18, 2], [-0.32, -0.4, 3],
  ];
  for (const [rx, ry, r] of spots) {
    ctx.beginPath();
    ctx.arc(rx * faceSize, ry * faceSize, r * (0.5 + factor * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
