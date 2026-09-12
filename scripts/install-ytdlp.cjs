const fs = require('fs');
const path = require('path');
const https = require('https');

const isWin = process.platform === 'win32';
const filename = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const binDir = path.resolve(__dirname, '..', 'bin');
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}
const targetPath = path.join(binDir, filename);

if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 100000) {
  console.log(`yt-dlp already exists at ${targetPath}`);
  if (!isWin) {
    try { fs.chmodSync(targetPath, 0o755); } catch {}
  }
  process.exit(0);
}

const url = isWin
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

console.log(`Downloading ${filename} from ${url}...`);

function download(downloadUrl, dest, cb) {
  https.get(downloadUrl, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      return download(res.headers.location, dest, cb);
    }
    if (res.statusCode !== 200) {
      return cb(new Error(`Failed with status ${res.statusCode}`));
    }
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        if (!isWin) {
          try { fs.chmodSync(dest, 0o755); } catch {}
        }
        cb(null);
      });
    });
  }).on('error', cb);
}

download(url, targetPath, (err) => {
  if (err) {
    console.error('Error downloading yt-dlp:', err.message);
    process.exit(0);
  }
  console.log(`yt-dlp successfully downloaded to ${targetPath}`);
});
