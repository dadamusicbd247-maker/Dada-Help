/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { LinkInputForm, PlatformType } from './components/LinkInputForm';
import { AudioResultCard } from './components/AudioResultCard';
import { ExtractedAudio } from './types';
import { ShieldCheck, UploadCloud } from 'lucide-react';

export default function App() {
  const [url, setUrl] = useState('');
  const [activePlatform, setActivePlatform] = useState<PlatformType>('su');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedAudio, setExtractedAudio] = useState<ExtractedAudio | null>(null);

  // Minimal Watermark state (defaults to /watermark.jpg from server)
  const [watermarkUrl, setWatermarkUrl] = useState<string | null>(() => {
    return localStorage.getItem('dada_watermark_img') || '/watermark.jpg';
  });
  const effectiveWatermark = watermarkUrl || '/watermark.jpg';
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check server for stored watermark on load
  useEffect(() => {
    fetch('/api/watermark-status')
      .then((res) => res.json())
      .then((data) => {
        if (data.exists && data.url) {
          setWatermarkUrl(data.url);
          try {
            localStorage.setItem('dada_watermark_img', data.url);
          } catch {}
        }
      })
      .catch(() => {});
  }, []);

  const handleApplyWatermark = (dataUrl: string) => {
    setWatermarkUrl(dataUrl);
    try {
      localStorage.setItem('dada_watermark_img', dataUrl);
    } catch {}

    fetch('/api/upload-watermark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataUrl }),
    }).catch(() => {});
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          handleApplyWatermark(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveWatermark = () => {
    setWatermarkUrl(null);
    try {
      localStorage.removeItem('dada_watermark_img');
    } catch {}
    fetch('/api/watermark', { method: 'DELETE' }).catch(() => {});
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          handleApplyWatermark(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeAndDownload = async () => {
    if (!url.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim(), platform: activePlatform }),
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        // Server returned HTML (Render cold start / error page)
        throw new Error(
          response.status === 502 || response.status === 503
            ? 'Server is starting up (cold start). Please wait 10–20 seconds and try again.'
            : `Server error (${response.status}). Please try again.`
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Failed to extract audio from this link. Please ensure the link is public and accessible.'
        );
      }

      // Display the audio info card so user can click download when ready
      setExtractedAudio(data);
    } catch (err: any) {
      setError(
        err?.message || 'Failed to extract audio. Please check the URL and try again.'
      );
      setExtractedAudio(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setUrl('');
    setExtractedAudio(null);
    setError(null);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-screen h-[100dvh] max-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-900 flex flex-col overflow-hidden font-sans selection:bg-emerald-100 selection:text-emerald-900 relative"
    >
      {/* Hidden file input for custom watermark */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Drag & Drop Visual Indicator */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-emerald-900/40 backdrop-blur-xs flex items-center justify-center border-4 border-dashed border-emerald-400 m-3 rounded-2xl pointer-events-none">
          <div className="bg-white/95 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 text-emerald-900 font-bold text-sm sm:text-base">
            <UploadCloud className="w-6 h-6 text-emerald-600 animate-bounce" />
            <span>Drop image here to set as background watermark</span>
          </div>
        </div>
      )}

      {/* Watermark Background Layer */}
      {effectiveWatermark && (
        <div
          className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none flex items-center justify-center transition-opacity duration-700"
          aria-hidden="true"
        >
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url(${effectiveWatermark})`,
              backgroundPosition: 'center 35%',
              backgroundRepeat: 'no-repeat',
              backgroundSize: 'cover',
              opacity: 0.28, // Moderately increased opacity for clear visibility while maintaining UI contrast
              filter: 'saturate(112%) contrast(106%)',
              maskImage: 'radial-gradient(ellipse 95% 85% at 50% 40%, black 45%, transparent 95%)',
              WebkitMaskImage: 'radial-gradient(ellipse 95% 85% at 50% 40%, black 45%, transparent 95%)',
            }}
          />
        </div>
      )}

      {/* Top Locked Header - Clean & Untouched */}
      <Navbar />

      {/* Middle Scrollable Content Container */}
      <main
        id="main-scrollable-content"
        className="flex-1 overflow-y-auto w-full overscroll-contain relative z-10"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Main Interface Content */}
        <div className="relative z-10 max-w-2xl sm:max-w-3xl lg:max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 lg:pt-10 pb-8 sm:pb-12 flex flex-col">
          {/* Header and Title */}
          <div className="text-center mb-4 sm:mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 sm:py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] sm:text-xs font-semibold mb-2 sm:mb-3 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>100% Authentic MP3 &bull; 320 kbps High Quality</span>
            </div>
          </div>

          {/* Core Input Form */}
          <div className="mb-3 sm:mb-4">
            <LinkInputForm
              url={url}
              setUrl={setUrl}
              activePlatform={activePlatform}
              setActivePlatform={(p) => {
                setActivePlatform(p);
                setError(null);
              }}
              onAnalyze={handleAnalyzeAndDownload}
              isLoading={isLoading}
              error={error}
            />
          </div>

          {/* Audio Result Card */}
          {extractedAudio && (
            <div className="mt-2 animate-in fade-in slide-in-from-bottom-3 duration-300">
              <AudioResultCard
                audio={extractedAudio}
                onReset={handleReset}
              />
            </div>
          )}

          {/* Reserved clean container slot for future tools */}
          <div id="future-tools-container" className="w-full mt-2" />
        </div>
      </main>

      {/* Bottom Locked Footer - Clean & Untouched */}
      <footer
        id="main-footer"
        className="shrink-0 z-40 w-full border-t border-slate-200/80 bg-white/95 backdrop-blur-md py-3 sm:py-3.5 px-4 sm:px-8 shadow-2xs select-none"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-2">
          <p className="font-medium text-slate-600 text-center sm:text-left text-xs">
            DADA MUSIC BD &bull; 100% Authentic 320 kbps MP3 Audio Downloader
          </p>
          <p className="hidden sm:flex items-center gap-1.5 text-slate-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Studio Audio Direct Stream
          </p>
        </div>
      </footer>
    </div>
  );
}
