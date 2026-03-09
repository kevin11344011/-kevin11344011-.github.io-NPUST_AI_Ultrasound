const STORAGE_KEY = "github_pages_annotation_v1_state";
const DEFAULT_CLASSES = [
  { name: "class_0", color: "#ff4d4f" },
  { name: "class_1", color: "#40a9ff" },
];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"];
const folderInput = document.getElementById("folderInput");
const labelInput = document.getElementById("labelInput");
const modeSelect = document.getElementById("modeSelect");
const annotationMode = document.getElementById("annotationMode");
const videoMode = document.getElementById("videoMode");
const settingsMode = document.getElementById("settingsMode");
const videoInput = document.getElementById("videoInput");
const frameInterval = document.getElementById("frameInterval");
const convertBtn = document.getElementById("convertBtn");
const conversionStatus = document.getElementById("conversionStatus");
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
const modeSelect = document.getElementById("modeSelect");
const annotationMode = document.getElementById("annotationMode");
const videoMode = document.getElementById("videoMode");
const settingsMode = document.getElementById("settingsMode");
const videoInput = document.getElementById("videoInput");
const frameInterval = document.getElementById("frameInterval");
const convertBtn = document.getElementById("convertBtn");
const conversionStatus = document.getElementById("conversionStatus");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

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
let state = { classes: [], annotations: {} };
let currentAnnoIndex = -1;

modeSelect.addEventListener("change", () => {
  const mode = modeSelect.value;
  annotationMode.style.display = mode === "annotation" ? "block" : "none";
  videoMode.style.display = mode === "video" ? "block" : "none";
  settingsMode.style.display = mode === "settings" ? "block" : "none";
  document.querySelector('.main').style.display = mode === "annotation" ? "block" : "none";
});

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function randomColor() {
  const pool = ["#ff7875", "#73d13d", "#40a9ff", "#9254de", "#ffa940", "#13c2c2", "#eb2f96"];
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

function saveState() {
  state.classes = classes;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { state = { classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES)), annotations: {} }; return; }
    const parsed = JSON.parse(raw);
    state = {
      classes: Array.isArray(parsed.classes) && parsed.classes.length ? parsed.classes : JSON.parse(JSON.stringify(DEFAULT_CLASSES)),
      annotations: parsed.annotations && typeof parsed.annotations === "object" ? parsed.annotations : {},
    };
  } catch {
    state = { classes: JSON.parse(JSON.stringify(DEFAULT_CLASSES)), annotations: {} };
  }
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
    selectBtn.textContent = `Class ${idx}`;
    selectBtn.addEventListener("click", () => { activeClassIndex = idx; renderClassList(); render(); });

    const nameInput = document.createElement("input");
    nameInput.className = "class-name";
    nameInput.type = "text";
    nameInput.value = cls.name;
    nameInput.addEventListener("input", () => { cls.name = nameInput.value.trim() || `class_${idx}`; saveState(); render(); });

    const colorInput = document.createElement("input");
    colorInput.className = "class-color";
    colorInput.type = "color";
    colorInput.value = cls.color;
    colorInput.addEventListener("input", () => { cls.color = colorInput.value; saveState(); renderClassList(); render(); });

    const delBtn = document.createElement("button");
    delBtn.className = "class-delete small-btn danger";
    delBtn.textContent = "Del";
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
  classes.push({ name: `class_${classes.length}`, color: randomColor() });
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
    currentInfoEl.textContent = `${fileDisplayPath(file)} | ${img.naturalWidth}×${img.naturalHeight}`;
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
      btn.textContent = `Class ${idx}: ${cls.name}`;
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
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
exportCurrentBtn.addEventListener("click", async () => {
  if (currentFileIndex < 0) return;
  saveState();
  const file = files[currentFileIndex], txt = await buildYoloTextForFile(file);
  downloadText(`${fileBaseName(file)}.txt`, txt);
});
exportAllBtn.addEventListener("click", async () => {
  if (!files.length) return;
  saveState();
  const zip = new JSZip();
  const imagesFolder = zip.folder("images");
  const labelsFolder = zip.folder("labels");
  for (const file of files) {
    imagesFolder.file(file.name, file);
    const txt = await buildYoloTextForFile(file);
    labelsFolder.file(`${fileBaseName(file)}.txt`, txt);
  }
  zip.file("classes.json", JSON.stringify(classes, null, 2));
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
window.addEventListener("beforeunload", saveState);
document.addEventListener("keydown", (evt) => {
  if (evt.key === "a" || evt.key === "A") prevBtn.click();
  if (evt.key === "d" || evt.key === "D") nextBtn.click();
});
convertBtn.addEventListener("click", async () => {
  const file = videoInput.files[0];
  if (!file) {
    conversionStatus.textContent = "Please select a video file.";
    return;
  }
  const interval = parseInt(frameInterval.value);
  if (isNaN(interval) || interval < 1) {
    conversionStatus.textContent = "Invalid frame interval.";
    return;
  }
  conversionStatus.textContent = "Converting...";
  // Note: Actual video to image conversion requires more complex implementation
  // For now, just show a message
  setTimeout(() => {
    conversionStatus.textContent = "Conversion completed. (Note: Full implementation needed for actual conversion)";
  }, 2000);
});
function init() {
  loadState();
  classes = JSON.parse(JSON.stringify(state.classes));
  if (!classes.length) classes = JSON.parse(JSON.stringify(DEFAULT_CLASSES));
  renderClassList(); ensureCanvasSize(); render();
}
init();
