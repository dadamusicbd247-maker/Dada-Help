import React, { useState, useEffect } from 'react';
import {
  Download,
  Check,
  HardDrive,
  FileAudio,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { ExtractedAudio } from '../types';

interface AudioResultCardProps {
  audio: ExtractedAudio;
  onReset?: () => void;
}

export const AudioResultCard: React.FC<AudioResultCardProps> = ({
  audio,
  onReset,
}) => {
  const [customFilename, setCustomFilename] = useState(audio.filename);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setCustomFilename(audio.filename);
    setDownloadError(null);
  }, [audio.filename]);

  const handleRefresh = () => {
    if (onReset) {
      onReset();
    } else {
      window.location.reload();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDownload = () => {
    setIsDownloading(true);
    setDownloadSuccess(false);
    setDownloadError(null);

    const targetFilename = (customFilename || audio.filename || 'downloaded_audio.mp3').trim();

    try {
      let downloadEndpoint = audio.directAudioUrl;
      if (!downloadEndpoint.startsWith('/api/download')) {
        downloadEndpoint = `/api/download?url=${encodeURIComponent(
          audio.directAudioUrl
        )}&filename=${encodeURIComponent(targetFilename)}`;
      } else {
        try {
          const urlObj = new URL(downloadEndpoint, window.location.origin);
          urlObj.searchParams.set('filename', targetFilename);
          downloadEndpoint = urlObj.pathname + urlObj.search;
        } catch {}
      }

      // Trigger direct native browser download
      const a = document.createElement('a');
      a.href = downloadEndpoint;
      a.setAttribute('download', targetFilename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err: any) {
      console.error('Download trigger error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-white/90 border border-emerald-100 rounded-2xl p-4 sm:p-6 shadow-xl shadow-emerald-500/5 backdrop-blur-xl text-slate-800">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 text-emerald-700">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-bold tracking-tight text-slate-900">100% Authentic MP3 Audio</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <HardDrive className="w-3 h-3 text-slate-500" />
            {audio.provider}
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            MP3 (320 kbps)
          </span>
          {audio.sizeFormatted && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              {audio.sizeFormatted}
            </span>
          )}
        </div>
      </div>

      {/* Track Artwork & Details */}
      <div className="mt-4 p-3 sm:p-4 bg-slate-50/80 border border-slate-200 rounded-xl flex items-start sm:items-center gap-3 sm:gap-4">
        {audio.thumbnailUrl ? (
          <img
            src={audio.thumbnailUrl}
            alt={audio.title}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl object-cover shadow-2xs shrink-0 border border-slate-200"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <FileAudio className="w-8 h-8" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-snug break-words">
            {audio.title}
          </h4>
          {audio.artist && (
            <p className="text-xs text-slate-500 truncate mt-0.5">{audio.artist}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
            <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {audio.format} Direct Stream
            </span>
            {audio.duration && (
              <span className="text-[10px] sm:text-[11px] text-slate-500 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                {audio.duration}
              </span>
            )}
            <span className="text-[10px] sm:text-[11px] text-slate-500 hidden xs:inline">
              Raw Audio (Lossless Stream)
            </span>
          </div>
        </div>
      </div>

      {/* Filename editor */}
      <div className="mt-4">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
          Save As Filename
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <FileAudio className="w-4 h-4 text-slate-500" />
          </div>
          <input
            id="custom-filename-input"
            type="text"
            value={customFilename}
            onChange={(e) => setCustomFilename(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-600 focus:bg-white font-mono transition"
            placeholder="audio.mp3"
          />
        </div>
      </div>

      {/* Primary Download and Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-5 mt-2 border-t border-slate-100">
        <button
          id="download-audio-btn"
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold text-base shadow-sm transition cursor-pointer disabled:opacity-75"
        >
          {isDownloading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating High Quality MP3...</span>
            </>
          ) : downloadSuccess ? (
            <>
              <Check className="w-5 h-5 stroke-[2.5]" />
              <span>MP3 Download Triggered!</span>
            </>
          ) : (
            <>
              <Download className="w-5 h-5 stroke-[2.5]" />
              <span>Download MP3 Audio (320 kbps)</span>
            </>
          )}
        </button>

        {/* Refresh button to reset and paste a new link */}
        <button
          id="refresh-page-btn"
          type="button"
          onClick={handleRefresh}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 sm:py-4 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 hover:text-slate-900 font-semibold text-sm sm:text-base transition cursor-pointer shrink-0"
          title="Refresh to paste a new link"
        >
          <RotateCcw className="w-4 h-4 text-slate-600" />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
};

