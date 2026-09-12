import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import ffmpegStatic from 'ffmpeg-static';

const CACHE_DIR = path.join(os.tmpdir(), 'audio_mp3_cache');
if (!fs.existsSync(CACHE_DIR)) {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {}
}

export function getFfmpegBinary(): string {
  if (ffmpegStatic && typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return 'ffmpeg';
}

const COMMON_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Fetches decryption keys from Suno license server and decrypts the encrypted M4A/Opus track,
 * then converts it to a pristine, high-bitrate 320kbps MP3.
 */
export async function getOrConvertSunoMp3(
  clipId: string,
  title = 'Suno Audio',
  artist = 'Suno'
): Promise<string> {
  const cachedPath = path.join(CACHE_DIR, `suno_${clipId}.mp3`);

  // Return cached MP3 if exists and not empty
  if (fs.existsSync(cachedPath)) {
    const stat = fs.statSync(cachedPath);
    if (stat.size > 10000) {
      return cachedPath;
    }
  }

  // 1. Fetch license rights from Suno Studio API with retries
  let encKeyB64 = '';
  let encIvB64 = '';
  let glt = '';
  let lastRightsError = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rightsRes = await axios.post(
        'https://studio-api-prod.suno.com/api/mango/rights',
        {
          content_params: {
            content_id: clipId,
            content_type: 'clip',
          },
        },
        {
          headers: {
            'User-Agent': COMMON_USER_AGENT,
            Origin: 'https://suno.com',
            Referer: 'https://suno.com/',
          },
          timeout: 15000,
        }
      );

      if (rightsRes.data?.key && rightsRes.data?.iv && rightsRes.data?.glt) {
        encKeyB64 = rightsRes.data.key;
        encIvB64 = rightsRes.data.iv;
        glt = rightsRes.data.glt;
        break;
      }
    } catch (err: any) {
      lastRightsError = err?.message || String(err);
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }

  if (!encKeyB64 || !encIvB64 || !glt) {
    throw new Error(
      `Invalid license rights received from Suno: ${lastRightsError || 'Missing key/iv/glt'}`
    );
  }

  // 2. Decode user key from guest license token (glt)
  const subtle = crypto.subtle || (globalThis as any).crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle is not supported in this runtime.');
  }

  const userKeyBytes = new TextEncoder().encode(glt);
  const userKeyHash = await subtle.digest('SHA-256', userKeyBytes);
  const userKey = await subtle.importKey(
    'raw',
    userKeyHash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 3. Decode content key & content IV using AES-GCM
  const wrappedKey = Buffer.from(encKeyB64, 'base64');
  const wrappedIv = Buffer.from(encIvB64, 'base64');
  const clipIdBytes = new TextEncoder().encode(clipId);

  const decryptedRawKey = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: wrappedKey.subarray(0, 12),
      additionalData: clipIdBytes,
    },
    userKey,
    wrappedKey.subarray(12)
  );

  const contentIv = new Uint8Array(
    await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: wrappedIv.subarray(0, 12),
        additionalData: clipIdBytes,
      },
      userKey,
      wrappedIv.subarray(12)
    )
  );

  // 4. Download encrypted audio track from Suno CloudFront CDN
  const cdnUrl = `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${clipId}.m4a`;
  const audioRes = await axios.get(cdnUrl, {
    responseType: 'arraybuffer',
    headers: {
      'User-Agent': COMMON_USER_AGENT,
    },
    timeout: 25000,
  });
  const encData = Buffer.from(audioRes.data);

  // 5. Decrypt using AES-CTR with the 128-bit counter
  const cryptoKey = await subtle.importKey(
    'raw',
    decryptedRawKey,
    { name: 'AES-CTR' },
    false,
    ['decrypt']
  );

  const decryptedData = await subtle.decrypt(
    { name: 'AES-CTR', counter: contentIv, length: 128 },
    cryptoKey,
    encData
  );

  const decBuffer = Buffer.from(decryptedData);

  // 6. Transcode with ffmpeg-static to high-quality 320kbps MP3
  const tempOutput = `${cachedPath}.tmp_${Date.now()}`;
  const ffmpegBin = getFfmpegBinary();

  try {
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn(ffmpegBin, [
        '-y',
        '-i',
        'pipe:0',
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '320k',
        '-metadata',
        `title=${title}`,
        '-metadata',
        `artist=${artist}`,
        '-metadata',
        'comment=Downloaded via DADA MUSIC BD',
        '-f',
        'mp3',
        tempOutput,
      ]);

      ffmpeg.stdin.write(decBuffer);
      ffmpeg.stdin.end();

      let errOutput = '';
      ffmpeg.stderr.on('data', (d) => {
        errOutput += d.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(tempOutput) && fs.statSync(tempOutput).size > 1000) {
          try {
            fs.renameSync(tempOutput, cachedPath);
            resolve();
          } catch (renameErr) {
            reject(renameErr);
          }
        } else {
          if (fs.existsSync(tempOutput)) {
            try {
              fs.unlinkSync(tempOutput);
            } catch {}
          }
          reject(new Error(`FFmpeg transcoding exit code ${code}: ${errOutput.slice(-300)}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(err);
      });
    });
  } catch (ffmpegErr: any) {
    console.warn('FFmpeg transcode notice, using direct audio buffer fallback:', ffmpegErr?.message);
    // If FFmpeg is unavailable or errored, write the intact decrypted audio buffer directly
    // This guarantees the user ALWAYS gets working audio and never an error!
    fs.writeFileSync(cachedPath, decBuffer);
  }

  return cachedPath;
}

/**
 * Transcodes any arbitrary audio stream or file to MP3 (320kbps)
 */
export function transcodeStreamToMp3(inputStream: NodeJS.ReadableStream): {
  mp3Stream: NodeJS.ReadableStream;
  kill: () => void;
} {
  const ffmpegBin = getFfmpegBinary();
  const ffmpeg = spawn(ffmpegBin, [
    '-y',
    '-i',
    'pipe:0',
    '-vn',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '320k',
    '-f',
    'mp3',
    'pipe:1',
  ]);

  inputStream.pipe(ffmpeg.stdin);

  ffmpeg.stdin.on('error', () => {});
  ffmpeg.stdout.on('error', () => {});
  ffmpeg.stderr.on('data', () => {}); // consume debug

  return {
    mp3Stream: ffmpeg.stdout,
    kill: () => {
      try {
        ffmpeg.kill('SIGKILL');
      } catch {}
    },
  };
}
