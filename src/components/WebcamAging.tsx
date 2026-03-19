import { useRef, useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
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

// Generate a wrinkle overlay texture procedurally
function createWrinkleTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Transparent base
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;

  // Forehead wrinkles (horizontal lines in upper third)
  ctx.strokeStyle = 'rgba(60, 35, 20, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  for (let i = 0; i < 5; i++) {
    const y = size * 0.12 + i * size * 0.035;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, y);
    ctx.quadraticCurveTo(cx, y - 2 + Math.sin(i) * 3, cx + size * 0.2, y);
    ctx.stroke();
  }

  // Crow's feet (left eye area)
  for (let side = -1; side <= 1; side += 2) {
    const ex = cx + side * size * 0.22;
    const ey = size * 0.38;
    ctx.lineWidth = 1.2;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + side * size * 0.06, ey + j * size * 0.02);
      ctx.stroke();
    }
  }

  // Nasolabial folds
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = 'rgba(60, 35, 20, 0.4)';
  for (let side = -1; side <= 1; side += 2) {
    const sx = cx + side * size * 0.1;
    ctx.beginPath();
    ctx.moveTo(sx, size * 0.45);
    ctx.quadraticCurveTo(sx + side * size * 0.02, size * 0.55, sx - side * size * 0.01, size * 0.65);
    ctx.stroke();
  }

  // Under-eye creases
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(80, 50, 35, 0.35)';
  for (let side = -1; side <= 1; side += 2) {
    const ux = cx + side * size * 0.12;
    const uy = size * 0.42;
    ctx.beginPath();
    ctx.moveTo(ux - size * 0.05, uy);
    ctx.quadraticCurveTo(ux, uy + size * 0.015, ux + size * 0.05, uy);
    ctx.stroke();
  }

  // Lip lines (vertical above upper lip)
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(60, 35, 20, 0.3)';
  for (let i = -3; i <= 3; i++) {
    const lx = cx + i * size * 0.02;
    ctx.beginPath();
    ctx.moveTo(lx, size * 0.62);
    ctx.lineTo(lx + (i > 0 ? 1 : -1), size * 0.66);
    ctx.stroke();
  }

  // Age spots (scattered)
  ctx.fillStyle = 'rgba(100, 60, 30, 0.15)';
  const spots = [
    [0.35, 0.2, 4], [0.62, 0.18, 3], [0.28, 0.35, 2.5],
    [0.7, 0.33, 3], [0.4, 0.55, 2], [0.58, 0.48, 2.5],
    [0.32, 0.15, 3.5], [0.65, 0.25, 2],
  ];
  for (const [rx, ry, r] of spots) {
    ctx.beginPath();
    ctx.arc(size * rx, size * ry, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

// Custom shader for face aging overlay
const agingVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const agingFragmentShader = `
  uniform sampler2D wrinkleMap;
  uniform float intensity;
  uniform float skinDesaturation;
  uniform float skinWarmth;
  varying vec2 vUv;

  void main() {
    vec4 wrinkle = texture2D(wrinkleMap, vUv);

    // Wrinkle overlay with intensity control
    float wrinkleAlpha = wrinkle.a * intensity;

    // Skin aging color (warm, desaturated)
    vec3 agingTint = vec3(0.35, 0.25, 0.18);

    // Combine wrinkle detail with skin tint
    vec3 color = mix(agingTint, wrinkle.rgb, 0.6);

    gl_FragColor = vec4(color, wrinkleAlpha);
  }
`;

export default function WebcamAging() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraThreeRef = useRef<THREE.OrthographicCamera | null>(null);
  const faceMeshRef = useRef<THREE.Mesh | null>(null);
  const animFrameRef = useRef<number>(0);
  const faceFilterRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      // Dynamically import facefilter
      const { JEELIZFACEFILTER, NN_4EXPR } = await import('facefilter');

      // Create canvas if needed
      let canvas = canvasRef.current;
      if (!canvas) {
        setError('Canvas not ready');
        setLoading(false);
        return;
      }

      const W = 640;
      const H = 480;
      canvas.width = W;
      canvas.height = H;

      // Setup Three.js scene
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(W, H);
      renderer.autoClear = false;
      rendererRef.current = renderer;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const cam = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 100);
      cam.position.z = 1;
      cameraThreeRef.current = cam;

      // Create wrinkle texture
      const wrinkleTexture = createWrinkleTexture(512);

      // Face overlay mesh — a plane that tracks the face
      const agingMaterial = new THREE.ShaderMaterial({
        uniforms: {
          wrinkleMap: { value: wrinkleTexture },
          intensity: { value: 0.6 },
          skinDesaturation: { value: 0.3 },
          skinWarmth: { value: 0.2 },
        },
        vertexShader: agingVertexShader,
        fragmentShader: agingFragmentShader,
        transparent: true,
        depthTest: false,
      });

      const faceGeo = new THREE.PlaneGeometry(1, 1);
      const faceMesh = new THREE.Mesh(faceGeo, agingMaterial);
      faceMesh.visible = false;
      scene.add(faceMesh);
      faceMeshRef.current = faceMesh;

      // Initialize facefilter
      faceFilterRef.current = JEELIZFACEFILTER;

      await new Promise<void>((resolve, reject) => {
        JEELIZFACEFILTER.init({
          canvas,
          NNC: NN_4EXPR,
          maxFacesDetected: 1,
          followZRot: true,

          callbackReady: (errCode: any) => {
            if (errCode) {
              reject(new Error(`FaceFilter init error: ${errCode}`));
              return;
            }
            resolve();
          },

          callbackTrack: (detectState: any) => {
            const mesh = faceMeshRef.current;
            if (!mesh) return;
            const material = mesh.material as THREE.ShaderMaterial;

            if (detectState.detected > 0.5) {
              mesh.visible = true;

              // Position and scale the overlay to match the face
              const s = detectState.s * 1.2;
              mesh.scale.set(s, s * 1.3, 1);
              mesh.position.set(
                detectState.x * 0.5,
                detectState.y * 0.5 + s * 0.1,
                0
              );
              mesh.rotation.z = -detectState.rz;

              // Update shader uniforms
              const factor = ageIntensityRef.current / 100;
              material.uniforms.intensity.value = showWrinklesRef.current ? factor : 0;
              material.uniforms.skinDesaturation.value = showSkinAgingRef.current ? factor * 0.4 : 0;
              material.uniforms.skinWarmth.value = showSkinAgingRef.current ? factor * 0.25 : 0;
            } else {
              mesh.visible = false;
            }

            // Render
            const r = rendererRef.current;
            const c = cameraThreeRef.current;
            const sc = sceneRef.current;
            if (r && c && sc) {
              r.clear();
              // FaceFilter already drew the video feed to the canvas via WebGL
              // We render our Three.js overlay on top
              r.render(sc, c);
            }
          },
        });
      });

      setCameraOn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start camera.');
    } finally {
      setLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    try {
      faceFilterRef.current?.destroy();
    } catch {}
    faceFilterRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    return () => {
      try { faceFilterRef.current?.destroy(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
      rendererRef.current?.dispose();
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
                <Tooltip text="Overlays wrinkle patterns on the forehead, around the eyes, nasolabial folds, lip lines, and scattered age spots." />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showSkinAging} onChange={(e) => setShowSkinAging(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-400" />
                <span className="text-sm text-slate-700">Skin tone aging</span>
                <Tooltip text="Desaturates and warms the skin tone in the face region to simulate aged skin." />
              </label>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 leading-relaxed">
                All processing runs locally in your browser using WebGL. No camera images are sent to any server.
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
        <div className="space-y-4" ref={containerRef}>
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
