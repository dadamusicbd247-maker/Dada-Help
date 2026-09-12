import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { createServer as createViteServer } from 'vite';
import { analyzeShareLink, sanitizeFilename } from './server/audioExtractor';
import { getOrConvertSunoMp3, transcodeStreamToMp3 } from './server/sunoDecryptor';
import { convertFacebookToMp3, convertYouTubeToMp3 } from './server/mediaConverter';

const COMMON_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getPublicDir(): string {
  return path.join(process.cwd(), 'public');
}

function getDistDir(): string {
  const candidate = path.join(__dirname, 'dist');
  if (fs.existsSync(candidate)) return candidate;
  return path.join(process.cwd(), 'dist');
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve static public assets
  app.use(express.static(getPublicDir()));

  // API Routes FIRST
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Check custom watermark status
  app.get('/api/watermark-status', (_req: Request, res: Response) => {
    const wmPath = path.join(getPublicDir(), 'watermark.jpg');
    if (fs.existsSync(wmPath)) {
      const stats = fs.statSync(wmPath);
      return res.json({ exists: true, url: `/watermark.jpg?v=${stats.mtimeMs}` });
    }
    res.json({ exists: false, url: null });
  });

  // Upload custom watermark photo
  app.post('/api/upload-watermark', (req: Request, res: Response) => {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'Missing imageBase64 parameter.' });
    }
    try {
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const targetPath = path.join(process.cwd(), 'public', 'watermark.jpg');
      fs.writeFileSync(targetPath, buffer);
      
      // Also sync to dist if dist exists
      const distTarget = path.join(process.cwd(), 'dist', 'watermark.jpg');
      if (fs.existsSync(path.dirname(distTarget))) {
        try { fs.writeFileSync(distTarget, buffer); } catch {}
      }

      return res.json({ success: true, url: `/watermark.jpg?v=${Date.now()}` });
    } catch (err: any) {
      console.error('Error saving watermark photo:', err);
      return res.status(500).json({ error: 'Failed to save watermark: ' + err.message });
    }
  });

  // Check custom background status (legacy redirect to watermark)
  app.get('/api/bg-status', (_req: Request, res: Response) => {
    const targetPath = path.join(process.cwd(), 'public', 'watermark.jpg');
    const exists = fs.existsSync(targetPath);
    const url = exists ? '/watermark.jpg?v=2' : null;
    res.json({ exists, url });
  });

  // Remove watermark photo
  app.delete('/api/watermark', (_req: Request, res: Response) => {
    try {
      const p1 = path.join(process.cwd(), 'public', 'watermark.jpg');
      const p2 = path.join(process.cwd(), 'dist', 'watermark.jpg');
      if (fs.existsSync(p1)) fs.unlinkSync(p1);
      if (fs.existsSync(p2)) fs.unlinkSync(p2);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Direct ZIP download endpoint (private / not shown on UI)
  app.get('/api/download-source-zip', (_req: Request, res: Response) => {
    const zipPath = path.join(process.cwd(), 'public', 'dada-music-bd-source.zip');
    if (fs.existsSync(zipPath)) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="dada-music-bd-source.zip"');
      return res.sendFile(zipPath);
    }
    return res.status(404).json({ error: 'Source zip not found' });
  });

  // Analyze any shareable link
  app.post('/api/analyze', async (req: Request, res: Response) => {
    const { url, platform } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid URL string in the request body.',
      });
    }

    try {
      const validPlatform = platform === 'su' || platform === 'yt' || platform === 'fb' ? platform : undefined;
      const result = await analyzeShareLink(url, validPlatform);
      return res.json(result);
    } catch (err: any) {
      console.error('Error analyzing link:', err?.message || err);
      return res.status(500).json({
        success: false,
        error: 'Failed to analyze share link: ' + (err?.message || 'Unknown error'),
      });
    }
  });

  // Curated sample share links for fast testing
  app.get('/api/sample-links', (_req: Request, res: Response) => {
    res.json([
      {
        provider: 'Cloud Storage',
        title: 'Public Voice Note / Speech',
        url: 'https://drive.google.com/file/d/1wZfF8aPZgWd_7GgQ5c1B8lQ8e9F0bA1c/view?usp=sharing',
        description: 'Shareable audio file link with preview & download',
      },
      {
        provider: 'Internet Archive',
        title: 'Beethoven Symphony No. 5 (Free/Public Domain)',
        url: 'https://archive.org/details/beethoven-symphony-no-5',
        description: 'Multi-track classical audio collection from Archive.org',
      },
      {
        provider: 'Dropbox',
        title: 'Shared Studio Acoustic Demo',
        url: 'https://www.dropbox.com/s/sample12345/acoustic_guitar_solo.mp3?dl=0',
        description: 'Dropbox share link automatically converted to direct audio download',
      },
      {
        provider: 'Direct Audio Stream',
        title: 'BBC World Service News Podcast Stream',
        url: 'https://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
        description: 'Direct audio live stream URL',
      },
      {
        provider: 'Vocaroo Audio Note',
        title: 'Quick Voice Memo (Vocaroo)',
        url: 'https://vocaroo.com/1mXkLz5bO4wA',
        description: 'Online shared voice message link',
      },
    ]);
  });

  // Direct MP3 download endpoint - guarantees authentic, 100% playable MP3 audio
  app.get('/api/download', async (req: Request, res: Response) => {
    let fileUrl = (req.query.url as string) || '';
    let filename = (req.query.filename as string) || 'downloaded_audio.mp3';
    let sunoClipId = req.query.sunoId as string | undefined;

    // Detect Suno clip ID from URL or query
    if (!sunoClipId && fileUrl) {
      const uuidMatch = fileUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch && (fileUrl.includes('suno') || fileUrl.includes('cloudfront.net') || fileUrl.includes('clip'))) {
        sunoClipId = uuidMatch[0].toLowerCase();
      }
    }

    // Always enforce .mp3 extension
    filename = filename.replace(/\.[a-zA-Z0-9]+$/, '') + '.mp3';
    filename = sanitizeFilename(filename, 'mp3');
    const safeAscii = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    // Handle Suno AI Clip Decryption and 320kbps MP3 Delivery
    if (sunoClipId) {
      try {
        const title = (req.query.title as string) || filename.replace(/\.mp3$/i, '');
        const artist = (req.query.artist as string) || 'Suno';
        const mp3Path = await getOrConvertSunoMp3(sunoClipId, title, artist);
        const stat = fs.statSync(mp3Path);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (req.method === 'HEAD') {
          return res.end();
        }

        const readStream = fs.createReadStream(mp3Path);
        readStream.pipe(res);
        return;
      } catch (sunoErr: any) {
        console.error('Error decrypting & transcoding Suno track:', sunoErr?.message || sunoErr);
        if (!res.headersSent) {
          return res.status(502).json({
            error: 'Failed to generate MP3 for Suno track: ' + (sunoErr?.message || 'Unknown error'),
          });
        }
        return;
      }
    }

    if (!fileUrl) {
      return res.status(400).send('Missing "url" or "sunoId" query parameter.');
    }

    // Handle Facebook Links (Videos, Reels, Watch) -> High quality 320kbps MP3
    if (/(?:facebook\.com|fb\.watch)/i.test(fileUrl)) {
      try {
        const title = (req.query.title as string) || filename.replace(/\.mp3$/i, '');
        const artist = (req.query.artist as string) || 'Facebook';
        const mp3Path = await convertFacebookToMp3(fileUrl, title, artist);
        const stat = fs.statSync(mp3Path);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (req.method === 'HEAD') {
          return res.end();
        }

        const readStream = fs.createReadStream(mp3Path);
        readStream.pipe(res);
        return;
      } catch (fbErr: any) {
        console.error('Error extracting Facebook audio:', fbErr?.message || fbErr);
        if (!res.headersSent) {
          return res.status(502).json({
            error: 'Failed to extract Facebook audio: ' + (fbErr?.message || 'The post may be private or restricted.'),
          });
        }
        return;
      }
    }

    // Handle YouTube Links -> High quality 320kbps MP3 direct conversion
    if (/(?:youtube\.com|youtu\.be)/i.test(fileUrl)) {
      try {
        const title = (req.query.title as string) || filename.replace(/\.mp3$/i, '');
        const artist = (req.query.artist as string) || 'YouTube';
        const mp3Path = await convertYouTubeToMp3(fileUrl, title, artist);
        const stat = fs.statSync(mp3Path);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=86400');

        if (req.method === 'HEAD') {
          return res.end();
        }

        const readStream = fs.createReadStream(mp3Path);
        readStream.pipe(res);
        return;
      } catch (ytErr: any) {
        console.error('Error converting YouTube audio:', ytErr?.message || ytErr);
        if (!res.headersSent) {
          return res.status(502).json({
            error: 'Failed to extract YouTube audio: ' + (ytErr?.message || 'Video might be private or restricted.'),
          });
        }
        return;
      }
    }

    try {
      const response = await axios.get(fileUrl, {
        headers: {
          'User-Agent': COMMON_USER_AGENT,
          Accept: '*/*',
        },
        beforeRedirect: (options: any) => {
          if (options.headers) {
            options.headers['User-Agent'] = COMMON_USER_AGENT;
            options.headers['user-agent'] = COMMON_USER_AGENT;
          }
        },
        responseType: 'stream',
        maxRedirects: 10,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      const isAlreadyMp3 =
        contentType.includes('audio/mpeg') ||
        contentType.includes('audio/mp3') ||
        fileUrl.toLowerCase().includes('.mp3');

      if (req.method === 'HEAD') {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
        return res.end();
      }

      if (isAlreadyMp3) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
        );
        res.setHeader('Cache-Control', 'no-cache');
        const contentLength = response.headers['content-length'];
        if (contentLength && (typeof contentLength === 'string' || typeof contentLength === 'number')) {
          res.setHeader('Content-Length', contentLength);
        }
        response.data.on('error', (err: any) => {
          console.warn('Stream data error:', err?.message);
          if (!res.headersSent) res.status(502).end();
        });
        response.data.pipe(res);
      } else {
        // Transcode non-MP3 stream to 320kbps MP3 on the fly
        const { mp3Stream, kill } = transcodeStreamToMp3(response.data);
        
        let sentHeaders = false;
        mp3Stream.on('data', (chunk: Buffer) => {
          if (!sentHeaders) {
            sentHeaders = true;
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader(
              'Content-Disposition',
              `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
            );
            res.setHeader('Cache-Control', 'no-cache');
          }
          res.write(chunk);
        });

        mp3Stream.on('end', () => {
          if (!sentHeaders) {
            if (!res.headersSent) {
              res.status(422).json({
                error: 'The audio stream produced 0 bytes. The source file might be corrupted or empty.',
              });
            }
          } else {
            res.end();
          }
        });

        mp3Stream.on('error', (err: any) => {
          console.warn('MP3 Transcode error:', err?.message);
          kill();
          if (!res.headersSent) {
            res.status(502).json({
              error: 'Failed to convert audio stream: ' + (err?.message || 'Transcoder error'),
            });
          } else {
            res.end();
          }
        });

        req.on('close', () => {
          kill();
          if (response.data && typeof response.data.destroy === 'function') {
            response.data.destroy();
          }
        });
      }
    } catch (err: any) {
      console.error('Download stream error:', err?.message || err);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Failed to retrieve audio from source link. It may be private or restricted.',
          details: err?.message,
        });
      }
    }
  });

  // Audio streaming preview endpoint with Range support for HTML5 <audio>
  app.get('/api/stream', async (req: Request, res: Response) => {
    let fileUrl = (req.query.url as string) || '';
    let sunoId = req.query.sunoId as string | undefined;

    if (!sunoId && fileUrl.includes('sunoId=')) {
      try {
        const u = new URL(fileUrl, 'http://localhost');
        sunoId = u.searchParams.get('sunoId') || undefined;
      } catch {}
    }

    // Direct streaming for Suno clips with range support
    if (sunoId) {
      try {
        const mp3Path = await getOrConvertSunoMp3(sunoId, 'Preview', 'Suno');
        const stat = fs.statSync(mp3Path);
        const range = req.headers.range;
        if (range) {
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
          const chunksize = end - start + 1;
          const file = fs.createReadStream(mp3Path, { start, end });
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'audio/mpeg',
          });
          return file.pipe(res);
        } else {
          res.writeHead(200, {
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes',
            'Content-Type': 'audio/mpeg',
          });
          return fs.createReadStream(mp3Path).pipe(res);
        }
      } catch (err: any) {
        console.error('Stream Suno clip error:', err?.message || err);
      }
    }

    if (!fileUrl) {
      return res.status(400).send('Missing "url" or "sunoId" query parameter.');
    }

    const rangeHeader = req.headers.range;

    try {
      const headers: Record<string, string> = {
        'User-Agent': COMMON_USER_AGENT,
      };
      if (rangeHeader) {
        headers.Range = rangeHeader;
      }

      const response = await axios.get(fileUrl, {
        headers,
        beforeRedirect: (options: any) => {
          if (options.headers) {
            options.headers['User-Agent'] = COMMON_USER_AGENT;
            options.headers['user-agent'] = COMMON_USER_AGENT;
          }
        },
        responseType: 'stream',
        maxRedirects: 10,
        validateStatus: (status) => (status >= 200 && status < 400) || status === 206,
      });

      res.status(response.status);

      const passHeaders = [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'cache-control',
      ];

      for (const h of passHeaders) {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h] as string);
        }
      }

      if (!response.headers['content-type'] || !String(response.headers['content-type']).includes('audio')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      }

      res.setHeader('Accept-Ranges', 'bytes');

      if (req.method === 'HEAD') {
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
        return res.end();
      }

      response.data.on('error', (err: any) => {
        console.warn('Stream data error:', err?.message);
        if (!res.headersSent) res.status(502).end();
      });

      response.data.pipe(res);

      req.on('close', () => {
        if (response.data && typeof response.data.destroy === 'function') {
          response.data.destroy();
        }
      });
    } catch (err: any) {
      console.error('Stream proxy error:', err?.message || err);
      if (!res.headersSent) {
        res.status(502).send('Unable to stream audio.');
      }
    }
  });

  // Vite middleware for dev or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = getDistDir();
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Audio Downloader Server running on http://localhost:${PORT}`);
  });
}

startServer();
