import fs from 'fs';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import axios from 'axios';
import ffmpegStatic from 'ffmpeg-static';

const CACHE_DIR = path.join(os.tmpdir(), 'audio_mp3_cache');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

const FFMPEG_BIN_DIR = path.resolve(process.cwd(), 'bin');

let ytdlpReadyPromise: Promise<string> | null = null;

export async function ensureYtDlpBinary(): Promise<string> {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';

  // 1. Check bin directory
  const localBin = path.resolve(FFMPEG_BIN_DIR, binName);
  if (fs.existsSync(localBin) && fs.statSync(localBin).size > 100000) {
    if (!isWin) {
      try { fs.chmodSync(localBin, 0o755); } catch {}
    }
    return localBin;
  }

  // 2. Check cache dir
  const cacheBin = path.join(CACHE_DIR, binName);
  if (fs.existsSync(cacheBin) && fs.statSync(cacheBin).size > 100000) {
    if (!isWin) {
      try { fs.chmodSync(cacheBin, 0o755); } catch {}
    }
    return cacheBin;
  }

  // 3. Check system path (/usr/local/bin, /usr/bin)
  if (!isWin) {
    if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
    if (fs.existsSync('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  }

  try {
    const check = spawnSync('yt-dlp', ['--version']);
    if (check.status === 0) return 'yt-dlp';
  } catch {}

  // 4. Download on-the-fly
  if (ytdlpReadyPromise) return ytdlpReadyPromise;

  ytdlpReadyPromise = (async () => {
    try {
      const targetDir = fs.existsSync(FFMPEG_BIN_DIR) ? FFMPEG_BIN_DIR : CACHE_DIR;
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const targetFile = path.join(targetDir, binName);
      if (fs.existsSync(targetFile) && fs.statSync(targetFile).size > 100000) {
        if (!isWin) {
          try { fs.chmodSync(targetFile, 0o755); } catch {}
        }
        return targetFile;
      }

      const url = isWin
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

      console.log(`[mediaConverter] Downloading yt-dlp binary for ${process.platform} from ${url}...`);
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        maxRedirects: 5,
        timeout: 60000,
      });

      fs.writeFileSync(targetFile, Buffer.from(response.data));
      if (!isWin) {
        try { fs.chmodSync(targetFile, 0o755); } catch {}
      }
      console.log(`[mediaConverter] yt-dlp binary ready at ${targetFile}`);
      return targetFile;
    } catch (dlErr: any) {
      console.error('[mediaConverter] Failed to download yt-dlp binary:', dlErr?.message);
      return 'yt-dlp';
    }
  })();

  return ytdlpReadyPromise;
}

export function getYtDlpBinary(): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
  const localBin = path.resolve(FFMPEG_BIN_DIR, binName);
  if (fs.existsSync(localBin)) {
    if (!isWin) {
      try { fs.chmodSync(localBin, 0o755); } catch {}
    }
    return localBin;
  }
  const cacheBin = path.join(CACHE_DIR, binName);
  if (fs.existsSync(cacheBin)) {
    if (!isWin) {
      try { fs.chmodSync(cacheBin, 0o755); } catch {}
    }
    return cacheBin;
  }
  if (!isWin) {
    if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
    if (fs.existsSync('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';
  }
  return 'yt-dlp';
}

function getFfmpegLocationArg(): string[] {
  if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
    return ['--ffmpeg-location', ffmpegStatic];
  }
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
  const ytdlpBin = await ensureYtDlpBinary();
  const ffmpegLocationArgs = getFfmpegLocationArg();
  const safeTitle = title.replace(/[\r\n"'\\]/g, ' ').trim() || 'Facebook Audio';
  const safeArtist = artist.replace(/[\r\n"'\\]/g, ' ').trim() || 'Facebook Creator';

  return new Promise<string>((resolve, reject) => {

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

  const ytdlpBin = await ensureYtDlpBinary();
  const ffmpegLocationArgs = getFfmpegLocationArg();

  const runAttempt = (playerClients: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      const ytdlArgs = [
        '--no-warnings',
        '--no-playlist',
        ...ffmpegLocationArgs,
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0', // Best MP3 quality (320kbps / V0)
        '--geo-bypass',
        '--socket-timeout',
        '30',
      ];

      if (potRunning) {
        ytdlArgs.push(
          '--extractor-args',
          'youtubepot:provider=bgutil:http;youtubepot:http_base_url=http://127.0.0.1:4416;youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416'
        );
      } else {
        ytdlArgs.push(
          '--extractor-args',
          `youtube:player_client=${playerClients}`
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
                if (fs.existsSync(cachedPath)) {
                  try { fs.unlinkSync(cachedPath); } catch {}
                }
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
  };

  try {
    return await runAttempt('android,ios,mweb,web');
  } catch (err: any) {
    console.warn('First YouTube attempt failed, retrying with mweb,tv,web client...', err?.message);
    return await runAttempt('mweb,tv,web');
  }
}

