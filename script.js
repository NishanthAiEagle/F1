/* script.js */

const IMAGE_COUNTS = {
  gold_earrings: 5, gold_necklaces: 5,
  diamond_earrings: 5, diamond_necklaces: 6
};

const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('overlay');
const canvasCtx = canvasElement.getContext('2d');

let earringImg = null, necklaceImg = null, currentType = '';
let lastGestureTime = 0;
const GESTURE_COOLDOWN = 1000;

// Performance Flags
let isProcessingHand = false;
let isProcessingFace = false;

/* ---------- HAND DETECTION SETUP ---------- */
const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 0, // 0 is much faster than 1, less likely to "stick"
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

hands.onResults((results) => {
  isProcessingHand = false; // Mark as finished
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;

  const now = Date.now();
  if (now - lastGestureTime < GESTURE_COOLDOWN) return;

  const landmarks = results.multiHandLandmarks[0];
  const indexTip = landmarks[8];
  const indexKnuckle = landmarks[5]; 
  const thumbTip = landmarks[4];
  const pinkyTip = landmarks[20];

  const horizontalDiff = indexTip.x - indexKnuckle.x;

  // 1. Next (Point Right)
  if (horizontalDiff > 0.15) {
    navigateJewelry(1);
    lastGestureTime = now;
  } 
  // 2. Previous (Point Left)
  else if (horizontalDiff < -0.15) {
    navigateJewelry(-1);
    lastGestureTime = now;
  }
  // 3. Palm (Try All) - Checks if fingers are upright
  else if (indexTip.y < landmarks[6].y && pinkyTip.y < landmarks[18].y) {
    if (currentType && typeof toggleTryAll === "function") {
       toggleTryAll();
       lastGestureTime = now;
    }
  }
});

/* ---------- FACE MESH SETUP ---------- */
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({ refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });

faceMesh.onResults((results) => {
  isProcessingFace = false;
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiFaceLandmarks && results.multiFaceLandmarks[0]) {
    const lm = results.multiFaceLandmarks[0];
    const leftEar = { x: lm[132].x * canvasElement.width, y: lm[132].y * canvasElement.height };
    const rightEar = { x: lm[361].x * canvasElement.width, y: lm[361].y * canvasElement.height };
    const neck = { x: lm[152].x * canvasElement.width, y: lm[152].y * canvasElement.height };
    const earDist = Math.hypot(rightEar.x - leftEar.x, rightEar.y - leftEar.y);

    if (earringImg) {
      let ew = earDist * 0.25;
      let eh = (earringImg.height/earringImg.width) * ew;
      canvasCtx.drawImage(earringImg, leftEar.x - ew/2, leftEar.y, ew, eh);
      canvasCtx.drawImage(earringImg, rightEar.x - ew/2, rightEar.y, ew, eh);
    }
    if (necklaceImg) {
      let nw = earDist * 1.2;
      let nh = (necklaceImg.height/necklaceImg.width) * nw;
      canvasCtx.drawImage(necklaceImg, neck.x - nw/2, neck.y + (earDist*0.2), nw, nh);
    }
  }
  canvasCtx.restore();
});

/* ---------- CAMERA LOOP (THROTTLED) ---------- */
async function init() {
  const camera = new Camera(videoElement, {
    onFrame: async () => {
      // Always process Face (for visual smoothness)
      if (!isProcessingFace) {
        isProcessingFace = true;
        await faceMesh.send({image: videoElement});
      }

      // Only process Hands if the last hand-check is done
      if (!isProcessingHand) {
        isProcessingHand = true;
        await hands.send({image: videoElement});
      }
    },
    width: 1280,
    height: 720
  });
  camera.start();
}

/* ---------- UI HELPERS ---------- */
function navigateJewelry(dir) {
  if (!currentType) return;
  const list = [];
  for(let i=1; i<=IMAGE_COUNTS[currentType]; i++) list.push(`${currentType}/${i}.png`);
  
  let currentSrc = currentType.includes('earrings') ? earringImg?.src : necklaceImg?.src;
  let idx = -1;
  if (currentSrc) {
    const filename = currentSrc.split('/').pop();
    idx = list.findIndex(p => p.includes(filename));
  }
  let nextIdx = (idx + dir + list.length) % list.length;
  if (currentType.includes('earrings')) changeEarring(list[nextIdx]);
  else changeNecklace(list[nextIdx]);
}

async function changeEarring(s) { earringImg = await loadImg(s); }
async function changeNecklace(s) { necklaceImg = await loadImg(s); }
function loadImg(src) {
  return new Promise(res => {
    const i = new Image(); i.crossOrigin='anonymous'; i.src=src;
    i.onload=()=>res(i);
  });
}

function toggleCategory(cat) {
  document.getElementById('subcategory-buttons').style.display = 'flex';
  document.getElementById('jewelry-options').style.display = 'none';
}

function selectJewelryType(type) {
  currentType = type;
  const container = document.getElementById('jewelry-options');
  container.innerHTML = '';
  container.style.display = 'flex';
  for(let i=1; i<=IMAGE_COUNTS[type]; i++) {
    const img = document.createElement('img');
    img.src = `${type}/${i}.png`;
    img.style.width = "60px";
    img.onclick = () => type.includes('earrings') ? changeEarring(img.src) : changeNecklace(img.src);
    container.appendChild(img);
  }
}

window.onload = init;
window.toggleCategory = toggleCategory;
window.selectJewelryType = selectJewelryType;