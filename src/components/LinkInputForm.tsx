import React, { useRef, useState } from 'react';
import {
  Link2,
  Download,
  Loader2,
  X,
  AlertCircle,
  AlertTriangle,
  Code,
  Music,
  Youtube,
  Facebook,
  ClipboardPaste,
  ArrowRight,
} from 'lucide-react';

export type PlatformType = 'su' | 'yt' | 'fb';

export interface LinkInputFormProps {
  url: string;
  setUrl: (url: string) => void;
  activePlatform: PlatformType;
  setActivePlatform: (platform: PlatformType) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  error: string | null;
}

export function detectUrlPlatform(url: string): PlatformType | 'other' | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/suno\.(?:com|ai)|cloudfront\.net\/1\/clip/i.test(trimmed)) {
    return 'su';
  }
  if (/(?:youtube\.com|youtu\.be)/i.test(trimmed)) {
    return 'yt';
  }
  if (/(?:facebook\.com|fb\.watch)/i.test(trimmed)) {
    return 'fb';
  }
  return 'other';
}

const PLATFORM_CONFIG = {
  su: {
    id: 'su' as PlatformType,
    name: 'SU Audio',
    title: 'Suno AI Music',
    badge: 'Suno AI Only',
    placeholder: 'Paste Suno AI song link or embed code (suno.com/song/...)',
    icon: Music,
    activeBtn: 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400/50',
    inactiveBtn: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200/80',
    themeColor: 'emerald',
    submitBtn: 'bg-emerald-600 hover:bg-emerald-700',
  },
  yt: {
    id: 'yt' as PlatformType,
    name: 'YT Audio',
    title: 'YouTube Video & Shorts',
    badge: 'YouTube Only',
    placeholder: 'Paste YouTube video or Shorts link (youtube.com / youtu.be)...',
    icon: Youtube,
    activeBtn: 'bg-rose-600 text-white shadow-md shadow-rose-500/30 ring-2 ring-rose-400/50',
    inactiveBtn: 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/80',
    themeColor: 'rose',
    submitBtn: 'bg-rose-600 hover:bg-rose-700',
  },
  fb: {
    id: 'fb' as PlatformType,
    name: 'FB Audio',
    title: 'Facebook Video & Reels',
    badge: 'Facebook Only',
    placeholder: 'Paste Facebook video or reel link (facebook.com / fb.watch)...',
    icon: Facebook,
    activeBtn: 'bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-400/50',
    inactiveBtn: 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200/80',
    themeColor: 'blue',
    submitBtn: 'bg-blue-600 hover:bg-blue-700',
  },
};

export const LinkInputForm: React.FC<LinkInputFormProps> = ({
  url,
  setUrl,
  activePlatform,
  setActivePlatform,
  onAnalyze,
  isLoading,
  error,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);

  const detected = detectUrlPlatform(url);
  const isMismatched = detected !== null && detected !== 'other' && detected !== activePlatform;

  const currentConfig = PLATFORM_CONFIG[activePlatform];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isMismatched || isLoading) return;
    onAnalyze();
  };

  const handlePlatformClick = async (targetPlatform: PlatformType) => {
    setActivePlatform(targetPlatform);
    setClipboardNotice(null);

    // Read clipboard safely
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        const clipboardText = (await navigator.clipboard.readText())?.trim();
        if (clipboardText) {
          const clipPlatform = detectUrlPlatform(clipboardText);

          if (clipPlatform === targetPlatform) {
            // Perfect match! Paste it cleanly without showing notice
            setUrl(clipboardText);
            setClipboardNotice(null);
          } else if (clipPlatform && clipPlatform !== 'other' && clipPlatform !== targetPlatform) {
            // Mismatch: Clipboard has another platform's link
            const otherName = PLATFORM_CONFIG[clipPlatform].name;
            setClipboardNotice(
              `⚠️ Clipboard contains a ${otherName} link. Only ${PLATFORM_CONFIG[targetPlatform].title} links are accepted in ${PLATFORM_CONFIG[targetPlatform].name}.`
            );
            setTimeout(() => setClipboardNotice(null), 5000);
          }
        }
      } catch {
        // Clipboard permission denied or not available
      }
    }

    inputRef.current?.focus();
  };

  const handleSwitchToDetected = (targetPlatform: PlatformType) => {
    setActivePlatform(targetPlatform);
    setClipboardNotice(null);
    inputRef.current?.focus();
  };

  const isEmbedCode = url.includes('<iframe') || url.includes('<a ') || url.includes('src=');

  return (
    <div className="space-y-3">
      {/* 3 Dedicated Content Tabs: SU Audio | YT Audio | FB Audio */}
      <div className="flex items-center gap-2">
        {/* 1. SU Audio Button */}
        <button
          id="btn-su-audio"
          type="button"
          onClick={() => handlePlatformClick('su')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 ${
            activePlatform === 'su' ? PLATFORM_CONFIG.su.activeBtn : PLATFORM_CONFIG.su.inactiveBtn
          }`}
          title="SU Audio (Suno AI Music Downloader)"
        >
          <Music className="w-3.5 h-3.5 shrink-0" />
          <span className="tracking-tight whitespace-nowrap">SU Audio</span>
          <span className="text-[10px] opacity-75 font-medium hidden sm:inline">&bull; Suno</span>
          <ClipboardPaste className="w-3 h-3 shrink-0 opacity-70" />
        </button>

        {/* 2. YT Audio Button */}
        <button
          id="btn-yt-audio"
          type="button"
          onClick={() => handlePlatformClick('yt')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 ${
            activePlatform === 'yt' ? PLATFORM_CONFIG.yt.activeBtn : PLATFORM_CONFIG.yt.inactiveBtn
          }`}
          title="YT Audio (YouTube 320kbps MP3 Downloader)"
        >
          <Youtube className="w-3.5 h-3.5 shrink-0" />
          <span className="tracking-tight whitespace-nowrap">YT Audio</span>
          <span className="text-[10px] opacity-75 font-medium hidden sm:inline">&bull; YouTube</span>
          <ClipboardPaste className="w-3 h-3 shrink-0 opacity-70" />
        </button>

        {/* 3. FB Audio Button */}
        <button
          id="btn-fb-audio"
          type="button"
          onClick={() => handlePlatformClick('fb')}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer active:scale-95 ${
            activePlatform === 'fb' ? PLATFORM_CONFIG.fb.activeBtn : PLATFORM_CONFIG.fb.inactiveBtn
          }`}
          title="FB Audio (Facebook Video/Reels Audio Downloader)"
        >
          <Facebook className="w-3.5 h-3.5 shrink-0" />
          <span className="tracking-tight whitespace-nowrap">FB Audio</span>
          <span className="text-[10px] opacity-75 font-medium hidden sm:inline">&bull; Facebook</span>
          <ClipboardPaste className="w-3 h-3 shrink-0 opacity-70" />
        </button>
      </div>

      {/* Clipboard Smart Notice */}
      {clipboardNotice && (
        <div className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs flex items-center gap-2 shadow-md animate-in fade-in slide-in-from-top-1 duration-200">
          <ClipboardPaste className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="flex-1">{clipboardNotice}</span>
          <button
            type="button"
            onClick={() => setClipboardNotice(null)}
            className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative group">
        {/* Neon Light Border Container */}
        <div
          className={`relative p-[2.5px] rounded-[20px] overflow-hidden transition-all duration-300 ${
            isMismatched
              ? 'bg-amber-500/20 border border-amber-500/50'
              : activePlatform === 'su'
              ? 'bg-emerald-500/15 border border-emerald-500/30'
              : activePlatform === 'yt'
              ? 'bg-rose-500/15 border border-rose-500/30'
              : 'bg-blue-500/15 border border-blue-500/30'
          }`}
        >
          {/* Neon Spin Effect */}
          <div
            className="absolute -inset-[100%] animate-neon-spin pointer-events-none"
            style={{
              background: isMismatched
                ? 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, #f59e0b 140deg, #ffffff 180deg, #f59e0b 220deg, transparent 280deg, transparent 360deg)'
                : activePlatform === 'su'
                ? 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, #10b981 140deg, #ffffff 180deg, #059669 220deg, transparent 280deg, transparent 360deg)'
                : activePlatform === 'yt'
                ? 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, #ff0040 140deg, #ffffff 180deg, #ff1744 220deg, transparent 280deg, transparent 360deg)'
                : 'conic-gradient(from 0deg, transparent 0deg, transparent 80deg, #3b82f6 140deg, #ffffff 180deg, #2563eb 220deg, transparent 280deg, transparent 360deg)',
              filter: 'blur(3px)',
            }}
          />

          {/* Inner Content Box */}
          <div className="relative z-10 flex flex-col sm:flex-row items-stretch gap-2 bg-white rounded-[17.5px] p-2 sm:p-2.5 transition">
            <div className="relative flex-1 flex items-center min-w-0">
              <div className="pl-3.5 pr-2.5 text-slate-400 pointer-events-none shrink-0">
                {isEmbedCode ? (
                  <Code className="w-5 h-5 text-emerald-600" />
                ) : isMismatched ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
                ) : activePlatform === 'su' ? (
                  <Music className="w-5 h-5 text-emerald-600" />
                ) : activePlatform === 'yt' ? (
                  <Youtube className="w-5 h-5 text-rose-600" />
                ) : (
                  <Facebook className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <input
                ref={inputRef}
                id="share-link-input"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={currentConfig.placeholder}
                disabled={isLoading}
                className="w-full py-3 sm:py-2.5 bg-transparent text-slate-900 placeholder-slate-400 text-sm sm:text-base focus:outline-none"
              />
              {url && (
                <button
                  type="button"
                  onClick={() => {
                    setUrl('');
                    inputRef.current?.focus();
                  }}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg mr-1 transition cursor-pointer shrink-0"
                  title="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              id="extract-audio-submit-btn"
              type="submit"
              disabled={isLoading || !url.trim() || isMismatched}
              className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 sm:py-2.5 rounded-xl font-bold text-base sm:text-sm text-white shadow-xs transition cursor-pointer shrink-0 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                currentConfig.submitBtn
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  <span>Get Audio</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Real-time Mismatch Alert Banner with 1-Click Switch Button */}
        {isMismatched && detected && (
          <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs font-medium">
                This is a <strong className="font-bold text-amber-950">{PLATFORM_CONFIG[detected].name} ({PLATFORM_CONFIG[detected].title})</strong> link.{' '}
                <span className="text-amber-800">
                  It cannot be processed under {currentConfig.name}.
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSwitchToDetected(detected)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0 self-end sm:self-auto"
            >
              <span>Switch to {PLATFORM_CONFIG[detected].name}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Embed code status indicator */}
        {isEmbedCode && (
          <div className="mt-2 px-1 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 font-medium">
              <Code className="w-3 h-3" />
              HTML Iframe / Embed Code Detected
            </span>
          </div>
        )}
      </form>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-rose-900">Audio Extraction Failed</p>
            <p className="text-xs text-rose-700 mt-0.5 leading-relaxed">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};
