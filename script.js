/* script.js - Aurum Atelier: Complete Integrated AR & Try-All System */

const IMAGE_COUNTS = {
  gold_earrings: 5, 
  gold_necklaces: 5,
  diamond_earrings: 5, 
  diamond_necklaces: 6
};

/* DOM Elements */
const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');
const indicatorDot = document.getElementById('indicator-dot');
const indicatorText = document.getElementById('indicator-text');
const enlargedImg = document.getElementById('enlarged-img');

/* App State */
let earringImg = null, necklaceImg = null, currentType = '';
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 600; 
let isProcessingHand = false;
let isProcessingFace = false;

/* Try All / Gallery State */
let autoTryRunning = false;
let autoSnapshots = [];
let autoTryIndex = 0;
let autoTryTimeout = null;

/* Asset Preloading Cache */
const preloadedAssets = {};

async function preloadCategory(type) {
  if (preloadedAssets[type]) return; 
  preloadedAssets[type] = [];
  const count = IMAGE_COUNTS[type];
  
  for(let i=1; i<=count; i++) {
    const src = `${type}/${i}.png`;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    preloadedAssets[type].push(img);
  }
}

/* UI Indicators */
function updateHandIndicator(detected) {
  if (detected) {
    indicatorDot.style.background = "#00ff88"; 
    indicatorText.textContent = "Gesture Active";
  } else {
    indicatorDot.style.background = "#555"; 
    indicatorText.textContent = "Hand Not Detected";
  }
}

function flashIndicator(color) {
    indicatorDot.style.background = color;
    setTimeout(() => { 
        if(indicatorText.textContent === "Gesture Active") indicatorDot.style.background = "#00ff88";
        else indicatorDot.style.background = "#555";
    }, 300);
}

/* ---------- HAND DETECTION ---------- */
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 0, 
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  isProcessingHand = false; 
  const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;
  updateHandIndicator(hasHand);

  if (!hasHand || autoTryRunning) return;

  const now = Date.now();
  if (now - lastGestureTime < GESTURE_COOLDOWN) return;

  const landmarks = results.multiHandLandmarks[0];
  const indexTip = landmarks[8];
  const indexKnuckle = landmarks[5]; 
  const horizontalDiff = indexTip.x - indexKnuckle.x;

  if (horizontalDiff > 0.12) { // Swipe Right
    navigateJewelry(1);
    lastGestureTime = now;
    flashIndicator("#d4af37");
  } 
  else if (horizontalDiff < -0.12) { // Swipe Left
    navigateJewelry(-1);
    lastGestureTime = now;
    flashIndicator("#d4af37");
  }
});

/* ---------- FACE MESH ---------- */
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

faceMesh.onResults((results) => {
  isProcessingFace = false;
  
  // Ensure canvas matches video dimensions
  if (videoElement.videoWidth > 0) {
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;
  }
  
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0];
    const leftEar = { x: lm[132].x * canvasElement.width, y: lm[132].y * canvasElement.height };
    const rightEar = { x: lm[361].x * canvasElement.width, y: lm[361].y * canvasElement.height };
    const neck = { x: lm[152].x * canvasElement.width, y: lm[152].y * canvasElement.height };
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);

    if (earringImg && earringImg.complete) {
      let ew = earDist * 0.25;
      let eh = (earringImg.height/earringImg.width) * ew;
      canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
      canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    if (necklaceImg && necklaceImg.complete) {
      let nw = earDist * 1.2;
      let nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + (earDist*0.2), nw, nh);
    }
  }
  canvasCtx.restore();
});

/* ---------- CAMERA INITIALIZATION (FIXED) ---------- */
async function init() {
  if (!videoElement) return;

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      if (!isProcessingFace) { 
        isProcessingFace = true; 
        await faceMesh.send({image: videoElement}); 
      }
      if (!isProcessingHand) { 
        isProcessingHand = true; 
        await hands.send({image: videoElement}); 
      }
    },
    width: 1280, height: 720
  });

  try {
      await camera.start();
      console.log("Camera successfully initialized.");
  } catch (err) {
      console.error("Camera Error:", err);
      alert("Please ensure camera permissions are granted and you are using HTTPS.");
  }
}

/* ---------- UI NAVIGATION ---------- */
function navigateJewelry(dir) {
  if (!currentType || !preloadedAssets[currentType]) return;
  const list = preloadedAssets[currentType];
  let currentImg = currentType.includes('earrings') ? earringImg : necklaceImg;
  let idx = list.indexOf(currentImg);
  let nextIdx = (idx + dir + list.length) % list.length;
  if (currentType.includes('earrings')) earringImg = list[nextIdx];
  else necklaceImg = list[nextIdx];
}

function selectJewelryType(type) {
  currentType = type;
  preloadCategory(type); 
  const container = document.getElementById('jewelry-options');
  container.innerHTML = '';
  container.style.display = 'flex';
  
  for(let i=1; i<=IMAGE_COUNTS[type]; i++) {
    const btnImg = new Image();
    btnImg.src = `${type}/${i}.png`;
    btnImg.className = "thumb-btn";
    btnImg.onclick = () => {
        const fullImg = preloadedAssets[type][i-1];
        if (type.includes('earrings')) earringImg = fullImg;
        else necklaceImg = fullImg;
    };
    container.appendChild(btnImg);
  }
}

function toggleCategory(cat) {
  document.getElementById('subcategory-buttons').style.display = 'flex';
  const subs = document.querySelectorAll('.subpill');
  subs.forEach(b => b.style.display = b.innerText.toLowerCase().includes(cat) ? 'inline-block' : 'none');
}

/* ---------- TRY ALL FEATURE ---------- */
async function toggleTryAll() {
  if (!currentType) { alert("Select a category first!"); return; }
  autoTryRunning ? stopAutoTry() : startAutoTry();
}

function startAutoTry() {
  autoTryRunning = true; autoSnapshots = []; autoTryIndex = 0;
  const btn = document.getElementById('tryall-btn');
  btn.textContent = "STOP";
  btn.classList.add('active');
  runAutoStep();
}

function stopAutoTry() {
  autoTryRunning = false;
  if (autoTryTimeout) clearTimeout(autoTryTimeout);
  const btn = document.getElementById('tryall-btn');
  btn.textContent = "Try All";
  btn.classList.remove('active');
  if (autoSnapshots.length > 0) showGallery();
}

async function runAutoStep() {
  if (!autoTryRunning) return;
  const assets = preloadedAssets[currentType];
  if (!assets || autoTryIndex >= assets.length) { stopAutoTry(); return; }

  const targetImg = assets[autoTryIndex];
  if (currentType.includes('earrings')) earringImg = targetImg;
  else necklaceImg = targetImg;

  autoTryTimeout = setTimeout(() => {
    captureToGallery();
    autoTryIndex++;
    runAutoStep();
  }, 1800); // 1.8s delay to ensure high-quality placement
}

function captureToGallery() {
  autoSnapshots.push(canvasElement.toDataURL('image/png'));
  const flash = document.getElementById('flash-overlay');
  if(flash) { flash.classList.add('active'); setTimeout(() => flash.classList.remove('active'), 100); }
}

/* ---------- INTERACTIVE GALLERY ---------- */
function showGallery() {
  const modal = document.getElementById('gallery-modal');
  const grid = document.getElementById('gallery-grid');
  grid.innerHTML = '';
  
  autoSnapshots.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src;
    img.className = "gallery-thumb";
    img.onclick = () => { enlargedImg.src = src; };
    if(idx === 0) enlargedImg.src = src;
    grid.appendChild(img);
  });
  modal.style.display = 'flex';
}

function closeGallery() { document.getElementById('gallery-modal').style.display = 'none'; }

/* ZIP DOWNLOAD LOGIC */
async function downloadAllImages() {
  if (typeof JSZip === "undefined") {
      alert("Downloading... (One moment, initializing zip engine)");
  }
  
  const zip = new JSZip();
  autoSnapshots.forEach((data, i) => {
    zip.file(`Aurum_Look_${i+1}.png`, data.split(',')[1], {base64: true});
  });
  
  const content = await zip.generateAsync({type:"blob"});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = "My_Aurum_Collection.zip";
  link.click();
}

async function shareCollection() {
  if (navigator.share) {
    try { await navigator.share({ title: 'Aurum Atelier', text: 'Check out my virtual jewelry looks!', url: window.location.href }); } 
    catch (e) { console.log("Share cancelled."); }
  } else { alert("Please use the Download button; sharing is not supported on this browser."); }
}

/* Window Init */
window.addEventListener('DOMContentLoaded', init);
window.toggleCategory = toggleCategory;
window.selectJewelryType = selectJewelryType;
window.toggleTryAll = toggleTryAll;
window.closeGallery = closeGallery;
window.downloadAllImages = downloadAllImages;
window.shareCollection = shareCollection;