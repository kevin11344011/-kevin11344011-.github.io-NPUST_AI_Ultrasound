const STORAGE_KEY = "github_pages_annotation_v1_state";
const DEFAULT_CLASSES = [
  { name: "0", color: "#ff4d4f" },
  { name: "1", color: "#40a9ff" },
];
const PRESET_COLORS = [
  { name: "Red", value: "#ff4d4f" },
  { name: "Orange", value: "#fa8c16" },
  { name: "Yellow", value: "#fadb14" },
  { name: "Green", value: "#52c41a" },
  { name: "Blue", value: "#1677ff" },
  { name: "Purple", value: "#722ed1" },
  { name: "Gray", value: "#8c8c8c" },
  { name: "White", value: "#f5f5f5" },
  { name: "Black", value: "#141414" },
  { name: "Pink", value: "#eb2f96" },
];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"];
const folderInput = document.getElementById("folderInput");
const labelInput = document.getElementById("labelInput");
const collapsiblePanels = Array.from(document.querySelectorAll("[data-collapsible]"));
const modeSelect = document.getElementById("modeSelect");
const annotationMode = document.getElementById("annotationMode");
const videoMode = document.getElementById("videoMode");
const settingsMode = document.getElementById("settingsMode");
const annotationMain = document.getElementById("annotationMain");
const videoMain = document.getElementById("videoMain");
const settingsMain = document.getElementById("settingsMain");
const videoInput = document.getElementById("videoInput");
const frameInterval = document.getElementById("frameInterval");
const videoFpsInput = document.getElementById("videoFpsInput");
const convertBtn = document.getElementById("convertBtn");
const exportFramesBtn = document.getElementById("exportFramesBtn");
const conversionStatus = document.getElementById("conversionStatus");
const videoPreview = document.getElementById("videoPreview");
const playPauseBtn = document.getElementById("playPauseBtn");
const videoSeek = document.getElementById("videoSeek");
const videoTimeLabel = document.getElementById("videoTimeLabel");
const videoMeta = document.getElementById("videoMeta");
const framePreview = document.getElementById("framePreview");
const frameSeek = document.getElementById("frameSeek");
const frameInfo = document.getElementById("frameInfo");
const frameSummary = document.getElementById("frameSummary");
const frameEmptyHint = document.getElementById("frameEmptyHint");
const frameStage = framePreview.parentElement;
const imageListEl = document.getElementById("imageList");
const searchInput = document.getElementById("searchInput");
const imageCountEl = document.getElementById("imageCount");
const currentInfoEl = document.getElementById("currentInfo");
const emptyHintEl = document.getElementById("emptyHint"); 
const classListEl = document.getElementById("classList");
const addClassBtn = document.getElementById("addClassBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const exportCurrentBtn = document.getElementById("exportCurrentBtn");
const exportAllBtn = document.getElementById("exportAllBtn");
const zipNameInput = document.getElementById("zipNameInput");
const contextMenu = document.getElementById("contextMenu");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fontSizeInput = document.getElementById("fontSizeInput");
const fontSizeValue = document.getElementById("fontSizeValue");
const sidebarWidthInput = document.getElementById("sidebarWidthInput");
const sidebarWidthValue = document.getElementById("sidebarWidthValue");
const labelFormatSelect = document.getElementById("labelFormatSelect");
const labelFormatHint = document.getElementById("labelFormatHint");
const settingsSummary = document.getElementById("settingsSummary");

const DEFAULT_SETTINGS = {
  fontSize: 16,
  sidebarWidth: 360,
  labelFormat: "yolo",
};

let files = [];
let filteredIndexes = [];
let currentFileIndex = -1;
let imageElement = null;
let imageCacheUrl = null;
let zoom = 1, minZoom = 0.1, maxZoom = 20, offsetX = 0, offsetY = 0;
let isDrawing = false;
let currentStroke = [];
let classes = [];
let activeClassIndex = 0;
let state = { classes: [], annotations: {}, settings: { ...DEFAULT_SETTINGS } };
let currentAnnoIndex = -1;
let loadedVideoFile = null;
let loadedVideoUrl = null;
let extractedFrames = [];
let currentFrameIndex = -1;
let isConvertingVideo = false;
let ffmpegInstance = null;
let ffmpegLoadPromise = null;
let ffmpegReady = false;

function updateModeLayout(mode) {
  annotationMode.style.display = mode === "annotation" ? "block" : "none";
  videoMode.style.display = mode === "video" ? "block" : "none";
  settingsMode.style.display = mode === "settings" ? "block" : "none";
  annotationMain.style.display = mode === "annotation" ? "flex" : "none";
  videoMain.style.display = mode === "video" ? "grid" : "none";
  settingsMain.style.display = mode === "settings" ? "flex" : "none";
}

function setPanelCollapsed(panel, collapsed) {
  const toggle = panel.querySelector(".panel-toggle");
  const icon = panel.querySelector(".panel-toggle-icon");
  panel.classList.toggle("is-collapsed", collapsed);
  if (toggle) toggle.setAttribute("aria-expanded", String(!collapsed));
  if (icon) icon.textContent = collapsed ? "+" : "-";
}

function initCollapsiblePanels() {
  collapsiblePanels.forEach((panel) => {
    const toggle = panel.querySelector(".panel-toggle");
    if (!toggle) return;
    setPanelCollapsed(panel, false);
    toggle.addEventListener("click", () => {
      const collapsed = panel.classList.contains("is-collapsed");
      setPanelCollapsed(panel, !collapsed);
      window.requestAnimationFrame(() => {
        ensureCanvasSize();
        render();
      });
    });
  });
}

modeSelect.addEventListener("change", () => {
  const mode = modeSelect.value;
  updateModeLayout(mode);
});

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randomColor() {
  const pool = PRESET_COLORS.map((item) => item.value);
  return pool[Math.floor(Math.random() * pool.length)];
}
function fileKey(file) {
  const rel = file.webkitRelativePath || file.name;
  return `${rel}__${file.size}__${file.lastModified}`;
}
function fileBaseName(file) {
  const name = file.name; const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(0, dot) : name;
}
function fileDisplayPath(file) { return file.webkitRelativePath || file.name; }
function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00.000";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}
function getVideoSupportText(file) {
  if (!file) return "";
  const mime = file.type || "video/mp4";
  const support = videoPreview.canPlayType(mime);
  if (support === "probably") return `Browser support check: ${mime} probably supported.`;
  if (support === "maybe") return `Browser support check: ${mime} may be supported.`;
  return `Browser support check: ${mime} is not reported as supported.`;
}
function getMediaErrorMessage(mediaError) {
  if (!mediaError) return "Unknown media error.";
  if (mediaError.code === 1) return "Playback was aborted before loading finished.";
  if (mediaError.code === 2) return "A network error interrupted video loading.";
  if (mediaError.code === 3) return "The video could not be decoded. This is often a codec issue.";
  if (mediaError.code === 4) return "This video format or codec is not supported by the browser.";
  return "Unknown media error.";
}
async function toBlobUrl(url, mimeType) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Unable to fetch ffmpeg asset: ${url}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(new Blob([blob], { type: mimeType }));
}
async function loadFfmpeg() {
  if (ffmpegReady && ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
    throw new Error("ffmpeg.wasm loader is unavailable.");
  }
  ffmpegLoadPromise = (async () => {
    const baseUrl = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd";
    const ffmpeg = new window.FFmpegWASM.FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      if (isConvertingVideo) {
        conversionStatus.textContent = `Converting with ffmpeg.wasm... ${Math.round((progress || 0) * 100)}%`;
      }
    });
    const coreURL = await toBlobUrl(`${baseUrl}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobUrl(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm");
    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    ffmpegReady = true;
    return ffmpeg;
  })();
  try {
    return await ffmpegLoadPromise;
  } finally {
    ffmpegLoadPromise = null;
  }
}
function revokeLoadedVideoUrl() {
  if (!loadedVideoUrl) return;
  URL.revokeObjectURL(loadedVideoUrl);
  loadedVideoUrl = null;
}
function clearExtractedFrames() {
  extractedFrames.forEach((frame) => URL.revokeObjectURL(frame.url));
  extractedFrames = [];
  currentFrameIndex = -1;
  framePreview.removeAttribute("src");
  frameStage.classList.remove("has-frame");
  frameEmptyHint.style.display = "grid";
  frameSeek.value = "0";
  frameSeek.max = "0";
  frameSeek.disabled = true;
  frameInfo.textContent = "No frame selected";
  frameSummary.textContent = "No frames generated yet";
  exportFramesBtn.disabled = true;
}
function renderFramePreview(index) {
  if (!extractedFrames.length || index < 0 || index >= extractedFrames.length) {
    currentFrameIndex = -1;
    framePreview.removeAttribute("src");
    frameStage.classList.remove("has-frame");
    frameEmptyHint.style.display = "grid";
    frameInfo.textContent = "No frame selected";
    return;
  }
  const frame = extractedFrames[index];
  currentFrameIndex = index;
  framePreview.src = frame.url;
  frameStage.classList.add("has-frame");
  frameEmptyHint.style.display = "none";
  frameSeek.value = String(index);
  frameInfo.textContent = `${index + 1} / ${extractedFrames.length} | ${frame.name} | ${formatDuration(frame.time)}`;
}
function updateVideoTimeLabel() {
  const current = Number.isFinite(videoPreview.currentTime) ? videoPreview.currentTime : 0;
  const total = Number.isFinite(videoPreview.duration) ? videoPreview.duration : 0;
  videoTimeLabel.textContent = `${formatDuration(current)} / ${formatDuration(total)}`;
  if (document.activeElement !== videoSeek) {
    videoSeek.value = String(current);
  }
}
function waitForVideoEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, handler);
      target.removeEventListener("error", errorHandler);
    };
    const handler = () => {
      cleanup();
      resolve();
    };
    const errorHandler = () => {
      cleanup();
      reject(new Error("Unable to load video data."));
    };
    target.addEventListener(eventName, handler, { once: true });
    target.addEventListener("error", errorHandler, { once: true });
  });
}
async function seekVideoTo(videoEl, time) {
  const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
  const safeTime = Math.min(Math.max(time, 0), Math.max(duration - 0.001, 0));
  if (Math.abs(videoEl.currentTime - safeTime) < 0.0005) return;
  const seeking = waitForVideoEvent(videoEl, "seeked");
  videoEl.currentTime = safeTime;
  await seeking;
}
async function ensureVideoReady(videoEl) {
  if (videoEl.readyState >= 2) return;
  const eventName = videoEl.readyState >= 1 ? "loadeddata" : "loadedmetadata";
  await waitForVideoEvent(videoEl, eventName);
  if (videoEl.readyState < 2) {
    await waitForVideoEvent(videoEl, "loadeddata");
  }
}
function loadVideoFile(file) {
  loadedVideoFile = file || null;
  clearExtractedFrames();
  videoPreview.pause();
  if (!loadedVideoFile) {
    revokeLoadedVideoUrl();
    videoPreview.removeAttribute("src");
    videoPreview.load();
    videoMeta.textContent = "Please select a video first";
    conversionStatus.textContent = "";
    playPauseBtn.textContent = "Play";
    videoSeek.max = "0";
    videoSeek.value = "0";
    updateVideoTimeLabel();
    return;
  }
  revokeLoadedVideoUrl();
  loadedVideoUrl = URL.createObjectURL(loadedVideoFile);
  videoMeta.textContent = `${loadedVideoFile.name} | Loading video...`;
  conversionStatus.textContent = `Loading selected video... ${getVideoSupportText(loadedVideoFile)}`;
  videoSeek.max = "0";
  videoSeek.value = "0";
  videoPreview.src = loadedVideoUrl;
  videoPreview.load();
  playPauseBtn.textContent = "Play";
}
async function extractFramesFromVideo(file, frameStep, fps) {
  const workerVideo = document.createElement("video");
  workerVideo.muted = true;
  workerVideo.playsInline = true;
  workerVideo.preload = "auto";
  const workerUrl = URL.createObjectURL(file);
  workerVideo.src = workerUrl;
  workerVideo.load();
  try {
    await ensureVideoReady(workerVideo);
    const duration = workerVideo.duration || 0;
    if (!duration || !workerVideo.videoWidth || !workerVideo.videoHeight) {
      throw new Error("Unable to read video metadata.");
    }

    const canvasEl = document.createElement("canvas");
    canvasEl.width = workerVideo.videoWidth;
    canvasEl.height = workerVideo.videoHeight;
    const context = canvasEl.getContext("2d", { willReadFrequently: true });
    const stepSeconds = frameStep / fps;
    const capturePoints = [];
    for (let frameNumber = 0, time = 0; time < duration; frameNumber += frameStep, time += stepSeconds) {
      capturePoints.push({ frameNumber, time: Math.min(time, duration) });
    }
    if (!capturePoints.length) {
      capturePoints.push({ frameNumber: 0, time: 0 });
    }

    const baseName = fileBaseName(file);
    const nextFrames = [];
    for (let i = 0; i < capturePoints.length; i++) {
      const point = capturePoints[i];
      conversionStatus.textContent = `Converting ${i + 1}/${capturePoints.length}...`;
      await seekVideoTo(workerVideo, point.time);
      context.drawImage(workerVideo, 0, 0, canvasEl.width, canvasEl.height);
      const blob = await new Promise((resolve, reject) => {
        canvasEl.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to export PNG frame.")), "image/png");
      });
      const name = `${baseName}_frame_${String(point.frameNumber).padStart(6, "0")}.png`;
      nextFrames.push({
        name,
        time: point.time,
        frameNumber: point.frameNumber,
        blob,
        url: URL.createObjectURL(blob),
      });
    }
    return nextFrames;
  } finally {
    URL.revokeObjectURL(workerUrl);
  }
}
async function extractFramesWithFfmpeg(file, frameStep, fps) {
  const ffmpeg = await loadFfmpeg();
  const frameRate = fps / frameStep;
  if (!Number.isFinite(frameRate) || frameRate <= 0) {
    throw new Error("Unable to compute ffmpeg frame extraction rate.");
  }
  const inputName = `input_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const outputPattern = "frame_%06d.png";
  const fileData = new Uint8Array(await file.arrayBuffer());
  conversionStatus.textContent = "Loading video into ffmpeg.wasm...";
  await ffmpeg.writeFile(inputName, fileData);
  try {
    await ffmpeg.exec([
      "-i", inputName,
      "-vf", `fps=${frameRate}`,
      outputPattern,
    ]);
    const entries = await ffmpeg.listDir("/");
    const outputFiles = entries
      .filter((entry) => entry.isDir === false && /^frame_\d+\.png$/i.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    if (!outputFiles.length) {
      throw new Error("ffmpeg.wasm did not generate any PNG frames.");
    }
    const baseName = fileBaseName(file);
    const frames = [];
    for (let i = 0; i < outputFiles.length; i++) {
      const entry = outputFiles[i];
      const data = await ffmpeg.readFile(entry.name);
      const blob = new Blob([data.buffer], { type: "image/png" });
      frames.push({
        name: `${baseName}_${entry.name}`,
        time: i / frameRate,
        frameNumber: i * frameStep,
        blob,
        url: URL.createObjectURL(blob),
      });
      await ffmpeg.deleteFile(entry.name);
    }
    return frames;
  } finally {
    await ffmpeg.deleteFile(inputName).catch(() => {});
  }
}

function saveState() {
  state.classes = classes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state = { classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES)), annotations: {}, settings: { ...DEFAULT_SETTINGS } };
      return;
    }
    const parsed = JSON.parse(raw);
    state = {
      classes: Array.isArray(parsed.classes) && parsed.classes.length ? parsed.classes : JSON.parse(JSON.stringify(DEFAULT_CLASSES)),
      annotations: parsed.annotations && typeof parsed.annotations === "object" ? parsed.annotations : {},
      settings: {
        ...DEFAULT_SETTINGS,
        ...(parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {}),
      },
    };
  } catch {
    state = { classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES)), annotations: {}, settings: { ...DEFAULT_SETTINGS } };
  }
}
function getLabelFormatMeta() {
  if (state.settings.labelFormat === "json") {
    return {
      extension: "json",
      currentButtonText: "Export json label",
      allButtonText: "Export JSON Zip",
      hint: "JSON exports one `.json` file per image with image path, size, classes, and polygon points.",
    };
  }
  return {
    extension: "txt",
    currentButtonText: "Export txt label",
    allButtonText: "Export YOLO Zip",
    hint: "YOLO exports one `.txt` file per image using normalized polygon points.",
  };
}
function applySettings() {
  const settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.settings = settings;
  document.documentElement.style.setProperty("--ui-font-size", `${settings.fontSize}px`);
  document.documentElement.style.setProperty("--sidebar-width", `${settings.sidebarWidth}px`);
  if (fontSizeInput) fontSizeInput.value = String(settings.fontSize);
  if (fontSizeValue) fontSizeValue.textContent = `${settings.fontSize} px`;
  if (sidebarWidthInput) sidebarWidthInput.value = String(settings.sidebarWidth);
  if (sidebarWidthValue) sidebarWidthValue.textContent = `${settings.sidebarWidth} px`;
  if (labelFormatSelect) labelFormatSelect.value = settings.labelFormat;
  const formatMeta = getLabelFormatMeta();
  exportCurrentBtn.textContent = formatMeta.currentButtonText;
  exportAllBtn.textContent = formatMeta.allButtonText;
  if (labelFormatHint) labelFormatHint.textContent = formatMeta.hint;
  if (settingsSummary) {
    settingsSummary.innerHTML = `
      <div class="settings-summary-item">
        <strong>Font Size</strong>
        <span>${settings.fontSize}px</span>
      </div>
      <div class="settings-summary-item">
        <strong>Sidebar Width</strong>
        <span>${settings.sidebarWidth}px</span>
      </div>
      <div class="settings-summary-item">
        <strong>Label Format</strong>
        <span>${settings.labelFormat.toUpperCase()}</span>
      </div>
    `;
  }
  window.requestAnimationFrame(() => {
    ensureCanvasSize();
    render();
  });
}
function updateSetting(key, value) {
  state.settings = { ...state.settings, [key]: value };
  saveState();
  applySettings();
}
function ensureCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function getAllAnnotationsForCurrent() {
  if (currentFileIndex < 0) return [];
  return state.annotations[fileKey(files[currentFileIndex])] || [];
}
function setAnnotationsForCurrent(list) {
  if (currentFileIndex < 0) return;
  state.annotations[fileKey(files[currentFileIndex])] = list;
  saveState();
}
function renderClassList() {
  classListEl.innerHTML = "";
  classes.forEach((cls, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "class-item";
    const selectBtn = document.createElement("button");
    selectBtn.className = "class-select";
    if (idx === activeClassIndex) selectBtn.classList.add("active");
    selectBtn.style.background = cls.color;
    selectBtn.textContent = `${idx}`;
    selectBtn.addEventListener("click", () => { activeClassIndex = idx; renderClassList(); render(); });

    const nameInput = document.createElement("input");
    nameInput.className = "class-name";
    nameInput.type = "text";
    nameInput.value = cls.name;
    nameInput.addEventListener("input", () => { cls.name = nameInput.value.trim() || `${idx}`; saveState(); render(); });

    const colorInput = document.createElement("select");
    colorInput.className = "class-color";
    PRESET_COLORS.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.value;
      option.textContent = preset.name;
      colorInput.appendChild(option);
    });
    if (!PRESET_COLORS.some((preset) => preset.value.toLowerCase() === String(cls.color).toLowerCase())) {
      const fallbackOption = document.createElement("option");
      fallbackOption.value = cls.color;
      fallbackOption.textContent = cls.color;
      colorInput.appendChild(fallbackOption);
    }
    colorInput.value = cls.color;
    colorInput.style.background = cls.color;
    colorInput.style.color = cls.color.toLowerCase() === "#f5f5f5" || cls.color.toLowerCase() === "#fadb14" ? "#111111" : "#ffffff";
    colorInput.addEventListener("change", () => {
      cls.color = colorInput.value;
      saveState();
      renderClassList();
      render();
    });

    const delBtn = document.createElement("button");
    delBtn.className = "class-delete small-btn danger";
    delBtn.textContent = "-";
    delBtn.disabled = classes.length <= 1;
    delBtn.addEventListener("click", () => {
      if (classes.length <= 1) return;
      const removed = idx;
      classes.splice(idx, 1);
      Object.keys(state.annotations).forEach((k) => {
        state.annotations[k] = (state.annotations[k] || [])
          .filter((anno) => anno.classIndex !== removed)
          .map((anno) => ({ ...anno, classIndex: anno.classIndex > removed ? anno.classIndex - 1 : anno.classIndex }));
      });
      activeClassIndex = clamp(activeClassIndex, 0, classes.length - 1);
      saveState(); renderClassList(); render(); renderImageList();
    });

    wrap.appendChild(selectBtn);
    wrap.appendChild(nameInput);
    wrap.appendChild(colorInput);
    wrap.appendChild(delBtn);
    classListEl.appendChild(wrap);
  });
}
function addClass() {
  classes.push({ name: `${classes.length}`, color: randomColor() });
  activeClassIndex = classes.length - 1;
  saveState(); renderClassList(); render();
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[m]));
}
function getImageCountForFile(index) { return (state.annotations[fileKey(files[index])] || []).length; }
function renderImageList() {
  const keyword = searchInput.value.trim().toLowerCase();
  filteredIndexes = [];
  imageListEl.innerHTML = "";
  files.forEach((file, idx) => {
    const text = fileDisplayPath(file).toLowerCase();
    if (!keyword || text.includes(keyword)) filteredIndexes.push(idx);
  });
  imageCountEl.textContent = `${filteredIndexes.length} images`;
  filteredIndexes.forEach((fileIdx) => {
    const file = files[fileIdx];
    const li = document.createElement("li");
    if (fileIdx === currentFileIndex) li.classList.add("active");
    const count = getImageCountForFile(fileIdx);
    li.innerHTML = `<div>${escapeHtml(fileDisplayPath(file))}</div><div class="muted">Blocks: ${count}</div>`;
    li.addEventListener("click", () => openImage(fileIdx));
    imageListEl.appendChild(li);
  });
  if (!filteredIndexes.length) {
    const li = document.createElement("li");
    li.textContent = "No matching images"; li.style.cursor = "default"; imageListEl.appendChild(li);
  }
}
function fitImageToView() {
  if (!imageElement) return;
  const viewW = canvas.width, viewH = canvas.height;
  const imgW = imageElement.naturalWidth, imgH = imageElement.naturalHeight;
  const fitScale = Math.min(viewW / imgW, viewH / imgH) * 0.95;
  zoom = fitScale; minZoom = fitScale * 0.2; maxZoom = fitScale * 20;
  offsetX = (viewW - imgW * zoom) / 2; offsetY = (viewH - imgH * zoom) / 2;
}
function imageToCanvas(pt) { return { x: pt[0] * zoom + offsetX, y: pt[1] * zoom + offsetY }; }
function canvasToImage(x, y) { return { x: (x - offsetX) / zoom, y: (y - offsetY) / zoom }; }
function pointInsideImage(imgPt) {
  return imageElement && imgPt.x >= 0 && imgPt.y >= 0 && imgPt.x <= imageElement.naturalWidth && imgPt.y <= imageElement.naturalHeight;
}
async function openImage(fileIndex) {
  if (fileIndex < 0 || fileIndex >= files.length) return;
  saveState(); currentFileIndex = fileIndex;
  if (imageCacheUrl) { URL.revokeObjectURL(imageCacheUrl); imageCacheUrl = null; }
  const file = files[fileIndex]; imageCacheUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    imageElement = img; ensureCanvasSize(); fitImageToView();
    currentStroke = []; isDrawing = false; emptyHintEl.style.display = "none";
    currentInfoEl.textContent = `${fileDisplayPath(file)} | ${img.naturalWidth}?${img.naturalHeight}`;
    renderImageList(); render();
  };
  img.src = imageCacheUrl;
}
function render() {
  ensureCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imageElement) { emptyHintEl.style.display = "grid"; return; }
  emptyHintEl.style.display = "none";
  ctx.fillStyle = "#0e1217"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(offsetX, offsetY); ctx.scale(zoom, zoom); ctx.drawImage(imageElement, 0, 0); ctx.restore();
  getAllAnnotationsForCurrent().forEach((anno) => drawPolygon(anno.points, anno.classIndex, false));
  if (currentStroke.length > 1) drawPolygon(currentStroke, activeClassIndex, true);
}
function drawPolygon(points, classIndex, preview) {
  if (!points || points.length < 2) return;
  const cls = classes[classIndex] || { name: `class_${classIndex}`, color: "#ff4d4f" };
  ctx.beginPath();
  const p0 = imageToCanvas(points[0]); ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < points.length; i++) { const p = imageToCanvas(points[i]); ctx.lineTo(p.x, p.y); }
  if (!preview) { ctx.closePath(); ctx.fillStyle = hexToRgba(cls.color, 0.28); ctx.fill(); }
  ctx.lineWidth = 2; ctx.strokeStyle = cls.color; ctx.stroke();
  if (!preview && points.length >= 3) {
    const labelPos = polygonCentroid(points); const c = imageToCanvas([labelPos.x, labelPos.y]);
    drawLabel(c.x, c.y, cls.name, cls.color);
  }
}
function drawLabel(x, y, text, color) {
  ctx.font = "bold 14px Arial, Microsoft JhengHei";
  const paddingX = 8, h = 24, textW = ctx.measureText(text).width, w = textW + paddingX * 2;
  ctx.fillStyle = color; ctx.fillRect(x, y - h, w, h);
  ctx.fillStyle = "#ffffff"; ctx.fillText(text, x + paddingX, y - 7);
}
function polygonCentroid(points) {
  let sumX = 0, sumY = 0; points.forEach((p) => { sumX += p[0]; sumY += p[1]; });
  return { x: sumX / points.length, y: sumY / points.length };
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", ""); const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (((yi > point[1]) !== (yj > point[1])) && (point[0] < (xj - xi) * (point[1] - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}
function getCanvasMousePos(evt) {
  const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  return { x: (evt.clientX - rect.left) * dpr, y: (evt.clientY - rect.top) * dpr };
}
canvas.addEventListener("mousedown", (evt) => {
  if (evt.button !== 0 || !imageElement) return;
  const pt = getCanvasMousePos(evt); const imgPt = canvasToImage(pt.x, pt.y);
  if (!pointInsideImage(imgPt)) return;
  isDrawing = true; currentStroke = [[imgPt.x, imgPt.y]]; render();
});
canvas.addEventListener("mousemove", (evt) => {
  if (!isDrawing || !imageElement) return;
  const pt = getCanvasMousePos(evt); const imgPt = canvasToImage(pt.x, pt.y);
  if (!pointInsideImage(imgPt)) return;
  const last = currentStroke[currentStroke.length - 1];
  const dx = imgPt.x - last[0], dy = imgPt.y - last[1];
  if (dx * dx + dy * dy >= 4) { currentStroke.push([imgPt.x, imgPt.y]); render(); }
});
function finishStroke() {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentStroke.length >= 3) {
    const annos = getAllAnnotationsForCurrent().slice();
    annos.push({ classIndex: activeClassIndex, points: currentStroke });
    setAnnotationsForCurrent(annos);
  }
  currentStroke = []; renderImageList(); render();
}
canvas.addEventListener("mouseup", finishStroke);
canvas.addEventListener("mouseleave", () => { if (isDrawing) finishStroke(); });
canvas.addEventListener("wheel", (evt) => {
  if (!imageElement) return;
  evt.preventDefault();
  const mouse = getCanvasMousePos(evt); const before = canvasToImage(mouse.x, mouse.y);
  const factor = evt.deltaY < 0 ? 1.1 : 0.9; zoom = clamp(zoom * factor, minZoom, maxZoom);
  offsetX = mouse.x - before.x * zoom; offsetY = mouse.y - before.y * zoom;
  render();
}, { passive: false });
canvas.addEventListener("contextmenu", (evt) => {
  evt.preventDefault();
  const pt = getCanvasMousePos(evt);
  const imgPt = canvasToImage(pt.x, pt.y);
  const annos = getAllAnnotationsForCurrent();
  currentAnnoIndex = -1;
  for (let i = 0; i < annos.length; i++) {
    if (pointInPolygon([imgPt.x, imgPt.y], annos[i].points)) {
      currentAnnoIndex = i;
      break;
    }
  }
  if (currentAnnoIndex >= 0) {
    contextMenu.innerHTML = '';
    classes.forEach((cls, idx) => {
      const btn = document.createElement('button');
      btn.textContent = `${idx}: ${cls.name}`;
      btn.style.background = cls.color;
      btn.style.color = 'white';
      btn.style.border = 'none';
      btn.style.padding = '5px 10px';
      btn.style.margin = '2px';
      btn.style.borderRadius = '3px';
      btn.style.cursor = 'pointer';
      btn.addEventListener('click', () => {
        const annos = getAllAnnotationsForCurrent().slice();
        annos[currentAnnoIndex].classIndex = idx;
        setAnnotationsForCurrent(annos);
        render();
        contextMenu.style.display = 'none';
      });
      contextMenu.appendChild(btn);
    });
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear Mark';
    clearBtn.style.background = 'var(--danger)';
    clearBtn.style.color = 'white';
    clearBtn.style.border = 'none';
    clearBtn.style.padding = '5px 10px';
    clearBtn.style.margin = '2px';
    clearBtn.style.borderRadius = '3px';
    clearBtn.style.cursor = 'pointer';
    clearBtn.addEventListener('click', () => {
      const annos = getAllAnnotationsForCurrent().slice();
      annos.splice(currentAnnoIndex, 1);
      setAnnotationsForCurrent(annos);
      renderImageList();
      render();
      contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(clearBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.background = 'gray';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.padding = '5px 10px';
    cancelBtn.style.margin = '2px';
    cancelBtn.style.borderRadius = '3px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
      contextMenu.style.display = 'none';
    });
    contextMenu.appendChild(cancelBtn);
    contextMenu.style.left = `${evt.clientX}px`;
    contextMenu.style.top = `${evt.clientY}px`;
    contextMenu.style.display = 'block';
  }
});
document.addEventListener("click", () => {
  contextMenu.style.display = 'none';
});

searchInput.addEventListener("input", renderImageList);
folderInput.addEventListener("change", async (evt) => {
  const picked = Array.from(evt.target.files || []);
  files = picked.filter((f) => IMAGE_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)));
  files.sort((a, b) => fileDisplayPath(a).localeCompare(fileDisplayPath(b), "zh-Hant"));
  // Load labels if available
  const txtFiles = picked.filter((f) => f.name.toLowerCase().endsWith('.txt') && f.webkitRelativePath.includes('labels/'));
  const errorFiles = [];
  for (const file of txtFiles) {
    const baseName = fileBaseName(file);
    const imgFile = files.find(f => fileBaseName(f) === baseName);
    if (!imgFile) continue;
    const dim = await getImageDimensions(imgFile);
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    let valid = true;
    const annos = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7 || parts.length % 2 !== 1) {
        valid = false;
        break;
      }
      const classIndex = parseInt(parts[0]);
      if (isNaN(classIndex) || classIndex < 0) {
        valid = false;
        break;
      }
      const points = [];
      for (let i = 1; i < parts.length; i += 2) {
        const x = parseFloat(parts[i]);
        const y = parseFloat(parts[i + 1]);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) {
          valid = false;
          break;
        }
        points.push([x * dim.width, y * dim.height]);
      }
      if (!valid) break;
      annos.push({ classIndex, points });
    }
    if (valid) {
      const key = fileKey(imgFile);
      state.annotations[key] = annos;
    } else {
      errorFiles.push(file.name);
    }
  }
  if (errorFiles.length > 0) {
    alert("The following label files in the folder have invalid YOLO format:\n" + errorFiles.join("\n"));
  }
  currentFileIndex = -1; imageElement = null; currentStroke = []; renderImageList();
  if (files.length > 0) await openImage(filteredIndexes[0] ?? 0);
  else { currentInfoEl.textContent = "No supported images in folder"; emptyHintEl.style.display = "grid"; render(); }
});
labelInput.addEventListener("change", async (evt) => {
  const picked = Array.from(evt.target.files || []);
  const txtFiles = picked.filter((f) => f.name.toLowerCase().endsWith('.txt'));
  const errorFiles = [];
  for (const file of txtFiles) {
    const baseName = fileBaseName(file);
    const imgFile = files.find(f => fileBaseName(f) === baseName);
    if (!imgFile) continue;
    const dim = await getImageDimensions(imgFile);
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    let valid = true;
    const annos = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7 || parts.length % 2 !== 1) { // class + at least 3 points (6 coords)
        valid = false;
        break;
      }
      const classIndex = parseInt(parts[0]);
      if (isNaN(classIndex) || classIndex < 0) {
        valid = false;
        break;
      }
      const points = [];
      for (let i = 1; i < parts.length; i += 2) {
        const x = parseFloat(parts[i]);
        const y = parseFloat(parts[i + 1]);
        if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) {
          valid = false;
          break;
        }
        points.push([x * dim.width, y * dim.height]);
      }
      if (!valid) break;
      annos.push({ classIndex, points });
    }
    if (valid) {
      const key = fileKey(imgFile);
      state.annotations[key] = annos;
      saveState();
    } else {
      errorFiles.push(file.name);
    }
  }
  if (errorFiles.length > 0) {
    alert("The following files have invalid YOLO format:\n" + errorFiles.join("\n"));
  }
  renderImageList();
  render();
});
addClassBtn.addEventListener("click", addClass);
prevBtn.addEventListener("click", () => {
  if (currentFileIndex < 0) return;
  const pos = filteredIndexes.indexOf(currentFileIndex);
  if (pos > 0) openImage(filteredIndexes[pos - 1]);
});
nextBtn.addEventListener("click", () => {
  if (currentFileIndex < 0) return;
  const pos = filteredIndexes.indexOf(currentFileIndex);
  if (pos >= 0 && pos < filteredIndexes.length - 1) openImage(filteredIndexes[pos + 1]);
});
undoBtn.addEventListener("click", () => {
  const annos = getAllAnnotationsForCurrent().slice(); annos.pop();
  setAnnotationsForCurrent(annos); renderImageList(); render();
});
clearBtn.addEventListener("click", () => {
  if (currentFileIndex < 0) return;
  if (!confirm("Are you sure to clear all marks on this image?")) return;
  setAnnotationsForCurrent([]); renderImageList(); render();
});
async function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const out = { width: img.naturalWidth, height: img.naturalHeight }; URL.revokeObjectURL(url); resolve(out); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unable to read image dimensions")); };
    img.src = url;
  });
}
async function buildYoloTextForFile(file) {
  const key = fileKey(file), annos = state.annotations[key] || [], dim = await getImageDimensions(file);
  return annos.map((anno) => {
    const coords = anno.points.map(([x, y]) => `${(x / dim.width).toFixed(6)} ${(y / dim.height).toFixed(6)}`).join(" ");
    return `${anno.classIndex} ${coords}`;
  }).join("\n");
}
async function buildJsonTextForFile(file) {
  const key = fileKey(file);
  const annos = state.annotations[key] || [];
  const dim = await getImageDimensions(file);
  return JSON.stringify({
    image: fileDisplayPath(file),
    width: dim.width,
    height: dim.height,
    annotations: annos.map((anno) => ({
      classIndex: anno.classIndex,
      className: classes[anno.classIndex]?.name ?? String(anno.classIndex),
      points: anno.points.map(([x, y]) => ({ x, y })),
    })),
  }, null, 2);
}
async function buildLabelFile(file) {
  const formatMeta = getLabelFormatMeta();
  const content = formatMeta.extension === "json"
    ? await buildJsonTextForFile(file)
    : await buildYoloTextForFile(file);
  return { extension: formatMeta.extension, content };
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
exportCurrentBtn.addEventListener("click", async () => {
  if (currentFileIndex < 0) return;
  saveState();
  const file = files[currentFileIndex];
  const labelFile = await buildLabelFile(file);
  downloadText(`${fileBaseName(file)}.${labelFile.extension}`, labelFile.content);
});
exportAllBtn.addEventListener("click", async () => {
  if (!files.length) return;
  saveState();
  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  const labelsFolder = zip.folder("labels");
  for (const file of files) {
    imagesFolder.file(file.name, file);
    const labelFile = await buildLabelFile(file);
    labelsFolder.file(`${fileBaseName(file)}.${labelFile.extension}`, labelFile.content);
  }
  zip.file("classes.json", JSON.stringify(classes, null, 2));
  zip.file("settings.json", JSON.stringify(state.settings, null, 2));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const zipName = zipNameInput.value.trim();
  const defaultName = (() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + '_' + String(now.getHours()).padStart(2,'0') + '-' + String(now.getMinutes()).padStart(2,'0') + '-' + String(now.getSeconds()).padStart(2,'0') + '.zip';
  })();
  a.download = zipName || defaultName;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
});
window.addEventListener("resize", () => {
  if (!imageElement) { ensureCanvasSize(); render(); return; }
  const oldCenter = canvasToImage(canvas.width / 2, canvas.height / 2);
  ensureCanvasSize(); offsetX = canvas.width / 2 - oldCenter.x * zoom; offsetY = canvas.height / 2 - oldCenter.y * zoom; render();
});
window.addEventListener("beforeunload", () => {
  saveState();
  clearExtractedFrames();
  revokeLoadedVideoUrl();
});
document.addEventListener("keydown", (evt) => {
  if (evt.key === "a" || evt.key === "A") prevBtn.click();
  if (evt.key === "d" || evt.key === "D") nextBtn.click();
});
videoInput.addEventListener("change", (evt) => {
  const file = (evt.target.files || [])[0];
  try {
    loadVideoFile(file || null);
  } catch (error) {
    revokeLoadedVideoUrl();
    conversionStatus.textContent = error.message || "Unable to load the selected video.";
  }
});
playPauseBtn.addEventListener("click", async () => {
  if (!loadedVideoFile) return;
  if (videoPreview.paused) await videoPreview.play();
  else videoPreview.pause();
});
videoPreview.addEventListener("play", () => { playPauseBtn.textContent = "Pause"; });
videoPreview.addEventListener("pause", () => { playPauseBtn.textContent = "Play"; });
videoPreview.addEventListener("timeupdate", updateVideoTimeLabel);
videoPreview.addEventListener("loadedmetadata", () => {
  videoSeek.max = String(videoPreview.duration || 0);
  videoMeta.textContent = `${loadedVideoFile ? loadedVideoFile.name : "Selected video"} | ${videoPreview.videoWidth}x${videoPreview.videoHeight} | ${formatDuration(videoPreview.duration)}`;
  updateVideoTimeLabel();
});
videoPreview.addEventListener("loadeddata", () => {
  conversionStatus.textContent = "Video loaded successfully.";
  updateVideoTimeLabel();
});
videoPreview.addEventListener("error", () => {
  const supportText = getVideoSupportText(loadedVideoFile);
  conversionStatus.textContent = `${getMediaErrorMessage(videoPreview.error)} ${supportText}`.trim();
});
videoSeek.addEventListener("input", () => {
  const nextTime = Number(videoSeek.value);
  if (!Number.isFinite(nextTime)) return;
  videoPreview.currentTime = nextTime;
  updateVideoTimeLabel();
});
frameSeek.addEventListener("input", () => {
  const nextIndex = Number(frameSeek.value);
  renderFramePreview(nextIndex);
});
convertBtn.addEventListener("click", async () => {
  if (!loadedVideoFile) {
    conversionStatus.textContent = "Please select a video file.";
    return;
  }
  const interval = parseInt(frameInterval.value, 10);
  const fps = parseFloat(videoFpsInput.value);
  if (!Number.isInteger(interval) || interval < 1) {
    conversionStatus.textContent = "Frame interval must be an integer greater than 0.";
    return;
  }
  if (!Number.isFinite(fps) || fps <= 0) {
    conversionStatus.textContent = "Video FPS must be greater than 0.";
    return;
  }

  isConvertingVideo = true;
  convertBtn.disabled = true;
  exportFramesBtn.disabled = true;
  try {
    clearExtractedFrames();
    let nextFrames;
    let usedFfmpegFallback = false;
    try {
      conversionStatus.textContent = "Converting with browser decoder...";
      nextFrames = await extractFramesFromVideo(loadedVideoFile, interval, fps);
    } catch (nativeError) {
      usedFfmpegFallback = true;
      conversionStatus.textContent = "Browser decoding failed. Switching to ffmpeg.wasm fallback...";
      nextFrames = await extractFramesWithFfmpeg(loadedVideoFile, interval, fps);
    }
    extractedFrames = nextFrames;
    frameSeek.max = String(Math.max(extractedFrames.length - 1, 0));
    frameSeek.disabled = extractedFrames.length === 0;
    frameSummary.textContent = `${extractedFrames.length} PNG frames generated | every ${interval} frames @ ${fps} FPS`;
    renderFramePreview(0);
    exportFramesBtn.disabled = extractedFrames.length === 0;
    conversionStatus.textContent = usedFfmpegFallback
      ? `Conversion completed with ffmpeg.wasm fallback. ${extractedFrames.length} PNG frames generated.`
      : `Conversion completed with browser decoder. ${extractedFrames.length} PNG frames generated.`;
  } catch (error) {
    clearExtractedFrames();
    conversionStatus.textContent = error.message || "Failed to convert the video.";
  } finally {
    isConvertingVideo = false;
    convertBtn.disabled = false;
  }
});
exportFramesBtn.addEventListener("click", async () => {
  if (!extractedFrames.length) return;
  exportFramesBtn.disabled = true;
  try {
    const zip = new JSZip();
    const framesFolder = zip.folder("png_frames");
    extractedFrames.forEach((frame) => {
      framesFolder.file(frame.name, frame.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = loadedVideoFile ? fileBaseName(loadedVideoFile) : "frames";
    link.href = url;
    link.download = `${baseName}_png_frames.zip`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    exportFramesBtn.disabled = false;
  }
});
fontSizeInput.addEventListener("input", () => {
  updateSetting("fontSize", parseInt(fontSizeInput.value, 10) || DEFAULT_SETTINGS.fontSize);
});
sidebarWidthInput.addEventListener("input", () => {
  updateSetting("sidebarWidth", parseInt(sidebarWidthInput.value, 10) || DEFAULT_SETTINGS.sidebarWidth);
});
labelFormatSelect.addEventListener("change", () => {
  updateSetting("labelFormat", labelFormatSelect.value === "json" ? "json" : "yolo");
});
function init() {
  loadState();
  classes = JSON.parse(JSON.stringify(state.classes));
  if (!classes.length) classes = JSON.parse(JSON.stringify(DEFAULT_CLASSES));
  updateModeLayout(modeSelect.value);
  initCollapsiblePanels();
  exportFramesBtn.disabled = true;
  applySettings();
  renderClassList(); ensureCanvasSize(); render(); updateVideoTimeLabel();
}
init();
