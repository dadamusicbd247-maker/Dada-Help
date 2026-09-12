import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';

import os from 'os';
const CACHE_DIR = path.join(os.tmpdir(), 'audio_mp3_cache');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

const FFMPEG_BIN_DIR = path.resolve(process.cwd(), 'bin');

export function getYtDlpBinary(): string {
  const localBin = path.resolve(
    FFMPEG_BIN_DIR,
    process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  );
  if (fs.existsSync(localBin)) return localBin;
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  if (fs.existsSync('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  return 'yt-dlp';
}

function getFfmpegLocationArg(): string[] {
  // If local bin has ffmpeg binary
  const localFfmpeg = path.join(FFMPEG_BIN_DIR, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(localFfmpeg)) {
    return ['--ffmpeg-location', FFMPEG_BIN_DIR];
  }
  if (fs.existsSync('/usr/bin/ffmpeg')) {
    return ['--ffmpeg-location', '/usr/bin'];
  }
  return [];
}

/**
 * Converts a Facebook video/reel link to a high-quality 320kbps MP3 file using yt-dlp & FFmpeg.
 */
export async function convertFacebookToMp3(
  urlStr: string,
  title = 'Facebook Audio',
  artist = 'Facebook Creator'
): Promise<string> {
  const hash = crypto.createHash('md5').update(urlStr).digest('hex');
  const cachedPath = path.join(CACHE_DIR, `fb_${hash}.mp3`);

  // Return cached MP3 if exists and has valid size
  if (fs.existsSync(cachedPath)) {
    const stat = fs.statSync(cachedPath);
    if (stat.size > 10000) {
      return cachedPath;
    }
  }

  const tempTemplate = path.join(CACHE_DIR, `tmp_fb_${hash}_%(id)s.%(ext)s`);

  return new Promise<string>((resolve, reject) => {
    const ytdlpBin = getYtDlpBinary();
    const ffmpegLocationArgs = getFfmpegLocationArg();
    const safeTitle = title.replace(/[\r\n"'\\]/g, ' ').trim() || 'Facebook Audio';
    const safeArtist = artist.replace(/[\r\n"'\\]/g, ' ').trim() || 'Facebook Creator';

    const ytdlp = spawn(ytdlpBin, [
      '--no-warnings',
      '--no-playlist',
      ...ffmpegLocationArgs,
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0', // Best MP3 quality (320kbps / V0)
      '--postprocessor-args',
      `FFmpegExtractAudio:-metadata title="${safeTitle}" -metadata artist="${safeArtist}" -b:a 320k`,
      '-o',
      tempTemplate,
      urlStr,
    ]);

    let stderr = '';
    let stdout = '';

    ytdlp.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    ytdlp.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Find generated mp3 file matching this hash
        const files = fs.readdirSync(CACHE_DIR);
        const match = files.find(
          (f) => f.startsWith(`tmp_fb_${hash}`) && f.endsWith('.mp3')
        );

        if (match) {
          const generatedPath = path.join(CACHE_DIR, match);
          const stat = fs.statSync(generatedPath);
          if (stat.size > 5000) {
            try {
              fs.renameSync(generatedPath, cachedPath);
              return resolve(cachedPath);
            } catch {
              return resolve(generatedPath);
            }
          }
        }
      }

      reject(
        new Error(
          `Facebook audio extraction failed (code ${code}): ${
            stderr.slice(-250) || stdout.slice(-250) || 'Unknown error'
          }`
        )
      );
    });

    ytdlp.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Converts a YouTube video link to a high-quality 320kbps MP3 file using yt-dlp & FFmpeg.
 */
export async function convertYouTubeToMp3(
  urlStr: string,
  title = 'YouTube Audio',
  artist = 'YouTube Creator'
): Promise<string> {
  const hash = crypto.createHash('md5').update(urlStr).digest('hex');
  const cachedPath = path.join(CACHE_DIR, `yt_${hash}.mp3`);

  // Return cached MP3 if exists and has valid size
  if (fs.existsSync(cachedPath)) {
    const stat = fs.statSync(cachedPath);
    if (stat.size > 10000) {
      return cachedPath;
    }
  }

  const tempTemplate = path.join(CACHE_DIR, `tmp_yt_${hash}_%(id)s.%(ext)s`);

  // Check if POT server is running before attempting to use it
  let potRunning = false;
  try {
    const pRes = await fetch('http://127.0.0.1:4416/ping', { signal: AbortSignal.timeout(500) });
    if (pRes.ok) potRunning = true;
  } catch {}

  return new Promise<string>((resolve, reject) => {
    const ytdlpBin = getYtDlpBinary();
    const ffmpegLocationArgs = getFfmpegLocationArg();

    const ytdlArgs = [
      '--no-warnings',
      '--no-playlist',
      ...ffmpegLocationArgs,
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0', // Best MP3 quality (320kbps / V0)
    ];

    if (potRunning) {
      ytdlArgs.push(
        '--extractor-args',
        'youtubepot:provider=bgutil:http;youtubepot:http_base_url=http://127.0.0.1:4416;youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416'
      );
    }

    const safeTitle = title.replace(/[\r\n"'\\]/g, ' ').trim() || 'YouTube Audio';
    const safeArtist = artist.replace(/[\r\n"'\\]/g, ' ').trim() || 'YouTube Creator';

    ytdlArgs.push(
      '--postprocessor-args',
      `FFmpegExtractAudio:-metadata title="${safeTitle}" -metadata artist="${safeArtist}" -b:a 320k`,
      '-o',
      tempTemplate
    );

    // Check for cookie files to bypass bot verification if present
    const cookieCandidates = [
      path.join(process.cwd(), 'cookies.txt'),
      path.join(process.cwd(), 'youtube_cookies.txt'),
      path.join(os.tmpdir(), 'cookies.txt'),
      path.join(os.tmpdir(), 'youtube_cookies.txt'),
    ];
    for (const cPath of cookieCandidates) {
      if (fs.existsSync(cPath) && fs.statSync(cPath).size > 10) {
        ytdlArgs.push('--cookies', cPath);
        break;
      }
    }

    if (process.env.YOUTUBE_COOKIES) {
      try {
        const envCookiePath = path.join(os.tmpdir(), 'env_youtube_cookies.txt');
        fs.writeFileSync(envCookiePath, process.env.YOUTUBE_COOKIES);
        ytdlArgs.push('--cookies', envCookiePath);
      } catch {}
    }

    ytdlArgs.push(urlStr);

    const ytdlp = spawn(ytdlpBin, ytdlArgs);

    let stderr = '';
    let stdout = '';

    ytdlp.stdout.on('data', (d) => {
      stdout += d.toString();
    });

    ytdlp.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Find generated mp3 file matching this hash
        const files = fs.readdirSync(CACHE_DIR);
        const match = files.find(
          (f) => f.startsWith(`tmp_yt_${hash}`) && f.endsWith('.mp3')
        );

        if (match) {
          const generatedPath = path.join(CACHE_DIR, match);
          const stat = fs.statSync(generatedPath);
          if (stat.size > 5000) {
            try {
              fs.renameSync(generatedPath, cachedPath);
              return resolve(cachedPath);
            } catch {
              return resolve(generatedPath);
            }
          }
        }
      }

      const rawErr = stderr.slice(-350) || stdout.slice(-350) || 'Unknown error';
      let message = rawErr;
      if (rawErr.includes('Sign in to confirm') || rawErr.includes('bot')) {
        message = 'YouTube bot protection blocked audio extraction. YouTube requires authentication cookies (cookies.txt) for this server IP.';
      }

      reject(new Error(`YouTube audio extraction failed (code ${code}): ${message}`));
    });

    ytdlp.on('error', (err) => {
      reject(err);
    });
  });
}

