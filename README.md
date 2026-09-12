# DADA MUSIC BD - 320 kbps MP3 Audio Downloader

A modern full-stack web application built with React 19, Vite, TypeScript, Tailwind CSS, and Express.

---

## 🚀 How to Run in VS Code:

### 1. Open the Folder
- Extract the zip file (if applicable).
- Open VS Code, click `File` > `Open Folder...`, and select this project folder.

### 2. Install Dependencies
- Open the terminal in VS Code (`Ctrl + ~` or from the menu `Terminal` > `New Terminal`).
- Run the following command:
```bash
npm install
```

### 3. Run the App
- In the terminal, run:
```bash
npm run dev
```

### 4. Open in Browser
- Open your browser and navigate to:
```
http://localhost:3000
```

---

## 🛠️ Production Build:
```bash
npm run build
npm start
```

## 📁 Project Structure:
- `/src/App.tsx` - Main frontend layout and state management
- `/src/components/` - Navbar, Logo, LinkInputForm, AudioResultCard
- `/server.ts` - Backend Express API and audio streaming server
- `/server/audioExtractor.ts` - Platform link resolution and extraction engine
- `/server/mediaConverter.ts` - High-quality 320 kbps MP3 conversion engine (yt-dlp & FFmpeg)
- `/server/sunoDecryptor.ts` - Suno AI stream decryption & MP3 transcoding
- `/vite.config.ts` - Vite configuration
