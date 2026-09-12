import React, { useState, useEffect } from 'react';
import { DadaMusicLogo } from './DadaMusicLogo';
import { Smartphone } from 'lucide-react';

export const Navbar: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <header
      id="main-header"
      className="shrink-0 z-40 w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-2xs select-none"
    >
      <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 h-16 sm:h-18 lg:h-20 flex items-center justify-between">
        {/* Brand Left */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 lg:gap-4 min-w-0">
          {/* Universal Responsive Logo (40px mobile, 48px tablet, 56px PC) */}
          <DadaMusicLogo className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 drop-shadow-xs shrink-0" />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2.5">
              <h1 className="text-sm sm:text-xl lg:text-2xl font-black tracking-tight text-slate-900 leading-none truncate">
                DADA MUSIC <span className="text-emerald-600">BD</span>
              </h1>
              <span className="text-[9px] sm:text-[11px] lg:text-xs uppercase font-extrabold tracking-wider px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300/80 leading-none shrink-0">
                PWA App
              </span>
            </div>
            <p className="text-[10px] sm:text-xs lg:text-[13px] text-slate-500 font-medium mt-0.5 sm:mt-1 truncate">
              <span className="sm:hidden">High Quality 320 kbps MP3 Downloader</span>
              <span className="hidden sm:inline">Authentic 320 kbps Studio MP3 Downloader & Audio Converter</span>
            </p>
          </div>
        </div>

        {/* Right Action / Engine Status */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isInstallable && (
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer animate-pulse"
              title="Install DADA MUSIC App on your Device"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] sm:text-xs font-bold shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="sm:hidden">Online</span>
            <span className="hidden sm:inline">Engine Online</span>
          </div>
        </div>
      </div>
    </header>
  );
};
