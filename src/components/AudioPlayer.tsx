import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, Radio } from 'lucide-react';

interface AudioPlayerProps {
  streamUrl: string;
  directUrl: string;
  title: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ streamUrl, directUrl, title }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [activeUrl, setActiveUrl] = useState(streamUrl);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [usingDirectFallback, setUsingDirectFallback] = useState(false);

  useEffect(() => {
    setActiveUrl(streamUrl);
    setUsingDirectFallback(false);
    setLoadError(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(false);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = streamUrl;
      audioRef.current.load();
    }
  }, [streamUrl, directUrl]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          // If stream failed, try fallback to direct URL
          if (!usingDirectFallback && directUrl && activeUrl !== directUrl) {
            setUsingDirectFallback(true);
            setActiveUrl(directUrl);
            if (audioRef.current) {
              audioRef.current.src = directUrl;
              audioRef.current.load();
              audioRef.current
                .play()
                .then(() => {
                  setIsPlaying(true);
                  setIsLoading(false);
                  setLoadError(false);
                })
                .catch(() => {
                  setIsPlaying(false);
                  setIsLoading(false);
                  setLoadError(true);
                });
            }
          } else {
            setIsPlaying(false);
            setIsLoading(false);
            setLoadError(true);
          }
        });
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
      setIsLoading(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIndex];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const restartTrack = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs === Infinity || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <audio
        ref={audioRef}
        src={activeUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onError={() => {
          if (!usingDirectFallback && directUrl && activeUrl !== directUrl) {
            setUsingDirectFallback(true);
            setActiveUrl(directUrl);
            if (audioRef.current) {
              audioRef.current.src = directUrl;
              audioRef.current.load();
            }
          } else {
            setIsLoading(false);
            setLoadError(true);
          }
        }}
      />

      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] uppercase tracking-wider text-emerald-700 font-semibold">
              Audio Preview
            </span>
            {usingDirectFallback && (
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                Direct Stream
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
        </div>

        {/* Visualizer bars */}
        <div className="flex items-end gap-1 h-5 px-1">
          {[40, 75, 100, 60, 90, 45, 80].map((height, i) => (
            <div
              key={i}
              className={`w-1 rounded-full bg-emerald-600 transition-all duration-300 ${
                isPlaying ? 'animate-pulse' : 'opacity-25'
              }`}
              style={{
                height: isPlaying ? `${Math.max(20, (height * ((i % 3) + 1)) / 3)}%` : '20%',
                animationDelay: `${i * 100}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Progress timeline */}
      <div className="space-y-1 mb-3">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          disabled={!duration || isNaN(duration)}
          className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600 hover:accent-emerald-700 transition"
          aria-label="Seek audio"
        />
        <div className="flex justify-between text-[11px] text-slate-500 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{duration > 0 ? formatTime(duration) : 'Live Stream'}</span>
        </div>
      </div>

      {/* Player Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-200">
        <div className="flex items-center gap-2">
          {/* Play/Pause Button */}
          <button
            id="play-audio-btn"
            onClick={togglePlay}
            disabled={loadError && usingDirectFallback}
            className="w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {/* Restart Button */}
          <button
            onClick={restartTrack}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
            title="Restart track"
            aria-label="Restart track"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Toggle */}
          <button
            onClick={cyclePlaybackRate}
            className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg transition cursor-pointer"
            title="Playback Speed"
          >
            {playbackRate}x
          </button>
        </div>

        {/* Volume controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-slate-500 hover:text-slate-800 transition cursor-pointer"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            aria-label="Volume slider"
          />
        </div>
      </div>

      {loadError && usingDirectFallback && (
        <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-center justify-between">
          <span>Direct browser preview is restricted. Click Download Audio below to save the file.</span>
          <a
            href={directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 font-semibold underline text-emerald-700 hover:text-emerald-900"
          >
            Play in Tab
          </a>
        </div>
      )}
    </div>
  );
};
