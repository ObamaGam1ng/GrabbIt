/* ================================================================
   GrabIt – Renderer Logic
   ================================================================ */

const $ = (s) => document.querySelector(s);

/* ── DOM refs ─────────────────────────────────────────── */
const urlInput     = $('#urlInput');
const fetchBtn     = $('#fetchBtn');
const fetchLabel   = $('.btn-fetch-label');
const fetchSpin    = $('.btn-fetch-spin');
const errorMsg     = $('#errorMsg');
const setupBanner  = $('#setupBanner');
const setupText    = $('#setupText');

const card         = $('#previewCard');
const thumb        = $('#thumb');
const vidPlayer    = $('#vidPlayer');
const vidControls  = $('#vidControls');
const vcPlayBtn    = $('#vcPlayBtn');
const vcPlayIcon   = $('#vcPlayIcon');
const vcPauseIcon  = $('#vcPauseIcon');
const vcTrack      = $('#vcTrack');
const vcProgress   = $('#vcProgress');
const vcTime       = $('#vcTime');
const vcThumbTooltip = $('#vcThumbTooltip');

const btnClip      = $('#btnClip');
const clipRange    = $('#clipRange');
const clipHl       = $('#clipHl');
const clipStartHandle = $('#clipStartHandle');
const clipEndHandle   = $('#clipEndHandle');
const clipStartTooltip = $('#clipStartTooltip');
const clipEndTooltip   = $('#clipEndTooltip');

const playBtn      = $('#playBtn');
const playLoading  = $('#playLoading');
const badgeDur     = $('#badgeDur');
const vidTitle     = $('#vidTitle');
const vidUploader  = $('#vidUploader');

const fmtSwitch    = $('#fmtSwitch');
const fmtMp4       = $('#fmtMp4');
const fmtMp3       = $('#fmtMp3');
const qualityWrap  = $('#qualityWrap');
const qualitySelect= $('#qualitySelect');

const dlBtn        = $('#dlBtn');
const dlLabel      = $('#dlLabel');
const progressWrap = $('#progressWrap');
const progressFill = $('#progressFill');
const progressPct  = $('#progressPct');
const doneRow      = $('#doneRow');
const doneText     = $('#doneText');
const folderBtn    = $('#folderBtn');

/* ── State ────────────────────────────────────────────── */
let meta = null;          // current video metadata
let downloading = false;
let lastFilePath = '';
let engineReady = false;

/* Clipping state */
let clipping = false;
let clipStart = 0; // percentage 0-100
let clipEnd = 100; // percentage 0-100
let isDraggingHandle = null;
let isDraggingTrack = false;

/* ── Setup status ─────────────────────────────────────── */
api.onSetupStatus((status) => {
  if (status === 'ready') {
    engineReady = true;
    setupBanner.classList.remove('visible');
  } else {
    setupBanner.classList.add('visible');
    setupText.textContent = status;
  }
});

/* ── Title bar buttons ────────────────────────────────── */
$('#btnMin').addEventListener('click', () => api.winMinimize());
$('#btnMax').addEventListener('click', () => api.winMaximize());
$('#btnClose').addEventListener('click', () => api.winClose());

/* ── Helpers ──────────────────────────────────────────── */
function fmtDuration(sec) {
  if (!sec) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function fmtDurationMs(sec) {
  if (!sec) return '0:00.000';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  let res = `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  if (h > 0) res = `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  return res;
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.opacity = '1';
  setTimeout(() => { errorMsg.style.opacity = '0'; }, 5000);
}

function setFetching(on) {
  fetchBtn.disabled = on;
  fetchLabel.style.display = on ? 'none' : '';
  fetchSpin.style.display = on ? 'block' : 'none';
}

function resetDownloadUI() {
  progressWrap.classList.remove('visible');
  progressFill.style.width = '0%';
  progressPct.textContent = '0%';
  doneRow.classList.remove('visible');
  dlBtn.disabled = false;
}

function currentFormat() {
  return fmtSwitch.checked ? 'mp3' : 'mp4';
}

function updateFormatUI() {
  const fmt = currentFormat();
  fmtMp4.classList.toggle('active', fmt === 'mp4');
  fmtMp3.classList.toggle('active', fmt === 'mp3');
  dlLabel.textContent = `Download ${fmt.toUpperCase()}`;

  /* Hide quality selector for mp3 */
  qualityWrap.style.display = fmt === 'mp3' ? 'none' : '';
}

/* ── Populate quality dropdown ────────────────────────── */
function populateQualities(qualities) {
  qualitySelect.innerHTML = '';
  const best = document.createElement('option');
  best.value = 'best';
  best.textContent = 'Best Quality';
  qualitySelect.appendChild(best);

  for (const q of qualities) {
    const opt = document.createElement('option');
    opt.value = q.height;
    opt.textContent = q.label;
    qualitySelect.appendChild(opt);
  }
}

/* ── Fetch metadata ───────────────────────────────────── */
async function fetchMeta() {
  const url = urlInput.value.trim();
  if (!url) { showError('Paste a video URL first.'); return; }

  resetDownloadUI();
  card.classList.remove('visible');
  setFetching(true);
  errorMsg.style.opacity = '0';

  try {
    meta = await api.fetchMetadata(url);

    /* Populate card */
    thumb.style.display = 'block';
    vidPlayer.style.display = 'none';
    vidControls.style.display = 'none';
    playBtn.style.display = 'grid';
    playLoading.style.display = 'none';
    vidPlayer.src = '';
    
    // Reset clipping
    clipping = false;
    clipStart = 0;
    clipEnd = 100;
    btnClip.classList.remove('active');
    clipRange.style.display = 'none';
    updateClipUI();
    
    thumb.src = meta.thumbnail;
    vidTitle.textContent = meta.title;
    vidUploader.textContent = meta.uploader;
    
    if (meta.isPlaylist) {
      badgeDur.textContent = `Playlist: ${meta.videoCount} videos`;
      playBtn.style.display = 'none';
      btnClip.style.display = 'none';
    } else {
      badgeDur.textContent = fmtDuration(meta.duration);
      playBtn.style.display = 'grid';
      btnClip.style.display = 'flex';
    }

    populateQualities(meta.qualities);
    updateFormatUI();

    card.classList.add('visible');
    
    // Hide logo/hero when loaded
    const hero = document.getElementById('heroSection');
    if (hero) hero.style.display = 'none';
  } catch (err) {
    showError(err.message || 'Could not fetch video info. Check the URL.');
  } finally {
    setFetching(false);
  }
}

fetchBtn.addEventListener('click', fetchMeta);
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchMeta();
});

/* auto-fetch on paste */
urlInput.addEventListener('paste', () => {
  setTimeout(fetchMeta, 80);
});

/* ── Format toggle ────────────────────────────────────── */
fmtSwitch.addEventListener('change', () => {
  updateFormatUI();
  resetDownloadUI();
});

/* ── Download ─────────────────────────────────────────── */
async function startDownload() {
  if (!meta || downloading) return;
  downloading = true;
  dlBtn.disabled = true;
  doneRow.classList.remove('visible');
  progressWrap.classList.add('visible');
  progressFill.style.width = '0%';
  progressPct.textContent = '0%';

  const fmt = currentFormat();
  const quality = fmt === 'mp3' ? 'best' : qualitySelect.value;

  try {
    const opts = {
      url: urlInput.value.trim(),
      format: fmt,
      quality,
      title: meta.title,
      isPlaylist: meta.isPlaylist,
      videoCount: meta.videoCount
    };
    if (clipping && !meta.isPlaylist && meta.duration > 0) {
      opts.clipStart = Math.floor((clipStart / 100) * meta.duration);
      opts.clipEnd = Math.floor((clipEnd / 100) * meta.duration);
    }
    const result = await api.downloadVideo(opts);

    /* Done */
    progressFill.style.width = '100%';
    progressPct.textContent = '100%';
    lastFilePath = result.filePath;
    doneText.textContent = result.filename;
    setTimeout(() => {
      progressWrap.classList.remove('visible');
      doneRow.classList.add('visible');
    }, 400);
  } catch (err) {
    if (err.message && err.message.includes('cancelled')) {
      progressWrap.classList.remove('visible');
    } else {
      showError(err.message || 'Download failed.');
      progressWrap.classList.remove('visible');
    }
  } finally {
    downloading = false;
    dlBtn.disabled = false;
  }
}
dlBtn.addEventListener('click', startDownload);

const btnCancel = document.getElementById('btnCancel');
btnCancel.addEventListener('click', () => {
  if (downloading) {
    api.cancelDownload();
  }
});

/* ── Progress events ──────────────────────────────────── */
api.onProgress(({ percent, text }) => {
  const p = Math.min(percent, 100);
  progressFill.style.width = p + '%';
  progressPct.textContent = text || (Math.round(p) + '%');
});

/* ── Show in folder ───────────────────────────────────── */
folderBtn.addEventListener('click', () => {
  if (lastFilePath) api.showInFolder(lastFilePath);
});

/* ── Video Player & Custom Controls ───────────────────── */
async function playVideo() {
  const url = urlInput.value.trim();
  if (!url) return;
  
  playBtn.style.display = 'none';
  playLoading.style.display = 'grid';
  
  try {
    const streamUrl = await api.getStreamUrl(url);
    thumb.style.display = 'none';
    playLoading.style.display = 'none';
    vidPlayer.style.display = 'block';
    vidControls.style.display = 'flex';
    vidPlayer.src = streamUrl;
    vidPlayer.play();
  } catch (err) {
    playBtn.style.display = 'grid';
    playLoading.style.display = 'none';
    showError(err.message || 'Could not load video preview.');
  }
}
playBtn.addEventListener('click', playVideo);

vcPlayBtn.addEventListener('click', () => {
  if (vidPlayer.paused) {
    // If we're past clipping end time, start from the beginning of the clip
    if (clipping && meta.duration) {
      const startSec = (clipStart / 100) * meta.duration;
      const endSec = (clipEnd / 100) * meta.duration;
      if (vidPlayer.currentTime >= endSec - 0.5) {
        vidPlayer.currentTime = startSec;
      }
    }
    vidPlayer.play();
  } else {
    vidPlayer.pause();
  }
});

vidPlayer.addEventListener('play', () => {
  vcPlayIcon.style.display = 'none';
  vcPauseIcon.style.display = 'block';
});
vidPlayer.addEventListener('pause', () => {
  vcPlayIcon.style.display = 'block';
  vcPauseIcon.style.display = 'none';
});

vidPlayer.addEventListener('timeupdate', () => {
  const cur = vidPlayer.currentTime;
  const dur = vidPlayer.duration || meta?.duration || 0;
  if (!dur) return;

  const pct = (cur / dur) * 100;
  vcProgress.style.width = pct + '%';
  vcTime.textContent = `${fmtDuration(cur)} / ${fmtDuration(dur)}`;
  if (!isDraggingTrack) {
    vcThumbTooltip.textContent = fmtDurationMs(cur);
  }

  // Enforce clipping bounds
  if (clipping) {
    const endSec = (clipEnd / 100) * dur;
    if (cur >= endSec) {
      vidPlayer.pause();
      vidPlayer.currentTime = endSec;
    }
  }
});

vcTrack.addEventListener('mousedown', (e) => {
  if (isDraggingHandle || e.target.classList.contains('clip-handle')) return;
  isDraggingTrack = true;
  updateTrackDrag(e);
});

function updateTrackDrag(e) {
  const rect = vcTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  if (meta?.duration) {
    const cur = (pct / 100) * meta.duration;
    vidPlayer.currentTime = cur;
    vcThumbTooltip.textContent = fmtDurationMs(cur);
  }
}

/* ── Clipping Feature ─────────────────────────────────── */
btnClip.addEventListener('click', async () => {
  clipping = !clipping;
  if (clipping) {
    btnClip.classList.add('active');
    clipRange.style.display = 'block';
    
    // Auto-load if haven't played yet
    if (vidPlayer.style.display === 'none') {
      await playVideo();
      vidPlayer.pause();
    }
    
    if (meta?.duration && vidPlayer.readyState) {
      // Seek to clip start when activated
      vidPlayer.currentTime = (clipStart / 100) * meta.duration;
    }
  } else {
    btnClip.classList.remove('active');
    clipRange.style.display = 'none';
  }
});

function updateClipUI() {
  clipStartHandle.style.left = clipStart + '%';
  clipEndHandle.style.left = clipEnd + '%';
  clipHl.style.left = clipStart + '%';
  clipHl.style.width = (clipEnd - clipStart) + '%';
  
  if (meta?.duration) {
    clipStartTooltip.textContent = fmtDurationMs((clipStart / 100) * meta.duration);
    clipEndTooltip.textContent = fmtDurationMs((clipEnd / 100) * meta.duration);
  }
}

function handleClipDrag(e) {
  if (!isDraggingHandle) return;
  const rect = vcTrack.getBoundingClientRect();
  let pct = ((e.clientX - rect.left) / rect.width) * 100;
  pct = Math.max(0, Math.min(100, pct));

  if (isDraggingHandle === 'start') {
    clipStart = Math.min(pct, clipEnd - 2); // keep a minimum 2% gap
  } else {
    clipEnd = Math.max(pct, clipStart + 2);
  }
  updateClipUI();
}

clipStartHandle.addEventListener('mousedown', () => isDraggingHandle = 'start');
clipEndHandle.addEventListener('mousedown', () => isDraggingHandle = 'end');
window.addEventListener('mousemove', (e) => {
  handleClipDrag(e);
  if (isDraggingTrack) updateTrackDrag(e);
});
window.addEventListener('mouseup', () => {
  if (isDraggingHandle && meta?.duration) {
    vidPlayer.currentTime = (isDraggingHandle === 'start' ? clipStart : clipEnd) / 100 * meta.duration;
  }
  isDraggingHandle = null;
  isDraggingTrack = false;
});
