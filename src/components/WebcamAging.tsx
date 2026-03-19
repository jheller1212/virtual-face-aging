import { useRef, useState, useEffect, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
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

export default function WebcamAging() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraOnRef = useRef(false);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [ageIntensity, setAgeIntensity] = useState(50);
  const [showWrinkles, setShowWrinkles] = useState(true);
  const [showHairGreying, setShowHairGreying] = useState(true);
  const [showSkinAging, setShowSkinAging] = useState(true);

  // Keep refs in sync for use inside render loop
  const ageIntensityRef = useRef(ageIntensity);
  const showWrinklesRef = useRef(showWrinkles);
  const showHairGreyingRef = useRef(showHairGreying);
  const showSkinAgingRef = useRef(showSkinAging);
  useEffect(() => { ageIntensityRef.current = ageIntensity; }, [ageIntensity]);
  useEffect(() => { showWrinklesRef.current = showWrinkles; }, [showWrinkles]);
  useEffect(() => { showHairGreyingRef.current = showHairGreying; }, [showHairGreying]);
  useEffect(() => { showSkinAgingRef.current = showSkinAging; }, [showSkinAging]);

  // Initialize MediaPipe
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        if (!cancelled) {
          landmarkerRef.current = landmarker;
          setModelReady(true);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load face detection model. Check your internet connection.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startRenderLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !canvas || !overlay) return;

    const ctx = canvas.getContext('2d');
    const octx = overlay.getContext('2d');
    if (!ctx || !octx) return;

    let lastTime = -1;

    const render = () => {
      if (!cameraOnRef.current) return;

      if (video.readyState >= 2 && video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        const w = video.videoWidth;
        const h = video.videoHeight;

        if (w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          overlay.width = w;
          overlay.height = h;

          // Draw video frame
          ctx.drawImage(video, 0, 0, w, h);

          const intensity = ageIntensityRef.current;
          const factor = intensity / 100;

          // Apply skin aging effect
          if (showSkinAgingRef.current && factor > 0) {
            const imageData = ctx.getImageData(0, 0, w, h);
            const d = imageData.data;
            const blend = factor * 0.35;
            for (let i = 0; i < d.length; i += 4) {
              const grey = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
              d[i] = d[i] * (1 - blend) + (grey + 8) * blend;
              d[i + 1] = d[i + 1] * (1 - blend) + (grey - 2) * blend;
              d[i + 2] = d[i + 2] * (1 - blend) + (grey - 6) * blend;
            }
            ctx.putImageData(imageData, 0, 0);
          }

          // Detect face landmarks and draw effects
          octx.clearRect(0, 0, w, h);
          const landmarker = landmarkerRef.current;
          if (landmarker) {
            try {
              const result = landmarker.detectForVideo(video, performance.now());
              if (result.faceLandmarks && result.faceLandmarks.length > 0) {
                const landmarks = result.faceLandmarks[0];
                if (showWrinklesRef.current) {
                  drawWrinkles(octx, landmarks, w, h, factor);
                }
                if (showHairGreyingRef.current) {
                  drawHairGreying(ctx, landmarks, w, h, factor);
                }
              }
            } catch {
              // Face detection failed for this frame — video still renders
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
  }, []);

  const startCamera = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
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
      cameraOnRef.current = true;
      setCameraOn(true);
      startRenderLoop();
    } catch {
      setError('Camera access denied. Please allow camera permissions.');
    } finally {
      setLoading(false);
    }
  }, [startRenderLoop]);

  const stopCamera = useCallback(() => {
    cameraOnRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cameraOnRef.current = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const handleCapture = () => {
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!canvas || !overlay) return;

    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const outCtx = out.getContext('2d')!;
    outCtx.drawImage(canvas, 0, 0);
    outCtx.drawImage(overlay, 0, 0);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webcam-aged-${Date.now()}.png`;
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
                  <Tooltip text="Controls how strongly all aging effects are applied to the live webcam feed. Higher values produce more visible wrinkles, skin changes, and hair greying." />
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
                <span className="text-sm text-slate-700">Wrinkles & lines</span>
                <Tooltip text="Draws simulated wrinkle lines on the forehead, around the eyes (crow's feet), and along nasolabial folds based on detected facial landmarks." />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showHairGreying} onChange={(e) => setShowHairGreying(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Hair greying</span>
                <Tooltip text="Desaturates and lightens the hair region above the forehead to simulate greying or whitening hair." />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showSkinAging} onChange={(e) => setShowSkinAging(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Skin aging</span>
                <Tooltip text="Desaturates and warms the overall skin tone to simulate aged, weathered skin." />
              </label>
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

          {!modelReady && !error && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading face detection model... (camera will work without it)
            </div>
          )}
        </div>

        {/* Right: Video feed */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 min-h-[400px] flex items-center justify-center overflow-hidden">
            <div className="relative" style={{ display: cameraOn ? 'block' : 'none' }}>
              <video ref={videoRef} style={{ position: 'absolute', width: 0, height: 0, opacity: 0 }} playsInline muted />
              <canvas ref={canvasRef} style={{ maxWidth: '100%', borderRadius: '0.5rem' }} />
              <canvas ref={overlayCanvasRef} style={{ position: 'absolute', top: 0, left: 0, maxWidth: '100%', borderRadius: '0.5rem' }} />
            </div>
            {!cameraOn && (
              <div className="text-center space-y-3">
                <Camera className="w-10 h-10 mx-auto text-slate-200" />
                <p className="text-sm text-slate-400">Click "Start Camera" to begin live aging</p>
                <p className="text-xs text-slate-300">Requires camera permission. All processing happens locally — no API key needed.</p>
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

// ── Drawing helpers ──────────────────────────────────────────────────────────

type Landmark = { x: number; y: number; z: number };

function px(lm: Landmark, w: number): number { return lm.x * w; }
function py(lm: Landmark, h: number): number { return lm.y * h; }

function drawWrinkles(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, factor: number) {
  const alpha = Math.min(factor * 0.7, 0.6);
  ctx.strokeStyle = `rgba(80, 50, 30, ${alpha})`;
  ctx.lineWidth = 1 + factor;
  ctx.lineCap = 'round';

  // Forehead wrinkles
  const foreheadY1 = py(lm[10], h) - 15;
  const foreheadY2 = py(lm[10], h) - 8;
  const foreheadY3 = py(lm[10], h) - 1;
  const leftX = px(lm[67], w) + 5;
  const rightX = px(lm[297], w) - 5;

  for (const y of [foreheadY1, foreheadY2, foreheadY3]) {
    ctx.beginPath();
    ctx.moveTo(leftX, y + Math.sin(leftX * 0.05) * 2);
    const midX = (leftX + rightX) / 2;
    ctx.quadraticCurveTo(midX, y - 3 + Math.sin(midX * 0.03) * 2, rightX, y + Math.sin(rightX * 0.05) * 2);
    ctx.stroke();
  }

  // Crow's feet
  const crowsFeetPairs = [
    { outer: lm[33], dir: -1 },
    { outer: lm[263], dir: 1 },
  ];

  for (const { outer, dir } of crowsFeetPairs) {
    const ox = px(outer, w);
    const oy = py(outer, h);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + dir * (8 + factor * 8), oy + i * (4 + factor * 3));
      ctx.stroke();
    }
  }

  // Nasolabial folds
  const noseLeft = lm[48];
  const noseRight = lm[278];
  const mouthLeft = lm[61];
  const mouthRight = lm[291];

  ctx.lineWidth = 1.5 + factor;

  ctx.beginPath();
  ctx.moveTo(px(noseLeft, w), py(noseLeft, h));
  ctx.quadraticCurveTo(px(noseLeft, w) - 5, (py(noseLeft, h) + py(mouthLeft, h)) / 2, px(mouthLeft, w) - 3, py(mouthLeft, h) + 4);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(px(noseRight, w), py(noseRight, h));
  ctx.quadraticCurveTo(px(noseRight, w) + 5, (py(noseRight, h) + py(mouthRight, h)) / 2, px(mouthRight, w) + 3, py(mouthRight, h) + 4);
  ctx.stroke();

  // Under-eye lines
  ctx.lineWidth = 0.8 + factor * 0.5;
  ctx.strokeStyle = `rgba(100, 70, 50, ${alpha * 0.6})`;

  for (const idx of [159, 386]) {
    const ux = px(lm[idx], w);
    const uy = py(lm[idx], h) + 4;
    ctx.beginPath();
    ctx.moveTo(ux - 10, uy);
    ctx.quadraticCurveTo(ux, uy + 3, ux + 10, uy);
    ctx.stroke();
  }
}

function drawHairGreying(ctx: CanvasRenderingContext2D, lm: Landmark[], w: number, h: number, factor: number) {
  const foreheadTop = Math.max(0, py(lm[10], h) - 60);
  const foreheadBottom = py(lm[10], h) - 5;
  const leftBound = Math.max(0, px(lm[67], w) - 20);
  const rightBound = Math.min(w, px(lm[297], w) + 20);

  const regionW = rightBound - leftBound;
  const regionH = foreheadBottom - foreheadTop;
  if (regionW <= 0 || regionH <= 0) return;

  const imageData = ctx.getImageData(leftBound, foreheadTop, regionW, regionH);
  const d = imageData.data;
  const blend = factor * 0.5;

  for (let i = 0; i < d.length; i += 4) {
    const grey = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    const lightGrey = grey + (255 - grey) * factor * 0.4;
    d[i] = d[i] * (1 - blend) + lightGrey * blend;
    d[i + 1] = d[i + 1] * (1 - blend) + lightGrey * blend;
    d[i + 2] = d[i + 2] * (1 - blend) + lightGrey * blend;
  }

  ctx.putImageData(imageData, leftBound, foreheadTop);
}
