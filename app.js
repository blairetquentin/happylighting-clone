// Vérification Web Bluetooth
if (!navigator.bluetooth) {
  document.body.innerHTML = `
    <div style="padding: 20px; background: #fee; border: 2px solid red; margin: 20px;">
      <h2>❌ Web Bluetooth non disponible</h2>
      <p>Utilisez Chrome ou Edge en HTTPS / localhost</p>
    </div>
  `;
}

// UUIDs
const SERVICE_UUID = '0000ffd5-0000-1000-8000-00805f9b34fb';
const CHAR_UUID    = '0000ffd9-0000-1000-8000-00805f9b34fb';

let parDevices = [];
let currentColor = { r: 255, g: 0, b: 0 };
let audioContext = null;
let analyser = null;
let isListening = false;
let currentSong = null;
let colorIndex = 0;
let lastBeat = 0;
let workLightOn = false;

// Palette de couleurs
const palette = [
  { name: 'Rouge sang',       r: 180, g: 0,   b: 0   },
  { name: 'Orange feu',       r: 255, g: 80,  b: 0   },
  { name: 'Jaune électrique', r: 255, g: 220, b: 0   },
  { name: 'Vert acide',       r: 100, g: 255, b: 0   },
  { name: 'Bleu électrique',  r: 0,   g: 80,  b: 255 },
  { name: 'Violet néon',      r: 150, g: 0,   b: 255 },
  { name: 'Rose flashy',      r: 255, g: 0,   b: 150 },
  { name: 'Rose bonbon',      r: 255, g: 100, b: 180 },
  { name: 'Rose pâle',        r: 255, g: 180, b: 210 },
  { name: 'Rose chaud',       r: 255, g: 20,  b: 100 },
  { name: 'Blanc pur',        r: 255, g: 255, b: 255 },
  { name: 'Cyan néon',        r: 0,   g: 255, b: 255 },
  { name: 'Magenta',          r: 255, g: 0,   b: 255 },
  { name: 'Rouge cramoisi',   r: 220, g: 20,  b: 60  },
  { name: 'Vert néon',        r: 0,   g: 255, b: 100 },
  { name: 'Bleu nuit',        r: 0,   g: 0,   b: 180 },
  { name: 'Vert celtique',    r: 0,   g: 100, b: 40  },
];

// Setlist
const setlist = [
  { name: 'Msct',             colors: ['Violet néon', 'Rose flashy'] },
  { name: 'Lnasp',            colors: ['Rose flashy', 'Violet néon', 'Bleu électrique'] },
  { name: 'Machine à laver',  colors: ['Vert acide', 'Bleu électrique'] },
  { name: 'Tlmsdc',           colors: ['Rose flashy', 'Blanc pur'] },
  { name: 'Halloween',        colors: ['Orange feu', 'Vert acide'] },
  { name: 'Ta gueule à poil', colors: ['Rouge sang', 'Jaune électrique'] },
  { name: 'Super porno',      colors: ['Rose flashy', 'Violet néon', 'Bleu électrique'] },
  { name: 'Ballade',          colors: ['Jaune électrique', 'Orange feu'] },
  { name: 'Discopunk',        colors: ['Blanc pur', 'Bleu électrique'] },
  { name: 'Les films',        colors: ['Rose flashy', 'Rouge sang'] },
  { name: 'Le marin',         colors: ['Bleu électrique', 'Cyan néon', 'Vert celtique'] },
  { name: 'Le rock',          colors: ['Rouge sang', 'Blanc pur'] },
  { name: 'BitureMan',        colors: ['Jaune électrique', 'Orange feu'] },
  { name: 'Le pirate',        colors: ['Bleu nuit', 'Rouge sang'] },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Trouver une couleur par nom
function getColorByName(name) {
  return palette.find(c => c.name === name) || { r: 255, g: 255, b: 255 };
}

// Connexion Bluetooth
async function connectPAR() {
  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });

    document.getElementById('status').textContent = '⏳ Connexion en cours...';

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(CHAR_UUID);

    parDevices.push({ device, characteristic, on: true });
    document.getElementById('status').textContent = `✅ ${parDevices.length} PAR connecté(s)`;
    renderParGrid();

  } catch (err) {
    document.getElementById('status').textContent = '❌ Erreur : ' + err.message;
  }
}

// Envoi couleur à un PAR spécifique
async function setColorToPar(par, r, g, b) {
  if (!par.on) return;
  try {
    const frame = new Uint8Array([0x56, r, g, b, 0x00, 0xF0, 0xAA]);
    await par.characteristic.writeValue(frame);
  } catch (err) {
    console.error('Erreur envoi couleur :', err);
  }
}

// Envoi couleur à tous les PAR
async function setColor(r, g, b) {
  for (const par of parDevices) {
    await setColorToPar(par, r, g, b);
  }
}

// Allumer / éteindre un PAR
async function togglePar(index) {
  const par = parDevices[index];
  par.on = !par.on;

  if (!par.on) {
    try {
      const frame = new Uint8Array([0x56, 0, 0, 0, 0x00, 0xF0, 0xAA]);
      await par.characteristic.writeValue(frame);
    } catch (err) {
      console.error(err);
    }
  } else {
    await setColorToPar(par, currentColor.r, currentColor.g, currentColor.b);
  }

  renderParGrid();
}

// Afficher la grille des PAR
function renderParGrid() {
  const grid = document.getElementById('parGrid');
  grid.innerHTML = '';

  if (parDevices.length === 0) {
    grid.innerHTML = '<p style="color: #555; font-size: 0.75em; letter-spacing: 1px;">Aucun PAR connecté</p>';
    return;
  }

  parDevices.forEach((par, index) => {
    const btn = document.createElement('button');
    btn.className = 'par-btn' + (par.on ? ' par-on' : ' par-off');
    btn.innerHTML = `
      <span>PAR ${index + 1}</span>
      <span>${par.on ? 'ON' : 'OFF'}</span>
    `;
    btn.onclick = () => togglePar(index);
    grid.appendChild(btn);
  });
}

// Choisir une couleur (mode manuel)
function chooseColor(r, g, b, btn) {
  currentColor = { r, g, b };
  document.querySelectorAll('#colorGrid button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  setColor(r, g, b);
}

// Générer la palette
function renderPalette() {
  const grid = document.getElementById('colorGrid');
  palette.forEach(color => {
    const btn = document.createElement('button');
    btn.textContent = color.name;
    btn.style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
    btn.onclick = () => chooseColor(color.r, color.g, color.b, btn);
    grid.appendChild(btn);
  });
}

// Générer la setlist
function renderSetlist() {
  const grid = document.getElementById('setlistGrid');
  setlist.forEach(song => {
    const colors = song.colors.map(name => getColorByName(name));
    const btn = document.createElement('button');
    btn.className = 'song-btn';
    btn.innerHTML = `
      <span class="song-name">${song.name}</span>
      <span class="song-colors">
        ${colors.map(c => `<span class="color-dot" style="background-color: rgb(${c.r},${c.g},${c.b});"></span>`).join('')}
      </span>
    `;
    btn.onclick = () => selectSong(song, btn);
    grid.appendChild(btn);
  });
}

// Sélectionner une chanson
function selectSong(song, btn) {
  currentSong = song;
  document.querySelectorAll('.song-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// Éclairage de travail
async function toggleWorkLight() {
  workLightOn = !workLightOn;
  const btn = document.getElementById('workLightBtn');
  if (workLightOn) {
    await setColor(255, 255, 255);
    btn.style.background = '#ffffff';
    btn.style.color = '#000000';
    btn.style.borderColor = '#ffffff';
    btn.textContent = 'Éclairage de travail — ON';
  } else {
    await setColor(0, 0, 0);
    btn.style.background = 'transparent';
    btn.style.color = '#ffffff';
    btn.style.borderColor = '#333';
    btn.textContent = 'Éclairage de travail';
  }
}

// Démarrer le micro (page manuel)
async function startMic() {
  if (parDevices.length === 0) {
    alert('⚠️ Connecte d\'abord un PAR !');
    return;
  }
  await initMic('micBtn', 'volumeBar', false);
}

// Démarrer le micro (page setlist)
async function startMic2() {
  if (parDevices.length === 0) {
    alert('⚠️ Connecte d\'abord un PAR !');
    return;
  }
  if (!currentSong) {
    alert('⚠️ Sélectionne d\'abord une chanson !');
    return;
  }
  await initMic('micBtn2', 'volumeBar2', true);
}

async function initMic(btnId, barId, isSetlistMode) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    isListening = true;
    document.getElementById(btnId).textContent = 'Stop micro';
    document.getElementById(btnId).onclick = () => stopMic(btnId, barId);

    analyzeBeat(barId, isSetlistMode);

  } catch (err) {
    alert('Erreur micro : ' + err.message);
  }
}

function stopMic(btnId, barId) {
  isListening = false;
  colorIndex = 0;
  if (audioContext) audioContext.close();
  document.getElementById(btnId).textContent = 'Démarrer micro';
  if (btnId === 'micBtn') {
    document.getElementById(btnId).onclick = startMic;
    setColor(currentColor.r, currentColor.g, currentColor.b);
  } else {
    document.getElementById(btnId).onclick = startMic2;
  }
  document.getElementById(barId).style.width = '0%';
}

// Analyse du son
function analyzeBeat(barId, isSetlistMode) {
  if (!isListening) return;

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  const brightness = Math.max(10, Math.min(255, volume * 3));
  const ratio = brightness / 255;

  if (isSetlistMode && currentSong) {
    const colors = currentSong.colors.map(name => getColorByName(name));

    const now = Date.now();
    if (volume > 30 && now - lastBeat > 300) {
      colorIndex = (colorIndex + 1) % colors.length;
      lastBeat = now;
    }

    parDevices.forEach((par, i) => {
      const idx = (colorIndex + (i % colors.length)) % colors.length;
      const c = colors[idx];
      setColorToPar(par, Math.round(c.r * ratio), Math.round(c.g * ratio), Math.round(c.b * ratio));
    });

  } else {
    const r = Math.round(currentColor.r * ratio);
    const g = Math.round(currentColor.g * ratio);
    const b = Math.round(currentColor.b * ratio);
    setColor(r, g, b);
  }

  document.getElementById(barId).style.width = (volume * 3 / 255 * 100) + '%';
  requestAnimationFrame(() => analyzeBeat(barId, isSetlistMode));
}

// Navigation
function showPage(page, e) {
  document.getElementById('page-manual').style.display = page === 'manual' ? 'block' : 'none';
  document.getElementById('page-setlist').style.display = page === 'setlist' ? 'block' : 'none';
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  e.target.classList.add('active');
}

// Init
renderPalette();
renderSetlist();
renderParGrid();
document.getElementById('connect').onclick = connectPAR;
document.getElementById('micBtn').onclick = startMic;
document.getElementById('micBtn2').onclick = startMic2;
document.getElementById('workLightBtn').onclick = toggleWorkLight;