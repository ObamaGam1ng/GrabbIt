<div align="center">
  <img src="src/logo.png" alt="GrabbIt Logo" width="200"/>
  <h1>GrabbIt</h1>
  <p><b>Grabbit, Snip it, Clip it!</b></p>
</div>

## 🚀 Overview

**GrabbIt** is a lightning-fast, premium, portable Windows application designed for seamlessly downloading and clipping videos from across the web. Built with Electron and powered by `yt-dlp` and `ffmpeg`, it handles everything entirely in the background.

Instead of downloading massive, hour-long videos just to extract a 10-second meme, GrabbIt features an **In-App Streaming Player** equipped with custom timeline clipping handles. Simply drag to select the exact milliseconds you want, and GrabbIt will extract and download *only* that specific clip!

✨ *Vibe Coded with Antigravity by Google DeepMind.* ✨

## ⚡ Features

- **Direct In-App Streaming**: Paste a link and preview the video right inside the app using a custom-built video overlay. Automatically bypasses YouTube "playback disabled on other websites" restrictions by injecting native referer headers.
- **Precision Clipping**: Toggle the **"Clip it!"** mode to reveal draggable, dual-handle range sliders on the video timeline. Millisecond-accurate readouts let you grab exactly the frame you want.
- **Smart Downloads**: Using `yt-dlp`'s `--download-sections` integration, GrabbIt tells `ffmpeg` to extract your exact clip directly from the server stream, saving you massive amounts of bandwidth and storage space.
- **Audio & Video Formats**: Choose your exact video quality (from 144p to Best), or toggle the MP3 switch to extract the audio track automatically.
- **Fully Portable**: Packaged as a clean, single `.exe` file. No messy installations. Just open it and start grabbing.

## 🛠️ How It Works

1. Paste a video URL from YouTube, Twitter, TikTok, Vimeo, etc.
2. The app fetches the metadata, stream URL, and thumbnail.
3. **Want the whole thing?** Just select MP4/MP3 and hit Download. 
4. **Want a clip?** Click **Clip it!**, drag the Start (Green) and End (Red) markers on the timeline, and hit Download.
5. The video saves directly to your default `Downloads` folder, dynamically named after the video's title.

## 💻 Tech Stack

- **Frontend**: Vanilla HTML/JS/CSS featuring a sleek, responsive "Glassmorphism" dark theme.
- **Backend**: Electron (Node.js).
- **Engines**: `yt-dlp` (Auto-downloads on first run) and `ffmpeg-static` (bundled into the binary).

## 🚀 Running Locally

Want to mess around with the code? 

1. Clone the repository:
```bash
git clone https://github.com/your-username/grabbit.git
cd grabbit
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm start
```

## 📦 Building the Portable Executable

GrabbIt is configured to build as a portable Windows `.exe`. 

```bash
npm run build
```
*(This triggers `npx electron-builder --win portable`. The final executable will be generated inside the `dist/` directory).*

## 📜 License

MIT License. Feel free to use, modify, and distribute.
Slopped together with love, by Obama Gaming 💕
