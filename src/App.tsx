import { useState, useRef, useCallback } from 'react';
import {
  Upload, Download, Key, Loader2, AlertCircle, ImageIcon,
  SlidersHorizontal, Sparkles, RotateCcw, ChevronDown,
} from 'lucide-react';

type Quality = 'low' | 'medium' | 'high';
type Size = '1024x1024' | '1536x1024' | '1024x1536';

const SIZE_LABELS: Record<Size, string> = {
  '1024x1024': '1:1 Square',
  '1536x1024': '3:2 Landscape',
  '1024x1536': '2:3 Portrait',
};

function buildPrompt(ageAmount: number, intensity: number, custom: string): string {
  const ageDesc =
    ageAmount <= 10 ? 'a few years older, with very subtle signs of aging'
    : ageAmount <= 25 ? 'noticeably older, with visible wrinkles and some grey hair'
    : ageAmount <= 40 ? 'significantly aged, with deep wrinkles, grey or white hair, and aged skin texture'
    : 'very elderly, with pronounced wrinkles, white hair, age spots, and weathered skin';

  const intensityDesc =
    intensity <= 30 ? 'Keep the transformation subtle and natural-looking.'
    : intensity <= 70 ? 'Apply a moderate, realistic aging effect.'
    : 'Apply an intense, dramatic aging transformation.';

  const base = `Transform this person to look ${ageDesc}. ${intensityDesc} Preserve the person's identity, facial structure, expression, and background. The result should look like a realistic photograph, not an illustration.`;

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
  const [ageAmount, setAgeAmount] = useState(25);
  const [intensity, setIntensity] = useState(50);
  const [quality, setQuality] = useState<Quality>('medium');
  const [size, setSize] = useState<Size>('1024x1024');
  const [customPrompt, setCustomPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (PNG, JPG, WebP).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Image must be under 25 MB.');
      return;
    }
    setImageFile(file);
    setImageUrl(URL.createObjectURL(file));
    setResultUrl(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleGenerate = async () => {
    if (!apiKey.trim()) { setError('Please enter your OpenAI API key.'); return; }
    if (!imageFile) { setError('Please upload an image first.'); return; }

    setLoading(true);
    setError(null);
    setResultUrl(null);

    const prompt = buildPrompt(ageAmount, intensity, customPrompt);

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
    a.download = `aged-portrait-${Date.now()}.png`;
    a.click();
  };

  const handleReset = () => {
    setImageFile(null);
    setImageUrl(null);
    setResultUrl(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <span className="text-lg font-bold text-slate-900">Virtual Face Aging</span>
          </div>
          <span className="text-xs text-slate-400">Powered by OpenAI</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* API Key */}
        <section className="mb-8">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
            <Key className="w-4 h-4" />
            OpenAI API Key
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
          <p className="text-xs text-slate-400 mt-1.5">Stored in your browser only. Never sent to any server except OpenAI.</p>
        </section>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload + Controls */}
          <div className="space-y-6">
            {/* Upload */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                imageUrl
                  ? 'border-amber-300 bg-amber-50/50'
                  : 'border-slate-300 bg-white hover:border-amber-400 hover:bg-amber-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
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

            {/* Controls */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <SlidersHorizontal className="w-4 h-4" />
                Aging Controls
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Age increase</span>
                  <span className="font-medium text-slate-900">+{ageAmount} years</span>
                </div>
                <input
                  type="range" min="5" max="50" value={ageAmount}
                  onChange={(e) => setAgeAmount(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>Subtle</span><span>Dramatic</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-600">Render intensity</span>
                  <span className="font-medium text-slate-900">{intensity}%</span>
                </div>
                <input
                  type="range" min="10" max="100" value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                  <span>Natural</span><span>Intense</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-slate-600 mb-1 block">Quality</label>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(e.target.value as Quality)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none"
                  >
                    <option value="low">Low (fast)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (slow)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600 mb-1 block">Size</label>
                  <select
                    value={size}
                    onChange={(e) => setSize(e.target.value as Size)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none"
                  >
                    {Object.entries(SIZE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Advanced */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                Advanced options
              </button>
              {showAdvanced && (
                <div>
                  <label className="text-sm text-slate-600 mb-1 block">Custom prompt addition</label>
                  <textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="e.g. Add glasses, keep the smile..."
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                  />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleGenerate}
                disabled={loading || !imageFile}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Age Portrait</>
                )}
              </button>
              {imageUrl && (
                <button
                  onClick={handleReset}
                  className="px-4 py-3 text-sm border border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors"
                  title="Reset"
                >
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
                <img src={resultUrl} alt="Aged portrait result" className="max-w-full max-h-[500px] rounded-lg shadow-lg" />
              ) : (
                <div className="text-center space-y-3">
                  <ImageIcon className="w-10 h-10 mx-auto text-slate-200" />
                  <p className="text-sm text-slate-400">Your aged portrait will appear here</p>
                </div>
              )}
            </div>

            {resultUrl && (
              <button
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium border border-slate-300 rounded-xl bg-white hover:bg-slate-50 transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Result
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mt-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-12">
          Prototype / demo only. Your API key and images are processed in-browser and sent directly to OpenAI. No data is stored.
        </p>
      </main>
    </div>
  );
}
