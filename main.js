const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');

let mainWindow;
let ytDlpPath;
let ffmpegPath;
let currentDownloadProc = null;

/* ── Binary paths ─────────────────────────────────────── */

function getYtDlpPath() {
  return path.join(app.getPath('userData'), 'yt-dlp.exe');
}

function getFfmpegPath() {
  try {
    let p = require('ffmpeg-static');
    if (app.isPackaged) {
      p = p.replace('app.asar', 'app.asar.unpacked');
    }
    return p;
  } catch { return null; }
}

/** Download a file via HTTPS, following redirects */
function httpsDownload(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'GrabbIt' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    };
    get(url);
  });
}

async function ensureYtDlp() {
  ytDlpPath = getYtDlpPath();
  ffmpegPath = getFfmpegPath();

  if (!fs.existsSync(ytDlpPath)) {
    mainWindow?.webContents.send('setup-status', 'Downloading video engine… (first launch only)');
    try {
      const releaseUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
      await httpsDownload(releaseUrl, ytDlpPath);
    } catch (err) {
      mainWindow?.webContents.send('setup-status', 'Engine download failed – check your internet connection.');
      return;
    }
  }
  mainWindow?.webContents.send('setup-status', 'ready');
}

/* ── Window ───────────────────────────────────────────── */

function createWindow() {
  /* Splash — appears instantly (no external resources) */
  const splash = new BrowserWindow({
    width: 320,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    center: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true },
  });
  splash.loadFile(path.join(__dirname, 'src', 'splash.html'));

  /* Main window — loads in background while splash is visible */
  mainWindow = new BrowserWindow({
    width: 860,
    height: 760,
    minWidth: 660,
    minHeight: 560,
    frame: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0a0a12',
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  /* When main window is ready, swap splash → main */
  mainWindow.once('ready-to-show', () => {
    splash.destroy();
    mainWindow.show();
    setImmediate(() => ensureYtDlp());
  });
}

/* ── IPC: Fetch metadata ─────────────────────────────── */

ipcMain.handle('fetch-metadata', async (_event, url) => {
  return new Promise((resolve, reject) => {
    const isPlaylist = url.includes('list=') || url.includes('/playlist');
    const args = ['--dump-single-json', '--no-warnings'];
    if (isPlaylist) args.push('--yes-playlist', '--flat-playlist');
    else args.push('--no-playlist');
    args.push(url);

    let stdout = '';
    let stderr = '';
    const proc = spawn(ytDlpPath, args);

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(stderr || 'Failed to fetch video info'));
      try {
        const info = JSON.parse(stdout);

        if (info._type === 'playlist' || info._type === 'multi_video') {
          return resolve({
            isPlaylist: true,
            title: info.title || 'Playlist',
            uploader: info.uploader || info.channel || '',
            thumbnail: info.thumbnails?.[0]?.url || '',
            videoCount: info.entries ? info.entries.length : 0,
            qualities: []
          });
        }

        /* Build quality list */
        const seen = new Set();
        const qualities = [];
        for (const f of (info.formats || [])) {
          if (f.height && f.vcodec && f.vcodec !== 'none' && !seen.has(f.height)) {
            seen.add(f.height);
            qualities.push({ height: f.height, label: `${f.height}p` });
          }
        }
        qualities.sort((a, b) => b.height - a.height);

        resolve({
          isPlaylist: false,
          title: info.title || 'Untitled',
          thumbnail: info.thumbnail || '',
          duration: info.duration || 0,
          uploader: info.uploader || info.channel || '',
          qualities,
        });
      } catch { reject(new Error('Could not parse video info')); }
    });
  });
});

/* ── IPC: Download ────────────────────────────────────── */

ipcMain.handle('download-video', async (_event, opts) => {
  const { url, format, quality, title } = opts;
  const dir = app.getPath('downloads');

  /* Sanitise title for filesystem */
  const safe = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().substring(0, 200);
  const ext = format === 'mp3' ? 'mp3' : 'mp4';
  
  let out = path.join(dir, `${safe}.${ext}`);
  let n = 1;
  while (!opts.isPlaylist && fs.existsSync(out)) { out = path.join(dir, `${safe} (${n++}).${ext}`); }
  
  if (opts.isPlaylist) {
    out = path.join(dir, safe, `%(title)s.%(ext)s`);
  }

  /* Build args */
  const args = [];
  if (format === 'mp3') {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    const fsel = quality && quality !== 'best'
      ? `bestvideo[ext=mp4][height<=${quality}]+bestaudio[ext=m4a]/best[ext=mp4][height<=${quality}]/best`
      : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
    args.push('-f', fsel, '--merge-output-format', 'mp4');
  }
  if (ffmpegPath) args.push('--ffmpeg-location', ffmpegPath);
  
  if (opts.clipStart !== undefined && opts.clipEnd !== undefined) {
    args.push('--download-sections', `*${opts.clipStart}-${opts.clipEnd}`, '--force-keyframes-at-cuts');
  }
  
  if (opts.isPlaylist) {
    args.push('-o', out, '--newline', '--no-warnings', '--yes-playlist', url);
  } else {
    args.push('-o', out, '--newline', '--no-warnings', '--no-playlist', url);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(ytDlpPath, args);
    currentDownloadProc = proc;

    let currentVideo = 0;
    let totalVideos = opts.videoCount || 0;

    proc.stdout.on('data', data => {
      const str = data.toString();
      const idxMatch = str.match(/\[download\] Downloading (?:video|item) (\d+) of (\d+)/i);
      if (idxMatch) {
        currentVideo = parseInt(idxMatch[1], 10);
        totalVideos = parseInt(idxMatch[2], 10);
      }
      const m = str.match(/\[download\]\s+([\d.]+)%/);
      if (m) {
        let text = null;
        if (opts.isPlaylist) {
          text = `Video ${currentVideo} of ${totalVideos} (${Math.round(parseFloat(m[1]))}%)`;
        }
        mainWindow?.webContents.send('download-progress', { percent: parseFloat(m[1]), text });
      }
    });
    proc.stderr.on('data', d => {
      const text = d.toString();
      if (opts.clipStart !== undefined && opts.clipEnd !== undefined) {
        // Parse ffmpeg time=00:00:05.12 output
        const timeMatch = text.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1], 10);
          const m = parseInt(timeMatch[2], 10);
          const s = parseFloat(timeMatch[3]);
          const curSecs = h * 3600 + m * 60 + s;
          const totalSecs = opts.clipEnd - opts.clipStart;
          if (totalSecs > 0) {
            const pct = Math.min((curSecs / totalSecs) * 100, 100);
            mainWindow?.webContents.send('download-progress', { percent: pct });
          }
        }
      }
    });
    proc.on('error', err => {
      if (currentDownloadProc === proc) currentDownloadProc = null;
      reject(err);
    });
    proc.on('close', code => {
      if (currentDownloadProc === proc) currentDownloadProc = null;
      if (code === 0) resolve({ success: true, filePath: out, filename: path.basename(out) });
      else reject(new Error('Download failed or cancelled.'));
    });
  });
});

ipcMain.on('cancel-download', () => {
  if (currentDownloadProc) {
    if (process.platform === 'win32') {
      exec(`taskkill /pid ${currentDownloadProc.pid} /T /F`);
    } else {
      currentDownloadProc.kill('SIGKILL');
    }
    currentDownloadProc = null;
  }
});

/* ── IPC: Get direct stream URL for preview ───────────── */

ipcMain.handle('get-stream-url', async (_event, url) => {
  return new Promise((resolve, reject) => {
    // Pick a combined stream (video+audio) for preview playback
    const args = [
      '-f', 'best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]/best',
      '-g', '--no-warnings', '--no-playlist', url
    ];
    let stdout = '';
    let stderr = '';
    const proc = spawn(ytDlpPath, args);
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => reject(err));
    proc.on('close', code => {
      if (code === 0) {
        const urls = stdout.trim().split('\n').filter(Boolean);
        resolve(urls[0]);
      } else reject(new Error(stderr || 'Could not load video preview'));
    });
  });
});

/* ── IPC: Utilities ───────────────────────────────────── */

ipcMain.handle('show-in-folder', (_e, p) => shell.showItemInFolder(p));
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize();
});
ipcMain.on('win-close', () => mainWindow?.close());

/* ── App lifecycle ────────────────────────────────────── */

app.whenReady().then(() => {
  app.setAppUserModelId("com.grabit.app");
  /* Inject Referer header so YouTube CDN serves the direct stream */
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*.googlevideo.com/*'] },
    (details, callback) => {
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
      details.requestHeaders['Origin'] = 'https://www.youtube.com';
      callback({ requestHeaders: details.requestHeaders });
    }
  );
  createWindow();
});
app.on('window-all-closed', () => app.quit());
