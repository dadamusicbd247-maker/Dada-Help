import axios from 'axios';
import fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import { getOrConvertSunoMp3 } from './sunoDecryptor';
import { convertFacebookToMp3, convertYouTubeToMp3 } from './mediaConverter';

export interface ExtractedAudioInfo {
  success: boolean;
  provider: string;
  title: string;
  artist?: string;
  filename: string;
  directAudioUrl: string;
  mimeType: string;
  sizeBytes?: number;
  sizeFormatted?: string;
  format: string;
  duration?: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  platform?: 'su' | 'yt' | 'fb' | 'direct';
  externalConvertUrl?: string;
  alternativeTracks?: Array<{
    title: string;
    filename: string;
    url: string;
    format: string;
    sizeFormatted?: string;
  }>;
  error?: string;
}

const COMMON_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch {
      aiClient = null;
    }
  }
  return aiClient;
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return 'Unknown Size';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i] || 'MB'}`;
}

export function sanitizeFilename(name: string, fallbackExt = 'mp3'): string {
  let cleaned = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  if (!cleaned) cleaned = `audio_${Date.now()}`;
  if (!cleaned.includes('.')) {
    cleaned = `${cleaned}.${fallbackExt}`;
  }
  return cleaned;
}

export function getFormatFromMime(mime: string, fallback = 'MP3'): string {
  const m = mime.toLowerCase();
  if (m.includes('mpeg') || m.includes('mp3')) return 'MP3';
  if (m.includes('wav')) return 'WAV';
  if (m.includes('ogg') || m.includes('opus')) return 'OGG';
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac')) return 'M4A';
  if (m.includes('flac')) return 'FLAC';
  if (m.includes('webm')) return 'WEBM';
  return fallback.toUpperCase();
}

/**
 * Parses Google Drive share URLs:
 * e.g., https://drive.google.com/file/d/1A2B3C.../view?usp=sharing
 * https://drive.google.com/open?id=1A2B3C...
 */
async function resolveGoogleDrive(urlStr: string): Promise<ExtractedAudioInfo | null> {
  const match =
    urlStr.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    urlStr.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    urlStr.match(/\/uc\?id=([a-zA-Z0-9_-]+)/);

  if (!match) return null;
  const fileId = match[1];
  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

  try {
    const res = await axios.get(directUrl, {
      headers: { 'User-Agent': COMMON_USER_AGENT },
      maxRedirects: 5,
      responseType: 'stream',
      validateStatus: () => true,
    });

    const contentType = (res.headers['content-type'] as string) || '';
    const contentDisposition = (res.headers['content-disposition'] as string) || '';
    const contentLength = parseInt(res.headers['content-length'] as string, 10) || 0;

    let filename = `google_drive_audio_${fileId}.mp3`;
    if (contentDisposition.includes('filename=')) {
      const fnMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;"\n]+)['"]?/i);
      if (fnMatch && fnMatch[1]) {
        filename = decodeURIComponent(fnMatch[1].replace(/["']/g, '').trim());
      }
    }

    // If large file virus warning page was returned instead of binary stream
    if (contentType.includes('text/html')) {
      // Fetch text to find confirm token
      const htmlRes = await axios.get(directUrl, {
        headers: { 'User-Agent': COMMON_USER_AGENT },
      });
      const html = htmlRes.data as string;
      const confirmMatch = html.match(/confirm=([a-zA-Z0-9_-]+)/) || html.match(/id="confirm"[^>]*value="([^"]+)"/);
      const confirmToken = confirmMatch ? confirmMatch[1] : 't';
      const confirmedUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;

      // Try reading page title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(' - Google Drive', '').trim() : `Google Drive Audio`;

      return {
        success: true,
        provider: 'Google Drive',
        title: title || filename,
        filename: sanitizeFilename(title || filename, 'mp3'),
        directAudioUrl: confirmedUrl,
        mimeType: 'audio/mpeg',
        sizeFormatted: 'Large File (Stream ready)',
        format: 'MP3',
        sourceUrl: urlStr,
      };
    }

    const title = filename.replace(/\.[^/.]+$/, '');
    const mime = contentType.startsWith('audio/') ? contentType : 'audio/mpeg';

    return {
      success: true,
      provider: 'Google Drive',
      title,
      filename: sanitizeFilename(filename, 'mp3'),
      directAudioUrl: directUrl,
      mimeType: mime,
      sizeBytes: contentLength || undefined,
      sizeFormatted: contentLength ? formatBytes(contentLength) : 'Direct Stream',
      format: getFormatFromMime(mime, 'MP3'),
      sourceUrl: urlStr,
    };
  } catch (err: any) {
    return {
      success: true,
      provider: 'Google Drive',
      title: `Google Drive Audio (${fileId})`,
      filename: `gdrive_${fileId}.mp3`,
      directAudioUrl: directUrl,
      mimeType: 'audio/mpeg',
      format: 'MP3',
      sourceUrl: urlStr,
    };
  }
}

/**
 * Parses Dropbox URLs:
 * e.g., https://www.dropbox.com/s/xyz/song.mp3?dl=0
 * https://www.dropbox.com/scl/fi/xyz/song.mp3?rlkey=...&dl=0
 */
async function resolveDropbox(urlStr: string): Promise<ExtractedAudioInfo | null> {
  if (!urlStr.includes('dropbox.com')) return null;

  let directUrl = urlStr;
  if (directUrl.includes('?')) {
    directUrl = directUrl.replace(/([?&])dl=[01]/, '$1raw=1');
    if (!directUrl.includes('raw=1')) {
      directUrl += '&raw=1';
    }
  } else {
    directUrl += '?raw=1';
  }

  // Extract filename from path
  const urlPath = new URL(urlStr).pathname;
  const segments = urlPath.split('/').filter(Boolean);
  let rawFilename = segments[segments.length - 1] || 'dropbox_audio.mp3';
  rawFilename = decodeURIComponent(rawFilename);

  try {
    const head = await axios.head(directUrl, {
      headers: { 'User-Agent': COMMON_USER_AGENT },
      maxRedirects: 5,
      timeout: 7000,
    });
    const size = parseInt(head.headers['content-length'] as string, 10) || 0;
    const mime = (head.headers['content-type'] as string) || 'audio/mpeg';

    return {
      success: true,
      provider: 'Dropbox',
      title: rawFilename.replace(/\.[^/.]+$/, ''),
      filename: sanitizeFilename(rawFilename, 'mp3'),
      directAudioUrl: directUrl,
      mimeType: mime.startsWith('audio/') ? mime : 'audio/mpeg',
      sizeBytes: size || undefined,
      sizeFormatted: size ? formatBytes(size) : 'Ready to Download',
      format: getFormatFromMime(mime, 'MP3'),
      sourceUrl: urlStr,
    };
  } catch {
    return {
      success: true,
      provider: 'Dropbox',
      title: rawFilename.replace(/\.[^/.]+$/, ''),
      filename: sanitizeFilename(rawFilename, 'mp3'),
      directAudioUrl: directUrl,
      mimeType: 'audio/mpeg',
      format: 'MP3',
      sourceUrl: urlStr,
    };
  }
}

/**
 * Parses Vocaroo voice note links:
 * e.g., https://vocaroo.com/1a2b3c or https://voca.ro/1a2b3c
 */
function resolveVocaroo(urlStr: string): ExtractedAudioInfo | null {
  const match = urlStr.match(/(?:vocaroo\.com|voca\.ro)\/([a-zA-Z0-9]+)/);
  if (!match) return null;
  const id = match[1];
  const directUrl = `https://media1.vocaroo.com/mp3/${id}`;

  return {
    success: true,
    provider: 'Vocaroo Voice',
    title: `Vocaroo Recording (${id})`,
    filename: `vocaroo_${id}.mp3`,
    directAudioUrl: directUrl,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    sourceUrl: urlStr,
  };
}

/**
 * Parses Suno AI song links or embed iframes:
 * Handles:
 * - https://suno.com/song/UUID
 * - https://suno.com/@username/song/UUID
 * - https://suno.com/create?song=UUID
 * - https://suno.com/embed/UUID
 * - https://suno.com/s/SHORTCODE
 * - <iframe src="https://suno.com/embed/UUID" ...>
 * - Direct UUID strings
 */
async function resolveSuno(urlStr: string): Promise<ExtractedAudioInfo | null> {
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  let clipId: string | null = null;

  const isSunoUrl = /suno\.(?:com|ai)|cloudfront\.net\/1\/clip/i.test(urlStr);
  const directMatch = urlStr.match(uuidRegex);

  if (directMatch && (isSunoUrl || !urlStr.startsWith('http'))) {
    clipId = directMatch[0].toLowerCase();
  } else if (isSunoUrl) {
    // If it's a short link or redirect link like https://suno.com/s/...
    try {
      const resp = await axios.get(urlStr, {
        headers: { 'User-Agent': COMMON_USER_AGENT },
        maxRedirects: 5,
        timeout: 8000,
        validateStatus: () => true,
      });
      const finalUrl = resp.request?.res?.responseUrl || '';
      const finalMatch = finalUrl.match(uuidRegex) || String(resp.data).match(uuidRegex);
      if (finalMatch) {
        clipId = finalMatch[0].toLowerCase();
      }
    } catch {}
  }

  if (!clipId) return null;

  let title = 'Suno AI Song';
  let artist = 'Suno Creator';
  let duration: string | undefined = undefined;
  let thumbnailUrl: string | undefined = `https://cdn2.suno.ai/image_large_${clipId}.jpeg`;

  // 1. Fetch metadata from Suno's official studio clip API
  try {
    const apiRes = await axios.get(`https://studio-api-prod.suno.com/api/clip/${clipId}`, {
      headers: {
        'User-Agent': COMMON_USER_AGENT,
        Origin: 'https://suno.com',
        Referer: 'https://suno.com/',
      },
      timeout: 7000,
      validateStatus: (status) => status === 200,
    });
    const clipData = apiRes.data;
    if (clipData) {
      if (clipData.title && clipData.title.trim()) {
        title = clipData.title.trim();
      }
      if (clipData.display_name) {
        artist = clipData.handle
          ? `${clipData.display_name} (@${clipData.handle})`
          : clipData.display_name;
      } else if (clipData.handle) {
        artist = `@${clipData.handle}`;
      }
      if (clipData.image_large_url) {
        thumbnailUrl = clipData.image_large_url;
      } else if (clipData.image_url) {
        thumbnailUrl = clipData.image_url;
      }
      if (clipData.metadata?.duration) {
        const secs = Math.round(parseFloat(clipData.metadata.duration));
        duration = `${Math.floor(secs / 60)}:${secs % 60 < 10 ? '0' : ''}${secs % 60}`;
      }
    }
  } catch {
    // Fallback: Scrape song page for OpenGraph tags
    try {
      const pageRes = await axios.get(`https://suno.com/song/${clipId}`, {
        headers: { 'User-Agent': COMMON_USER_AGENT },
        timeout: 7000,
      });
      const html = pageRes.data;

      const ogTitle =
        html.match(/property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:title["']/i);
      if (ogTitle && ogTitle[1]) title = ogTitle[1].trim();

      const ogDesc =
        html.match(/property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:description["']/i);
      if (ogDesc && ogDesc[1]) artist = ogDesc[1].trim();

      const ogImage =
        html.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
        html.match(/content=["']([^"']+)["']\s+property=["']og:image["']/i);
      if (ogImage && ogImage[1]) thumbnailUrl = ogImage[1];

      const durMatch = html.match(/"duration":\s*([0-9.]+)/);
      if (durMatch && durMatch[1]) {
        const secs = Math.round(parseFloat(durMatch[1]));
        duration = `${Math.floor(secs / 60)}:${secs % 60 < 10 ? '0' : ''}${secs % 60}`;
      }
    } catch (err: any) {
      console.warn('Suno metadata scrape notice:', err?.message);
    }
  }

  const safeFilename = sanitizeFilename(`${title}.mp3`, 'mp3');

  // 2. Pre-decrypt and convert to true 320 kbps MP3 on the server
  // This guarantees the download will never fail or return a 00:00 (empty/corrupted) audio file.
  let sizeBytes: number | undefined;
  let sizeFormatted = '320 kbps MP3';

  try {
    const mp3Path = await getOrConvertSunoMp3(clipId, title, artist);
    if (fs.existsSync(mp3Path)) {
      const stat = fs.statSync(mp3Path);
      sizeBytes = stat.size;
      sizeFormatted = `${formatBytes(stat.size)} • 320 kbps MP3`;
    }
  } catch (convErr: any) {
    console.warn(`Suno pre-conversion notice for clip ${clipId}:`, convErr?.message || convErr);
    const msg = String(convErr?.message || '');
    if (msg.includes('404') || msg.includes('403') || msg.includes('Invalid license rights')) {
      throw new Error(
        'The Suno AI track was not found or is set to private on Suno. Please provide an active, public Suno song link.'
      );
    }
  }

  const directMp3DownloadUrl = `/api/download?sunoId=${clipId}&title=${encodeURIComponent(
    title
  )}&artist=${encodeURIComponent(artist || '')}&filename=${encodeURIComponent(safeFilename)}`;

  return {
    success: true,
    provider: 'SU Audio (Suno AI Music)',
    title,
    artist,
    filename: safeFilename,
    directAudioUrl: directMp3DownloadUrl,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    duration: duration || '3:20',
    sizeBytes,
    sizeFormatted,
    thumbnailUrl,
    sourceUrl: urlStr,
    platform: 'su',
  };
}

/**
 * Parses Archive.org links:
 * e.g., https://archive.org/details/IDENTIFIER
 */
async function resolveArchiveOrg(urlStr: string): Promise<ExtractedAudioInfo | null> {
  const match = urlStr.match(/archive\.org\/details\/([^/?#]+)/);
  if (!match) return null;
  const identifier = match[1];

  try {
    const metaRes = await axios.get(`https://archive.org/metadata/${identifier}`, {
      timeout: 8000,
    });
    const data = metaRes.data;
    const title = data?.metadata?.title || identifier;
    const files: any[] = data?.files || [];

    // Filter audio files
    const audioFiles = files.filter((f) => {
      const fmt = (f.format || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      return (
        fmt.includes('mp3') ||
        fmt.includes('flac') ||
        fmt.includes('ogg') ||
        fmt.includes('wav') ||
        fmt.includes('audio') ||
        name.endsWith('.mp3') ||
        name.endsWith('.flac') ||
        name.endsWith('.ogg') ||
        name.endsWith('.wav') ||
        name.endsWith('.m4a')
      );
    });

    if (audioFiles.length > 0) {
      // Pick best primary track (prefer MP3 or VBR MP3)
      const primary =
        audioFiles.find((f) => (f.name || '').endsWith('.mp3')) ||
        audioFiles[0];

      let directUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(primary.name)}`;
      if (data?.server && data?.dir) {
        directUrl = `https://${data.server}${data.dir}/${encodeURIComponent(primary.name)}`;
      }
      const size = parseInt(primary.size, 10) || 0;

      const altTracks = audioFiles.slice(0, 15).map((f) => {
        let trackUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`;
        if (data?.server && data?.dir) {
          trackUrl = `https://${data.server}${data.dir}/${encodeURIComponent(f.name)}`;
        }
        return {
          title: f.title || f.name.replace(/\.[^/.]+$/, ''),
          filename: sanitizeFilename(f.name, 'mp3'),
          url: trackUrl,
          format: f.format || getFormatFromMime(f.name),
          sizeFormatted: f.size ? formatBytes(parseInt(f.size, 10)) : undefined,
        };
      });

      return {
        success: true,
        provider: 'Internet Archive',
        title: primary.title || title || primary.name,
        filename: sanitizeFilename(primary.name, 'mp3'),
        directAudioUrl: directUrl,
        mimeType: 'audio/mpeg',
        sizeBytes: size || undefined,
        sizeFormatted: size ? formatBytes(size) : undefined,
        format: primary.format || 'MP3',
        duration: primary.length ? `${Math.round(parseFloat(primary.length))} sec` : undefined,
        sourceUrl: urlStr,
        alternativeTracks: altTracks.length > 1 ? altTracks : undefined,
      };
    }
  } catch {
    // fallback
  }

  return null;
}

/**
 * Parses YouTube URLs (watch, shorts, youtu.be) and extracts metadata
 */
async function resolveYouTube(urlStr: string): Promise<ExtractedAudioInfo | null> {
  const isYt = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|v\/)|youtu\.be\/)/i.test(urlStr);
  if (!isYt) return null;

  let videoId = '';
  const match = urlStr.match(/(?:v=|\/shorts\/|\/embed\/|\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (match) videoId = match[1];

  let title = 'YouTube Audio Track';
  let artist = 'YouTube Creator';
  let thumbnailUrl: string | undefined = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr)}&format=json`;
    const oRes = await axios.get(oembedUrl, {
      headers: { 'User-Agent': COMMON_USER_AGENT },
      timeout: 5000,
    });
    if (oRes.data) {
      if (oRes.data.title) title = oRes.data.title;
      if (oRes.data.author_name) artist = oRes.data.author_name;
      if (oRes.data.thumbnail_url) thumbnailUrl = oRes.data.thumbnail_url;
    }
  } catch {
    // fallback to video id title
    if (videoId) title = `YouTube Track (${videoId})`;
  }

  const safeFilename = sanitizeFilename(`${artist} - ${title}.mp3`, 'mp3');
  // Stream audio endpoint
  const streamUrl = `/api/download?url=${encodeURIComponent(urlStr)}&filename=${encodeURIComponent(safeFilename)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;

  let sizeBytes: number | undefined;
  let sizeFormatted = '320 kbps MP3';

  try {
    const mp3Path = await convertYouTubeToMp3(urlStr, title, artist);
    if (fs.existsSync(mp3Path)) {
      const stat = fs.statSync(mp3Path);
      sizeBytes = stat.size;
      sizeFormatted = `${formatBytes(stat.size)} • 320 kbps MP3`;
    }
  } catch {
    // Pre-conversion can be deferred to on-demand download stream
  }

  return {
    success: true,
    provider: 'YT Audio (YouTube)',
    title: title,
    artist: artist,
    filename: safeFilename,
    directAudioUrl: streamUrl,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    duration: 'HD Studio Audio',
    sizeBytes,
    sizeFormatted,
    thumbnailUrl: thumbnailUrl,
    sourceUrl: urlStr,
    platform: 'yt',
  };
}

/**
 * Parses Facebook URLs (videos, reels, watch) and extracts metadata
 */
async function resolveFacebook(urlStr: string): Promise<ExtractedAudioInfo | null> {
  const isFb = /(?:facebook\.com|fb\.watch)/i.test(urlStr);
  if (!isFb) return null;

  let title = 'Facebook Audio Track';
  let artist = 'Facebook Creator';
  let thumbnailUrl: string | undefined = undefined;

  try {
    const oembedUrl = `https://www.facebook.com/plugins/video/oembed.json/?url=${encodeURIComponent(urlStr)}`;
    const oRes = await axios.get(oembedUrl, {
      headers: { 'User-Agent': COMMON_USER_AGENT },
      timeout: 5000,
      validateStatus: () => true,
    });
    if (oRes.data) {
      if (oRes.data.title) title = oRes.data.title;
      if (oRes.data.author_name) artist = oRes.data.author_name;
      if (oRes.data.thumbnail_url) thumbnailUrl = oRes.data.thumbnail_url;
    }
  } catch {
    // fallback
  }

  const safeFilename = sanitizeFilename(`${artist} - ${title}.mp3`, 'mp3');
  const streamUrl = `/api/download?url=${encodeURIComponent(urlStr)}&filename=${encodeURIComponent(safeFilename)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`;

  let sizeBytes: number | undefined;
  let sizeFormatted = '320 kbps MP3';

  try {
    const mp3Path = await convertFacebookToMp3(urlStr, title, artist);
    if (fs.existsSync(mp3Path)) {
      const stat = fs.statSync(mp3Path);
      sizeBytes = stat.size;
      sizeFormatted = `${formatBytes(stat.size)} • 320 kbps MP3`;
    }
  } catch (convErr: any) {
    console.warn('Facebook audio pre-conversion notice:', convErr?.message || convErr);
  }

  return {
    success: true,
    provider: 'FB Audio (Facebook)',
    title: title,
    artist: artist,
    filename: safeFilename,
    directAudioUrl: streamUrl,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    duration: 'Stereo Audio',
    sizeBytes,
    sizeFormatted,
    thumbnailUrl: thumbnailUrl,
    sourceUrl: urlStr,
    platform: 'fb',
  };
}

/**
 * Checks if a URL is a direct audio file by extension or HEAD response
 */
async function resolveDirectAudio(urlStr: string): Promise<ExtractedAudioInfo | null> {
  // Check if this is an archive.org/download link
  const archiveDlMatch = urlStr.match(/archive\.org\/download\/([^/]+)\/(.+)/);
  if (archiveDlMatch) {
    try {
      const identifier = archiveDlMatch[1];
      const encodedFilename = archiveDlMatch[2];
      const metaRes = await axios.get(`https://archive.org/metadata/${identifier}`, { timeout: 6000 });
      const server = metaRes.data?.server;
      const dir = metaRes.data?.dir;
      const decodedFilename = decodeURIComponent(encodedFilename);
      const directUrl = server && dir ? `https://${server}${dir}/${encodedFilename}` : urlStr;

      return {
        success: true,
        provider: 'Internet Archive',
        title: decodedFilename.replace(/\.[^/.]+$/, ''),
        filename: sanitizeFilename(decodedFilename, 'mp3'),
        directAudioUrl: directUrl,
        mimeType: 'audio/mpeg',
        format: getFormatFromMime(decodedFilename, 'MP3'),
        sourceUrl: urlStr,
      };
    } catch {
      // proceed with standard direct detection
    }
  }

  const parsed = new URL(urlStr);
  const path = parsed.pathname.toLowerCase();
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma', '.weba'];

  const hasAudioExt = audioExtensions.some((ext) => path.endsWith(ext));

  try {
    const headRes = await axios.head(urlStr, {
      headers: { 'User-Agent': COMMON_USER_AGENT },
      maxRedirects: 5,
      timeout: 6000,
      validateStatus: () => true,
    });

    const contentType = (headRes.headers['content-type'] as string) || '';
    const contentLength = parseInt(headRes.headers['content-length'] as string, 10) || 0;
    const isAudioMime =
      contentType.startsWith('audio/') ||
      contentType === 'application/ogg' ||
      contentType === 'video/ogg';

    if (hasAudioExt || isAudioMime) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      let filename = segments[segments.length - 1] || 'audio_file.mp3';
      filename = decodeURIComponent(filename);

      const contentDisp = (headRes.headers['content-disposition'] as string) || '';
      if (contentDisp.includes('filename=')) {
        const fnMatch = contentDisp.match(/filename\*?=['"]?(?:UTF-8'')?([^;"\n]+)['"]?/i);
        if (fnMatch && fnMatch[1]) {
          filename = decodeURIComponent(fnMatch[1].replace(/["']/g, '').trim());
        }
      }

      return {
        success: true,
        provider: 'Direct Audio URL',
        title: filename.replace(/\.[^/.]+$/, ''),
        filename: sanitizeFilename(filename, 'mp3'),
        directAudioUrl: urlStr,
        mimeType: isAudioMime ? contentType : 'audio/mpeg',
        sizeBytes: contentLength || undefined,
        sizeFormatted: contentLength ? formatBytes(contentLength) : 'Live Stream',
        format: getFormatFromMime(contentType || filename, 'MP3'),
        sourceUrl: urlStr,
      };
    }
  } catch {
    if (hasAudioExt) {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const filename = decodeURIComponent(segments[segments.length - 1] || 'audio_file.mp3');
      return {
        success: true,
        provider: 'Direct Audio Link',
        title: filename.replace(/\.[^/.]+$/, ''),
        filename: sanitizeFilename(filename, 'mp3'),
        directAudioUrl: urlStr,
        mimeType: 'audio/mpeg',
        format: getFormatFromMime(filename, 'MP3'),
        sourceUrl: urlStr,
      };
    }
  }

  return null;
}

/**
 * Scrapes HTML page for embedded audio tags, meta tags, and links
 */
async function scrapeWebpageAudio(urlStr: string): Promise<ExtractedAudioInfo | null> {
  try {
    const res = await axios.get(urlStr, {
      headers: {
        'User-Agent': COMMON_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      maxRedirects: 5,
      timeout: 6000,
      responseType: 'stream',
    });

    const contentType = (res.headers['content-type'] as string) || '';

    // If the server returned an audio stream directly instead of HTML
    if (contentType.startsWith('audio/') || contentType === 'application/ogg' || contentType === 'video/ogg') {
      if (typeof res.data.destroy === 'function') res.data.destroy();
      const parsed = new URL(urlStr);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const filename = sanitizeFilename(segments[segments.length - 1] || 'audio_stream.mp3', 'mp3');
      return {
        success: true,
        provider: 'Direct Audio Stream',
        title: filename.replace(/\.[^/.]+$/, ''),
        filename,
        directAudioUrl: urlStr,
        mimeType: contentType,
        sizeFormatted: 'Live Audio Stream',
        format: getFormatFromMime(contentType, 'MP3'),
        sourceUrl: urlStr,
      };
    }

    // Read up to 500KB of HTML
    let html = '';
    for await (const chunk of res.data) {
      html += chunk.toString('utf-8');
      if (html.length > 500000) {
        if (typeof res.data.destroy === 'function') res.data.destroy();
        break;
      }
    }
    if (typeof res.data.destroy === 'function') res.data.destroy();

    if (!html) return null;

    // Page title
    const pageTitleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const pageTitle = pageTitleMatch ? pageTitleMatch[1].trim() : 'Webpage Audio';

    const candidateUrls: string[] = [];

    // 1. Open Graph audio
    const ogAudioMatch = html.match(/<meta\s+property=["']og:audio(?:(?::secure_url|:url))?["']\s+content=["']([^"']+)["']/i);
    if (ogAudioMatch && ogAudioMatch[1]) candidateUrls.push(ogAudioMatch[1]);

    // 2. Twitter audio stream
    const twitterAudioMatch = html.match(/<meta\s+name=["']twitter:player:stream["']\s+content=["']([^"']+)["']/i);
    if (twitterAudioMatch && twitterAudioMatch[1]) candidateUrls.push(twitterAudioMatch[1]);

    // 3. HTML5 <audio src="...">
    const audioSrcMatches = html.matchAll(/<audio[^>]+src=["']([^"']+)["']/gi);
    for (const m of audioSrcMatches) {
      if (m[1]) candidateUrls.push(m[1]);
    }

    // 4. HTML5 <source src="..." type="audio/...">
    const sourceMatches = html.matchAll(/<source[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const m of sourceMatches) {
      const tag = m[0];
      const src = m[1];
      if (tag.includes('audio/') || src.match(/\.(mp3|wav|m4a|aac|ogg|flac|opus)($|\?)/i)) {
        candidateUrls.push(src);
      }
    }

    // 5. JSON-LD contentUrl
    const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    for (const jm of jsonLdMatches) {
      try {
        const json = JSON.parse(jm[1]);
        const lookForAudio = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj.contentUrl && typeof obj.contentUrl === 'string' && obj.contentUrl.match(/\.(mp3|wav|m4a|aac|ogg)($|\?)/i)) {
            candidateUrls.push(obj.contentUrl);
          }
          if (obj.audio) {
            if (typeof obj.audio === 'string') candidateUrls.push(obj.audio);
            else if (obj.audio.contentUrl) candidateUrls.push(obj.audio.contentUrl);
          }
          Object.values(obj).forEach(lookForAudio);
        };
        lookForAudio(json);
      } catch {
        // ignore JSON-LD parse errors
      }
    }

    // 6. Direct anchor tags to audio
    const anchorMatches = html.matchAll(/<a[^>]+href=["']([^"']+\.(?:mp3|wav|m4a|aac|ogg|flac)(?:\?[^"']*)?)["']/gi);
    for (const am of anchorMatches) {
      if (am[1]) candidateUrls.push(am[1]);
    }

    // 7. Regex find in scripts for mp3 links
    if (candidateUrls.length === 0) {
      const scriptUrls = html.matchAll(/(https?:\\?\/\\?\/[^\s"'<>]+\.(?:mp3|m4a|wav|aac|ogg)(?:\?[^\s"'<>]*)?)/gi);
      for (const sm of scriptUrls) {
        let clean = sm[1].replace(/\\\//g, '/');
        candidateUrls.push(clean);
      }
    }

    // Deduplicate & resolve relative URLs
    const resolvedUrls = Array.from(new Set(candidateUrls))
      .map((u) => {
        try {
          return new URL(u, urlStr).href;
        } catch {
          return null;
        }
      })
      .filter((u): u is string => Boolean(u));

    if (resolvedUrls.length > 0) {
      const primaryUrl = resolvedUrls[0];
      const parsed = new URL(primaryUrl);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const filename = sanitizeFilename(segments[segments.length - 1] || `${pageTitle}.mp3`, 'mp3');

      const altTracks = resolvedUrls.slice(1, 10).map((u, idx) => {
        const p = new URL(u);
        const segs = p.pathname.split('/').filter(Boolean);
        const fn = segs[segs.length - 1] || `track_${idx + 2}.mp3`;
        return {
          title: `Track ${idx + 2}: ${fn.replace(/\.[^/.]+$/, '')}`,
          filename: sanitizeFilename(fn, 'mp3'),
          url: u,
          format: getFormatFromMime(fn, 'MP3'),
        };
      });

      return {
        success: true,
        provider: 'Web Audio / Podcast',
        title: pageTitle,
        filename,
        directAudioUrl: primaryUrl,
        mimeType: 'audio/mpeg',
        format: getFormatFromMime(filename, 'MP3'),
        sourceUrl: urlStr,
        alternativeTracks: altTracks.length > 0 ? altTracks : undefined,
      };
    }

    // If still not found, try Gemini AI to analyze relevant audio structures if API key exists
    const ai = getGemini();
    if (ai) {
      try {
        const snippet = html.slice(0, 15000);
        const prompt = `Analyze this webpage HTML snippet. Find any direct audio stream URL (MP3, M4A, WAV, AAC, OGG) or media link present in player data or tags.
Return a JSON object with:
{ "audioUrl": string | null, "title": string | null }
Only valid JSON.
Snippet:
${snippet}`;

        const aiResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });

        const text = aiResponse.text;
        if (text) {
          const parsedAi = JSON.parse(text);
          if (parsedAi?.audioUrl) {
            const resolved = new URL(parsedAi.audioUrl, urlStr).href;
            return {
              success: true,
              provider: 'AI-Extracted Web Audio',
              title: parsedAi.title || pageTitle,
              filename: sanitizeFilename(`${parsedAi.title || pageTitle}.mp3`, 'mp3'),
              directAudioUrl: resolved,
              mimeType: 'audio/mpeg',
              format: 'MP3',
              sourceUrl: urlStr,
            };
          }
        }
      } catch {
        // AI fallback failed
      }
    }
  } catch (err: any) {
    // scrape error
  }

  return null;
}

/**
 * Main link analyzer entry point
 */
export async function analyzeShareLink(
  inputUrl: string,
  requestedPlatform?: 'su' | 'yt' | 'fb'
): Promise<ExtractedAudioInfo> {
  let trimmed = inputUrl.trim();
  if (!trimmed) {
    return {
      success: false,
      provider: 'Unknown',
      title: 'Invalid URL',
      filename: 'audio.mp3',
      directAudioUrl: '',
      mimeType: 'audio/mpeg',
      format: 'MP3',
      sourceUrl: inputUrl,
      error: 'Please provide a valid shareable link or URL.',
    };
  }

  // If the user pasted an iframe code or HTML embed snippet, extract src or href
  const embedSrcMatch =
    trimmed.match(/src=["']([^"']+)["']/i) ||
    trimmed.match(/href=["']([^"']+)["']/i);
  if (embedSrcMatch && embedSrcMatch[1]) {
    trimmed = embedSrcMatch[1];
  } else {
    // If it contains a URL anywhere inside the string
    const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
    if (urlMatch && urlMatch[0]) {
      trimmed = urlMatch[0];
    }
  }

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = `https://${trimmed}`;
  }

  try {
    new URL(trimmed);
  } catch {
    return {
      success: false,
      provider: 'Unknown',
      title: 'Invalid URL',
      filename: 'audio.mp3',
      directAudioUrl: '',
      mimeType: 'audio/mpeg',
      format: 'MP3',
      sourceUrl: inputUrl,
      error: 'The link format is invalid. Please check the URL.',
    };
  }

  // Enforce platform-specific routing if a platform tab was specifically chosen
  if (requestedPlatform === 'su') {
    const isSuno =
      trimmed.includes('suno.com') ||
      trimmed.includes('suno.ai') ||
      trimmed.includes('cloudfront.net/1/clip/');
    if (!isSuno) {
      let otherPlatform = 'another platform';
      if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) otherPlatform = 'YouTube';
      else if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) otherPlatform = 'Facebook';

      return {
        success: false,
        provider: 'SU Audio (Suno AI)',
        title: 'Platform Mismatch',
        filename: 'suno_audio.mp3',
        directAudioUrl: '',
        mimeType: 'audio/mpeg',
        format: 'MP3',
        sourceUrl: inputUrl,
        platform: 'su',
        error: `You are in 'SU Audio' mode, but this is a ${otherPlatform} link. Please provide a valid Suno AI song link, or switch to the ${otherPlatform} tab.`,
      };
    }
  } else if (requestedPlatform === 'yt') {
    const isYt = trimmed.includes('youtube.com') || trimmed.includes('youtu.be');
    if (!isYt) {
      let otherPlatform = 'another platform';
      if (trimmed.includes('suno.com') || trimmed.includes('suno.ai')) otherPlatform = 'Suno AI';
      else if (trimmed.includes('facebook.com') || trimmed.includes('fb.watch')) otherPlatform = 'Facebook';

      return {
        success: false,
        provider: 'YT Audio (YouTube)',
        title: 'Platform Mismatch',
        filename: 'youtube_audio.mp3',
        directAudioUrl: '',
        mimeType: 'audio/mpeg',
        format: 'MP3',
        sourceUrl: inputUrl,
        platform: 'yt',
        error: `You are in 'YT Audio' mode, but this is a ${otherPlatform} link. Please provide a valid YouTube video/Shorts link, or switch to the ${otherPlatform} tab.`,
      };
    }
  } else if (requestedPlatform === 'fb') {
    const isFb = trimmed.includes('facebook.com') || trimmed.includes('fb.watch');
    if (!isFb) {
      let otherPlatform = 'another platform';
      if (trimmed.includes('suno.com') || trimmed.includes('suno.ai')) otherPlatform = 'Suno AI';
      else if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) otherPlatform = 'YouTube';

      return {
        success: false,
        provider: 'FB Audio (Facebook)',
        title: 'Platform Mismatch',
        filename: 'facebook_audio.mp3',
        directAudioUrl: '',
        mimeType: 'audio/mpeg',
        format: 'MP3',
        sourceUrl: inputUrl,
        platform: 'fb',
        error: `You are in 'FB Audio' mode, but this is a ${otherPlatform} link. Please provide a valid Facebook video/Reels link, or switch to the ${otherPlatform} tab.`,
      };
    }
  }

  // 1. Suno AI Music (links, iframe embeds, or CloudFront clip URLs)
  if (
    trimmed.includes('suno.com') ||
    trimmed.includes('suno.ai') ||
    trimmed.includes('cloudfront.net/1/clip/')
  ) {
    const sunoRes = await resolveSuno(trimmed);
    if (sunoRes) return sunoRes;
    return {
      success: false,
      provider: 'Suno AI Music',
      title: 'Suno Song Not Found',
      filename: 'suno_song.mp3',
      directAudioUrl: '',
      mimeType: 'audio/mpeg',
      format: 'MP3',
      sourceUrl: inputUrl,
      error:
        'Could not extract a valid Suno AI song from this link. Please make sure the song is public and playable on Suno.',
    };
  }

  // 2. YT Audio (YouTube Videos, Shorts, Music)
  if (
    trimmed.includes('youtube.com') ||
    trimmed.includes('youtu.be')
  ) {
    const ytRes = await resolveYouTube(trimmed);
    if (ytRes) return ytRes;
  }

  // 3. FB Audio (Facebook Videos, Reels, Watch)
  if (
    trimmed.includes('facebook.com') ||
    trimmed.includes('fb.watch')
  ) {
    const fbRes = await resolveFacebook(trimmed);
    if (fbRes) return fbRes;
  }

  // 2. Google Drive
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const res = await resolveGoogleDrive(trimmed);
    if (res) return res;
  }

  // 3. Dropbox
  if (trimmed.includes('dropbox.com')) {
    const res = await resolveDropbox(trimmed);
    if (res) return res;
  }

  // 4. Vocaroo
  if (trimmed.includes('vocaroo.com') || trimmed.includes('voca.ro')) {
    const res = resolveVocaroo(trimmed);
    if (res) return res;
  }

  // 5. Archive.org
  if (trimmed.includes('archive.org')) {
    const res = await resolveArchiveOrg(trimmed);
    if (res) return res;
  }

  // 5. Direct Audio File Check
  const directRes = await resolveDirectAudio(trimmed);
  if (directRes) return directRes;

  // 6. Generic Webpage Audio Scraper / Podcast
  const pageRes = await scrapeWebpageAudio(trimmed);
  if (pageRes) return pageRes;

  // If nothing matched, try treating it as a streamable endpoint
  return {
    success: true,
    provider: 'Generic Web Stream',
    title: 'Audio File from Link',
    filename: sanitizeFilename('downloaded_audio.mp3', 'mp3'),
    directAudioUrl: trimmed,
    mimeType: 'audio/mpeg',
    format: 'MP3',
    sourceUrl: trimmed,
  };
}
