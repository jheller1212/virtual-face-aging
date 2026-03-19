import { useState, useRef, useCallback } from 'react';
import {
  Upload, Download, Key, Loader2, AlertCircle, ImageIcon,
  SlidersHorizontal, Sparkles, RotateCcw, ChevronDown,
  HelpCircle, User, Camera, CameraOff,
} from 'lucide-react';
import { buildCacheKey, getCachedResult, setCachedResult } from './lib/cache';

type Quality = 'low' | 'high';
type Size = '1024x1024' | '1536x1024' | '1024x1536';

const SIZE_LABELS: Record<Size, string> = {
  '1024x1024': '1:1 Square',
  '1536x1024': '3:2 Landscape',
  '1024x1536': '2:3 Portrait',
};

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

function buildPrompt(currentAge: number, targetAge: number, realism: number, custom: string): string {
  const ageDiff = targetAge - currentAge;
  const ageDesc =
    ageDiff <= 10 ? `about ${targetAge} years old, with very subtle signs of aging compared to their current appearance`
    : ageDiff <= 25 ? `about ${targetAge} years old, with visible wrinkles, some grey hair, and natural signs of aging`
    : ageDiff <= 40 ? `about ${targetAge} years old, with deep wrinkles, mostly grey or white hair, and noticeably aged skin`
    : `about ${targetAge} years old, very elderly, with pronounced wrinkles, white hair, age spots, and weathered skin`;

  const realismDesc =
    realism <= 30 ? 'Keep the transformation subtle — err on the side of looking natural even if the aging is understated.'
    : realism <= 70 ? 'Apply a balanced, realistic aging effect that is clearly visible but natural-looking.'
    : 'Apply a strong, pronounced aging transformation with high visual fidelity to real aging.';

  const base = `Transform this person (currently around ${currentAge} years old) to look ${ageDesc}. ${realismDesc} Preserve the person's identity, facial structure, expression, pose, and background. The result should look like a realistic photograph, not an illustration or cartoon.`;
  return custom ? `${base} Additional instructions: ${custom}` : base;
}

export default function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [currentAge, setCurrentAge] = useState(30);
  const [ageEdited, setAgeEdited] = useState(false);
  const [targetAge, setTargetAge] = useState(65);
  const [realism, setRealism] = useState(50);
  const [quality, setQuality] = useState<Quality>('high');
  const [size, setSize] = useState<Size>('1024x1024');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [webcamOn, setWebcamOn] = useState(false);
  const [webcamLoading, setWebcamLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file (PNG, JPG, WebP).'); return; }
    if (file.size > 25 * 1024 * 1024) { setError('Image must be under 25 MB.'); return; }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setResultUrl(null);
    setError(null);
    setCached(false);
    setAgeEdited(false);
    setCurrentAge(30);
    setTargetAge(65);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const startWebcam = useCallback(async () => {
    setWebcamLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamOn(true);
    } catch {
      setError('Camera access denied. Please allow camera permissions.');
    } finally {
      setWebcamLoading(false);
    }
  }, []);

  const stopWebcam = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setWebcamOn(false);
  }, []);

  const captureWebcam = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `selfie-${Date.now()}.png`, { type: 'image/png' });
      handleFileSelect(file);
      stopWebcam();
    }, 'image/png');
  }, [handleFileSelect, stopWebcam]);

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError('Please enter your OpenAI API key.'); return; }
    if (!imageFile) { setError('Please upload an image first.'); return; }
    if (targetAge <= currentAge) { setError('Target age must be higher than current age.'); return; }

    setError(null);
    setCached(false);

    const cacheKey = await buildCacheKey(imageFile, currentAge, targetAge, realism, quality, size, customPrompt);
    const cachedB64 = getCachedResult(cacheKey);
    if (cachedB64) {
      setResultUrl(`data:image/png;base64,${cachedB64}`);
      setCached(true);
      return;
    }

    setLoading(true);
    setResultUrl(null);

    const prompt = buildPrompt(currentAge, targetAge, realism, customPrompt);
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('prompt', prompt);
    formData.append('model', 'gpt-image-1');
    formData.append('size', size);
    formData.append('quality', quality);

    try {
      const res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text();
        let msg = `API error (${res.status})`;
        try { msg = JSON.parse(body).error?.message ?? msg; } catch {}
        throw new Error(msg);
      }

      const data = await res.json();
      const b64 = data?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image returned from API.');

      setCachedResult(cacheKey, b64);
      setResultUrl(`data:image/png;base64,${b64}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    a.download = `aged-portrait-${currentAge}-to-${targetAge}-${Date.now()}.png`;
    a.click();
  };

  const handleReset = () => {
    setImageFile(null);
    setImageUrl(null);
    setResultUrl(null);
    setError(null);
    setCached(false);
    setAgeEdited(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 text-slate-800">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-lg font-bold text-slate-900">Virtual Face Aging</span>
          </div>
          <span className="text-xs text-slate-400">A research project at Maastricht University</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* API Key */}
        <section className="mb-8">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Key className="w-4 h-4" />
            OpenAI API Key
            <Tooltip text="Your key is stored in the browser only and sent directly to OpenAI. It is never saved to any server." />
          </label>
          <div className="flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="flex-1 px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="px-4 py-2.5 text-sm border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors"
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload + Controls */}
          <div className="space-y-6">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                imageUrl ? 'border-amber-300 bg-amber-50/50' : 'border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/30'
              }`}
            >
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              {imageUrl ? (
                <div className="space-y-3">
                  <img src={imageUrl} alt="Uploaded portrait" className="max-h-64 mx-auto rounded-lg shadow-md" />
                  <p className="text-sm text-slate-500">{imageFile?.name} — click or drop to replace</p>
                </div>
              ) : (
                <div className="space-y-3 py-8">
                  <Upload className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">Drop a portrait here or click to upload</p>
                  <p className="text-xs text-slate-400">PNG, JPG, or WebP — max 25 MB</p>
                </div>
              )}
            </div>

            {/* Webcam selfie option */}
            {!imageUrl && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4">
                {!webcamOn ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); startWebcam(); }}
                    disabled={webcamLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                  >
                    {webcamLoading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Starting camera...</>
                    ) : (
                      <><Camera className="w-4 h-4" /> Or take a selfie with your webcam</>
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden bg-black">
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        style={{ width: '100%', transform: 'scaleX(-1)' }}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={captureWebcam}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg hover:from-amber-400 hover:to-orange-400 transition-all"
                      >
                        <Camera className="w-4 h-4" /> Capture Photo
                      </button>
                      <button
                        onClick={stopWebcam}
                        className="px-4 py-2.5 text-sm text-slate-500 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <CameraOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <SlidersHorizontal className="w-4 h-4" />
                Aging Controls
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm mb-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-600">Current age</span>
                  <Tooltip text="Enter the actual age of the person in the photo. This helps the AI calculate how much aging to apply." />
                </div>
                {imageFile && !ageEdited && (
                  <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <AlertCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                    <p className="text-xs text-blue-700">Please enter the actual age of the person in the photo for accurate results.</p>
                  </div>
                )}
                <input type="number" min="5" max="90" value={currentAge}
                  onChange={(e) => {
                    const v = Math.max(5, Math.min(90, Number(e.target.value)));
                    setCurrentAge(v);
                    setAgeEdited(true);
                    if (targetAge <= v) setTargetAge(Math.min(v + 10, 95));
                  }}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Target age</span>
                    <Tooltip text="The age you want the person to appear in the generated image. Must be higher than the current age." />
                  </div>
                  <span className="font-medium text-slate-900">{targetAge} years old</span>
                </div>
                <input type="range" min={currentAge + 5} max="95" value={targetAge}
                  onChange={(e) => setTargetAge(Number(e.target.value))}
                  className="w-full accent-amber-500" />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>{currentAge + 5}</span>
                  <span className="font-medium text-amber-600">+{targetAge - currentAge} years</span>
                  <span>95</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Realism</span>
                    <Tooltip text="Controls how pronounced the aging effect is. Low realism produces subtle, conservative changes. High realism produces dramatic, detailed aging features like deep wrinkles and age spots." />
                  </div>
                  <span className="font-medium text-slate-900">{realism}%</span>
                </div>
                <input type="range" min="10" max="100" value={realism}
                  onChange={(e) => setRealism(Number(e.target.value))}
                  className="w-full accent-amber-500" />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>Subtle</span><span>Pronounced</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <span>Quality</span>
                    <Tooltip text="Low quality is faster and cheaper (~5s). High quality produces more detailed results but takes longer (~30s) and costs more tokens." />
                  </div>
                  <select value={quality} onChange={(e) => setQuality(e.target.value as Quality)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none">
                    <option value="low">Low (faster, cheaper)</option>
                    <option value="high">High (detailed, slower)</option>
                  </select>
                </div>
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <span>Output size</span>
                    <Tooltip text="The dimensions of the generated image. Square works best for portraits." />
                  </div>
                  <select value={size} onChange={(e) => setSize(e.target.value as Size)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none">
                    {Object.entries(SIZE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced options
              </button>
              {showAdvanced && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mb-1">
                    <span>Custom prompt addition</span>
                    <Tooltip text="Add extra instructions to the AI prompt. For example: 'Add glasses' or 'Keep the person smiling'." />
                  </div>
                  <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Add glasses, keep the smile..." rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none resize-none" />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={handleGenerate} disabled={loading || !imageFile}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all">
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                  : <><Sparkles className="w-4 h-4" /> Age Portrait</>}
              </button>
              {imageUrl && (
                <button onClick={handleReset}
                  className="px-4 py-3 text-sm border border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors" title="Reset">
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 min-h-[400px] flex items-center justify-center">
              {loading ? (
                <div className="text-center space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-amber-500 animate-spin" />
                  <p className="text-sm text-slate-500">Generating aged portrait...</p>
                  <p className="text-xs text-slate-400">This can take 15–45 seconds depending on quality.</p>
                </div>
              ) : resultUrl ? (
                <div className="space-y-3 text-center">
                  <img src={resultUrl} alt="Aged portrait result" className="max-w-full max-h-[500px] rounded-lg shadow-lg" />
                  <p className="text-xs text-slate-400">
                    Age {currentAge} → {targetAge} · Realism {realism}% · Quality: {quality}
                    {cached && <span className="ml-2 text-green-600 font-medium">(cached — identical to previous result)</span>}
                  </p>
                </div>
              ) : (
                <div className="text-center space-y-3">
                  <ImageIcon className="w-10 h-10 mx-auto text-slate-200" />
                  <p className="text-sm text-slate-400">Your aged portrait will appear here</p>
                </div>
              )}
            </div>

            {resultUrl && (
              <button onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium border border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors">
                <Download className="w-4 h-4" /> Download Result
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-12">
          Prototype / demo only. Your API key and images are processed in-browser and sent directly to OpenAI. No data is stored on any server.
        </p>
      </main>
    </div>
  );
}
