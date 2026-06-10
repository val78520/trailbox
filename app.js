/* ============================================================================
   TRAIL BOX — Logique des calculateurs
   7 outils autonomes : allure, pente, GAP (allure ajustée à la pente),
   temps estimé, prédicteur de temps (Riegel), VO2max, VMA + allures.
   Recalcul en direct à chaque saisie (input), formatage en français.
   ========================================================================== */

const fr  = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = id => parseFloat(document.getElementById(id).value);

/* ---- 01 · ALLURE -------------------------------------------------------- */
let paceUnit = 'minkm';

function fmtPace(secPerKm) {
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return m + ':' + String(s).padStart(2, '0');
}

function calcPace() {
  const dist = num('p-dist');
  const h = num('p-h') || 0, m = num('p-m') || 0, s = num('p-s') || 0;
  const totalSec = h * 3600 + m * 60 + s;
  const out = document.getElementById('p-out');
  if (!dist || dist <= 0 || totalSec <= 0) { out.textContent = '—'; return; }
  if (paceUnit === 'minkm') out.textContent = fmtPace(totalSec / dist) + ' /km';
  else out.textContent = fr(dist / (totalSec / 3600)) + ' km/h';
}

document.querySelectorAll('#p-unit button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#p-unit button').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    paceUnit = b.dataset.unit;
    calcPace();
  });
});
['p-dist', 'p-h', 'p-m', 'p-s'].forEach(id => document.getElementById(id).addEventListener('input', calcPace));

/* ---- 02 · PENTE --------------------------------------------------------- */
function calcSlope() {
  const deniv = num('s-deniv'), dist = num('s-dist');
  const out = document.getElementById('s-out'), deg = document.getElementById('s-deg');
  if (isNaN(deniv) || !dist || dist <= 0) { out.textContent = '—'; deg.textContent = ''; return; }
  const pct = (deniv / dist) * 100;
  const angle = Math.atan(deniv / dist) * 180 / Math.PI;
  out.innerHTML = fr(pct) + '&nbsp;%';
  deg.textContent = '≈ ' + Math.round(angle) + '°';
}
['s-deniv', 's-dist'].forEach(id => document.getElementById(id).addEventListener('input', calcSlope));

/* ---- TEMPS DE COURSE (fusion : Riegel + km-effort) ---------------------- */
function fmtHM(totalMin) {
  const t = Math.round(totalMin);
  const h = Math.floor(t / 60), m = t % 60;
  return h > 0 ? (h + ' h ' + String(m).padStart(2, '0')) : (m + ' min');
}

let timeMode = 'ref';  // 'ref' (Riegel + double km-effort) ou 'pace' (allure connue)

function calcTimeUnified() {
  const out = document.getElementById('time-out');
  const sub = document.getElementById('time-sub');

  if (timeMode === 'pace') {
    const pm = num('t-pm') || 0, ps = num('t-ps') || 0;
    const deniv = num('t-deniv') || 0, dist = num('t-dist');
    const paceMin = pm + ps / 60;
    if (!dist || dist <= 0 || paceMin <= 0) { out.textContent = '—'; sub.textContent = ''; return; }
    const kmEffort = dist + deniv / 100;
    out.textContent = '≈ ' + fmtHM(kmEffort * paceMin);
    sub.textContent = 'soit ' + fr(kmEffort) + ' km-effort';
    return;
  }

  // mode 'ref'
  const d1 = num('r-rdist');
  const h = num('r-rh') || 0, m = num('r-rm') || 0, s = num('r-rs') || 0;
  const t1 = h * 3600 + m * 60 + s;
  const dplusRef = num('r-rdplus') || 0;
  const d2 = num('r-tdist');
  const dplus = num('r-tdplus') || 0;
  if (!d1 || d1 <= 0 || t1 <= 0 || !d2 || d2 <= 0) { out.textContent = '—'; sub.textContent = ''; return; }
  // Aplatir la référence (km-effort inverse), projeter via Riegel, puis ré-ajouter le D+ cible.
  // Exposant d'endurance VARIABLE : k croît avec la distance (la fatigue ultra > fatigue route).
  // Évalué à la moyenne géométrique des 2 distances → symétrique (valable dans les deux sens),
  // exact (= intégrale de k(d) = 1,06 + b·ln(d/10)), et k = 1,06 retrouvé si b = 0.
  const b = 0.02;  // sensibilité à la fatigue, figée (calibrée ultra : k ≈ 1,10 à 80 km)
  const kEff = 1.06 + (b / 2) * Math.log(d1 * d2 / 100);
  const t1Flat = t1 / (1 + dplusRef / (100 * d1));
  const t2Flat = t1Flat * Math.pow(d2 / d1, kEff);
  const tFinal = t2Flat * (1 + dplus / (100 * d2));
  out.textContent = '≈ ' + fmtHM(tFinal / 60);
  sub.textContent = 'soit ' + fmtPace(tFinal / d2) + ' /km';
}

document.querySelectorAll('#time-mode button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#time-mode button').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    timeMode = b.dataset.mode;
    document.querySelectorAll('.time-inputs').forEach(el => {
      el.hidden = el.dataset.mode !== timeMode;
    });
    calcTimeUnified();
  });
});
['t-pm', 't-ps', 't-deniv', 't-dist',
 'r-rdist', 'r-rh', 'r-rm', 'r-rs', 'r-rdplus', 'r-tdist', 'r-tdplus']
  .forEach(id => document.getElementById(id).addEventListener('input', calcTimeUnified));

/* ---- 03 · GAP (allure ajustée à la pente — coût de Minetti) ------------- */
/* Coût énergétique de la course en J/(kg·m). i = pente en décimal.
   Polynôme de Minetti (2002), valable ~[-45 %, +45 %]. À plat : C(0) = 3,6. */
function minettiCost(gradePct) {
  const i = Math.max(-45, Math.min(45, gradePct)) / 100;
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3
       + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

let gapMode = 'flat'; // 'flat' = équivalent à plat ; 'climb' = équivalent en montée

function calcGAP() {
  const pm = num('g-pm') || 0, ps = num('g-ps') || 0;
  const grade = num('g-grade');
  const out = document.getElementById('g-out'), sub = document.getElementById('g-sub');
  const paceSec = pm * 60 + ps;
  if (paceSec <= 0 || isNaN(grade)) { out.textContent = '—'; sub.textContent = ''; return; }
  const cost = minettiCost(grade);
  if (cost <= 0) { out.textContent = '—'; sub.textContent = ''; return; }
  /* À effort égal : coût(0) × vitesse_plat = coût(pente) × vitesse_pente.
     - flat  : entrée = allure en montée → allure à plat  = allure × coût(0) ÷ coût(pente)
     - climb : entrée = allure à plat    → allure en montée = allure × coût(pente) ÷ coût(0) */
  const resPaceSec = gapMode === 'flat'
    ? paceSec * 3.6 / cost
    : paceSec * cost / 3.6;
  out.textContent = fmtPace(resPaceSec) + ' /km';
  sub.textContent = 'soit ' + fr(3600 / resPaceSec) + ' km/h';
}

document.querySelectorAll('#gap-mode button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#gap-mode button').forEach(x => x.classList.remove('is-active'));
    b.classList.add('is-active');
    gapMode = b.dataset.mode;
    document.getElementById('g-pace-label').textContent =
      gapMode === 'flat' ? 'Allure en montée (min / km)' : 'Allure à plat (min / km)';
    document.getElementById('g-result-label').textContent =
      gapMode === 'flat' ? 'Équivalent à plat' : 'Équivalent en montée';
    calcGAP();
  });
});
['g-pm', 'g-ps', 'g-grade'].forEach(id => document.getElementById(id).addEventListener('input', calcGAP));

/* ---- VO2max (≈ 3,5 × VMA) ----------------------------------------------- */
function calcVO2() {
  const vma = num('o-vma');
  const out = document.getElementById('o-out');
  if (!vma || vma <= 0) { out.textContent = '—'; return; }
  out.textContent = fr(vma * 3.5);
}
document.getElementById('o-vma').addEventListener('input', calcVO2);

/* ---- 07 · VMA (demi-Cooper) + allures d'entraînement -------------------- */
const VMA_ZONES = [60, 80, 90, 100, 105];

/* Formate un temps total en h:mm:ss (au-delà d'une heure) ou m:ss. */
function fmtTime(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec - h * 3600) / 60);
  const s = sec - h * 3600 - m * 60;
  if (h > 0) {
    return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }
  return m + ':' + String(s).padStart(2, '0');
}

function calcVMATraining() {
  const vma = num('vt-vma');
  const dist = num('vt-dist');  // distance de la séance en mètres
  VMA_ZONES.forEach(p => {
    const time = document.getElementById('vt-' + p);
    const sub = document.getElementById('vt-' + p + '-p');
    if (!vma || vma <= 0 || !dist || dist <= 0) {
      time.textContent = '—'; sub.textContent = '';
      return;
    }
    const speed = vma * p / 100;          // km/h à cette intensité
    const secPerKm = 3600 / speed;        // allure en s/km
    time.textContent = fmtTime(secPerKm * dist / 1000);  // temps sur la distance
    sub.textContent = fmtPace(secPerKm) + ' /km';
  });
}
document.getElementById('vt-vma').addEventListener('input', calcVMATraining);
document.getElementById('vt-dist').addEventListener('input', calcVMATraining);

function calcVMA() {
  const dist = num('v-dist');
  const out = document.getElementById('v-out');
  const pace = document.getElementById('v-pace');
  if (!dist || dist <= 0) { out.textContent = '—'; pace.textContent = ''; return; }
  const vma = dist / 100;
  out.innerHTML = fr(vma) + '&nbsp;km/h';
  pace.textContent = 'soit ' + fmtPace(3600 / vma) + ' /km';
  document.getElementById('vt-vma').value = vma;  // chaînage : le test pilote les allures
  document.getElementById('rc-vma').value = vma;  // … et les allures de course
  calcVMATraining();
  calcCourse();
}
document.getElementById('v-dist').addEventListener('input', calcVMA);

/* ---- 08 · ALLURES DE COURSE (références par distance) ------------------- */
/* Pour chaque distance : % de VMA tenable par un coureur bien entraîné +
   record de France (H/F) à titre de comparaison.
   ⚠️ Records = valeurs best-effort À VÉRIFIER avant mise en prod. */
const COURSE_DISTANCES = {
  '2000':    { km: 2,       pctLow: 98, pctHigh: 102,
               recF: '5:32 (A. Guillemot, 2024)', recH: '4:51 (M. Baala, 1999)' },
  '5000':    { km: 5,       pctLow: 92, pctHigh: 94,
               recF: '14:40 (C. Beaugrand, 2026)',  recH: '12:51 (J. Gressier, 2025)' },
  '10000':   { km: 10,      pctLow: 88, pctHigh: 92,
               recF: '31:35 (C. Daunay, 2012)',     recH: '26:55 (J. Gressier, 2025)' },
  'semi':    { km: 21.0975, pctLow: 84, pctHigh: 86,
               recF: '1:07:46 (M. Woldu, 2023)',    recH: '59:33 (J. Gressier, 2024)' },
  'marathon':{ km: 42.195,  pctLow: 80, pctHigh: 82,
               recF: '2:23:13 (M. Woldu, 2025)',    recH: '2:05:22 (M. Amdouni, 2023)' },
};

function calcCourse() {
  const vma = num('rc-vma');
  const key = document.getElementById('rc-dist').value;
  const d = COURSE_DISTANCES[key];
  const time = document.getElementById('rc-time');
  const pace = document.getElementById('rc-pace');
  const reco = document.getElementById('rc-reco');
  const record = document.getElementById('rc-record');
  if (!vma || vma <= 0 || !d) {
    time.textContent = '—'; pace.textContent = '';
    reco.textContent = ''; record.textContent = '—';
    return;
  }
  // % haut → plus rapide → temps bas ; % bas → plus lent → temps haut
  const speedFast = vma * d.pctHigh / 100;   // km/h
  const speedSlow = vma * d.pctLow / 100;
  const tLow  = d.km / speedFast * 3600;     // s (temps bas)
  const tHigh = d.km / speedSlow * 3600;     // s (temps haut)
  const paceFast = 3600 / speedFast;         // s/km (allure basse)
  const paceSlow = 3600 / speedSlow;
  time.textContent = fmtTime(tLow) + ' – ' + fmtTime(tHigh);
  pace.textContent = 'soit ' + fmtPace(paceFast) + ' – ' + fmtPace(paceSlow) + ' /km';
  reco.innerHTML = 'couru à ' + d.pctLow + '–' + d.pctHigh + '&nbsp;% de la VMA';
  record.innerHTML =
    '<span class="rc-record-line">F&nbsp;· ' + d.recF + '</span>' +
    '<span class="rc-record-line">H&nbsp;· ' + d.recH + '</span>';
}
document.getElementById('rc-vma').addEventListener('input', calcCourse);
document.getElementById('rc-dist').addEventListener('change', calcCourse);

/* ---- Premier calcul au chargement --------------------------------------- */
calcPace(); calcSlope(); calcGAP(); calcTimeUnified(); calcVO2(); calcVMA(); calcCourse();


/* ============================================================================
   FAVORIS — épinglage d'outils + persistance localStorage + snackbar
   ========================================================================== */

const FAV_KEY = 'trailbox.favorites.v1';
const STAR_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

const SKELETON_HTML = `
  <div class="fav-skeleton" id="fav-skeleton">
    <div class="fav-skeleton-head">
      <span class="skel skel--num"></span>
      <span class="skel skel--title"></span>
      <span class="skel skel--line"></span>
      <span class="skel skel--line short"></span>
    </div>
    <div class="fav-skeleton-fields">
      <span class="skel skel--field"></span>
      <span class="skel skel--field"></span>
    </div>
    <span class="skel skel--result"></span>
    <div class="fav-skeleton-hint">
      ${STAR_SVG}
      <span>Clique sur l'étoile d'un outil pour le ranger ici.</span>
    </div>
  </div>
`;

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    // Filtre les ids inconnus (ex. 'riegel' suite à la fusion 04+05).
    const valid = new Set(['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course', 'gpx']);
    return arr.filter(x => typeof x === 'string' && valid.has(x));
  } catch { return []; }
}

function saveFavorites(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}

const toolsGrid = document.getElementById('tools-grid');
const favoritesGrid = document.getElementById('favorites-grid');

/* Map id outil → carte (toutes les cartes, peu importe où elles sont) */
const allCards = new Map();
document.querySelectorAll('.card[data-tool]').forEach(card => {
  allCards.set(card.dataset.tool, card);
  injectFavButton(card);
});

function injectFavButton(card) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fav-btn';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Ajouter aux favoris');
  btn.innerHTML = STAR_SVG;
  btn.addEventListener('click', () => toggleFavorite(card.dataset.tool));
  card.appendChild(btn);
}

function setButtonState(card, isFav) {
  const btn = card.querySelector('.fav-btn');
  if (!btn) return;
  btn.setAttribute('aria-pressed', isFav ? 'true' : 'false');
  btn.setAttribute('aria-label', isFav ? 'Retirer des favoris' : 'Ajouter aux favoris');
}

function renderFavorites() {
  const favs = loadFavorites();

  /* Place les cartes favorites dans la grille favoris, dans l'ordre stocké */
  favs.forEach(id => {
    const card = allCards.get(id);
    if (card && card.parentElement !== favoritesGrid) {
      favoritesGrid.appendChild(card);
    }
  });

  /* Renvoie les cartes non favorites dans la grille principale,
     en restaurant l'ordre d'origine (via data-tool) */
  const originalOrder = ['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course', 'gpx'];
  originalOrder
    .filter(id => !favs.includes(id))
    .forEach(id => {
      const card = allCards.get(id);
      if (card) toolsGrid.appendChild(card);
    });

  /* Skeleton si aucun favori */
  const existingSkel = document.getElementById('fav-skeleton');
  if (favs.length === 0) {
    if (!existingSkel) favoritesGrid.insertAdjacentHTML('beforeend', SKELETON_HTML);
  } else if (existingSkel) {
    existingSkel.remove();
  }

  /* État des boutons */
  allCards.forEach((card, id) => setButtonState(card, favs.includes(id)));
}

function toggleFavorite(id) {
  const favs = loadFavorites();
  const idx = favs.indexOf(id);
  let added;
  if (idx === -1) { favs.push(id); added = true; }
  else { favs.splice(idx, 1); added = false; }
  saveFavorites(favs);
  renderFavorites();
  if (added) {
    showSnackbar('Outil favorisé', "Il t'attend désormais en haut de page.");
  } else {
    showSnackbar('Outil supprimé des favoris', 'Il a retrouvé sa place dans la boîte à outils.');
  }
}

/* ---- Snackbar (réutilisable) -------------------------------------------- */
const snackbar = document.getElementById('snackbar');
const snackbarTitle = document.getElementById('snackbar-title');
const snackbarDesc = document.getElementById('snackbar-desc');
const snackbarIcon = snackbar.querySelector('.snackbar-icon');
let snackbarTimer = null;

/* Icônes par variante (le défaut = étoile, conservée pour les favoris). */
const SNACK_ICONS = {
  default: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  loading: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
};

/* opts : nombre (durée, rétro-compatible) ou objet { duration, variant, sticky }. */
function showSnackbar(title, desc, opts = {}) {
  if (typeof opts === 'number') opts = { duration: opts };
  const { duration = 4000, variant = 'default', sticky = false } = opts;
  snackbarTitle.textContent = title;
  snackbarDesc.textContent = desc;
  snackbar.classList.remove('snackbar--error', 'snackbar--loading');
  if (variant === 'error') snackbar.classList.add('snackbar--error');
  if (variant === 'loading') snackbar.classList.add('snackbar--loading');
  if (snackbarIcon) snackbarIcon.innerHTML = SNACK_ICONS[variant] || SNACK_ICONS.default;
  snackbar.classList.add('is-visible');
  snackbar.setAttribute('aria-hidden', 'false');
  if (snackbarTimer) clearTimeout(snackbarTimer);
  if (!sticky) {
    snackbarTimer = setTimeout(() => {
      snackbar.classList.remove('is-visible');
      snackbar.setAttribute('aria-hidden', 'true');
    }, duration);
  }
}

/* ============================================================================
   VMA SAUVEGARDÉE — persistance localStorage de la VMA du test demi-Cooper
   ========================================================================== */
const VMA_KEY = 'trailbox.vma.v1';

function loadSavedVMA() {
  try {
    const raw = localStorage.getItem(VMA_KEY);
    if (!raw) return null;
    const v = parseFloat(raw);
    return (isFinite(v) && v > 0) ? v : null;
  } catch { return null; }
}

function updateSavedVMAHint() {
  const saved = loadSavedVMA();
  const txt = saved
    ? 'Dernière VMA sauvegardée : ' + fr(saved) + ' km/h'
    : "Aucune VMA sauvegardée pour l'instant.";
  ['vt-vma-saved', 'rc-vma-saved'].forEach(id => {
    const hint = document.getElementById(id);
    if (hint) hint.textContent = txt;
  });
}

function saveCurrentVMA() {
  const dist = num('v-dist');
  if (!dist || dist <= 0) return;
  const vma = dist / 100;
  try { localStorage.setItem(VMA_KEY, String(vma)); } catch {}
  updateSavedVMAHint();
  showSnackbar(
    'VMA sauvegardée',
    'Elle sera présente dans les différents champs lors de ta prochaine visite',
    5000
  );
}
document.getElementById('vma-save').addEventListener('click', saveCurrentVMA);

/* Au chargement : pré-remplit la VMA utilisée avec la dernière sauvegarde */
(function restoreSavedVMA() {
  const saved = loadSavedVMA();
  if (saved) {
    document.getElementById('vt-vma').value = saved;
    document.getElementById('rc-vma').value = saved;
    calcVMATraining();
    calcCourse();
  }
  updateSavedVMAHint();
})();

renderFavorites();

/* Rend chaque bloc "La théorie" repliable, masqué par défaut */
(function setupTheoryToggles() {
  const CHEVRON = '<svg class="note-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  document.querySelectorAll('.note').forEach((note, i) => {
    const tag = note.querySelector('.note-tag');
    if (!tag) return;
    const content = Array.from(note.children).filter((el) => el !== tag);

    // Bouton (tag + icône) qui pilote l'ouverture/fermeture
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'note-toggle';
    btn.setAttribute('aria-expanded', 'false');
    const panelId = 'note-panel-' + i;
    btn.setAttribute('aria-controls', panelId);
    tag.before(btn);
    const chevron = document.createElement('span');
    chevron.innerHTML = CHEVRON;
    btn.append(tag, chevron.firstChild);

    // Conteneur repliable (technique grid 0fr -> 1fr pour une transition fluide)
    const collapse = document.createElement('div');
    collapse.className = 'note-collapse';
    collapse.id = panelId;
    const inner = document.createElement('div');
    inner.append(...content);
    collapse.append(inner);
    btn.after(collapse);

    btn.addEventListener('click', () => {
      const open = note.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
})();


/* ============================================================================
   ANALYSE DE TRACÉ (GPX) — parsing client-side, profil, allure à la pente
   100 % navigateur : le fichier ne quitte jamais la machine.
   ========================================================================== */
(function setupGPX() {
  const card    = document.querySelector('.card--gpx');
  if (!card) return;
  const drop    = document.getElementById('gpx-drop');
  const fileIn  = document.getElementById('gpx-file');
  const elDplus = document.getElementById('gpx-dplus');
  const elDmin  = document.getElementById('gpx-dminus');
  const elDist  = document.getElementById('gpx-dist');
  const elDistS = document.getElementById('gpx-dist-sub');
  const inner   = document.getElementById('gpx-chart-inner');
  const svg     = document.getElementById('gpx-svg');
  const areaEl  = document.getElementById('gpx-area');
  const lineEl  = document.getElementById('gpx-line');
  const cursor  = document.getElementById('gpx-cursor');
  const dot     = document.getElementById('gpx-dot');
  const tip     = document.getElementById('gpx-tip');
  const tipKm   = document.getElementById('gpx-tip-km');
  const tipAlt  = document.getElementById('gpx-tip-alt');
  const tipSlope= document.getElementById('gpx-tip-slope');
  const tipPace = document.getElementById('gpx-tip-pace');
  const paceHint= document.getElementById('gpx-pace-hint');

  const VB_W = 1000, VB_H = 260;          // repère du viewBox SVG
  const intFmt = n => Math.round(n).toLocaleString('fr-FR');
  const C0 = minettiCost(0);              // coût à plat (= 3,6)

  let track = null;                        // données calculées de la trace

  /* --- Géométrie ---------------------------------------------------------- */
  function haversine(a, b) {
    const R = 6371000, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2
            + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* Moyenne glissante (fenêtre impaire) — lisse le bruit d'altitude. */
  function smooth(values, win) {
    const n = values.length, out = new Array(n), half = (win - 1) / 2;
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) { s += values[j]; c++; }
      out[i] = s / c;
    }
    return out;
  }

  /* --- Parsing GPX -------------------------------------------------------- */
  function parseGPX(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Fichier illisible (XML invalide).');
    let nodes = [...doc.querySelectorAll('trkpt')];
    if (!nodes.length) nodes = [...doc.querySelectorAll('rtept')];
    const pts = [];
    let withEle = 0;
    for (const p of nodes) {
      const lat = parseFloat(p.getAttribute('lat'));
      const lon = parseFloat(p.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const eleEl = p.querySelector('ele');
      const ele = eleEl ? parseFloat(eleEl.textContent) : NaN;
      if (isFinite(ele)) withEle++;
      pts.push({ lat, lon, ele });
    }
    if (pts.length < 2) throw new Error('Aucune trace exploitable dans ce fichier.');
    if (withEle < pts.length * 0.5) throw new Error("Pas de données d'altitude dans ce GPX.");
    return pts;
  }

  /* --- Calculs (distance, D+/D-, pentes, profil) -------------------------- */
  function analyse(pts) {
    const n = pts.length;
    // Distance cumulée (m) + interpolation des altitudes manquantes.
    const cum = new Array(n).fill(0);
    const eleRaw = new Array(n);
    for (let i = 0; i < n; i++) eleRaw[i] = isFinite(pts[i].ele) ? pts[i].ele : NaN;
    for (let i = 0; i < n; i++) {
      if (!isFinite(eleRaw[i])) {
        let a = i - 1; while (a >= 0 && !isFinite(eleRaw[a])) a--;
        let b = i + 1; while (b < n && !isFinite(eleRaw[b])) b++;
        if (a < 0 && b < n) eleRaw[i] = eleRaw[b];
        else if (b >= n && a >= 0) eleRaw[i] = eleRaw[a];
        else if (a >= 0 && b < n) eleRaw[i] = eleRaw[a] + (eleRaw[b] - eleRaw[a]) * (i - a) / (b - a);
        else eleRaw[i] = 0;
      }
    }
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + haversine(pts[i - 1], pts[i]);
    const total = cum[n - 1];                         // distance réelle (m)
    const ele = smooth(eleRaw, 5);                    // altitude lissée

    // D+ / D- par seuil d'hystérésis (~3 m) sur l'altitude lissée.
    const THRESH = 3;
    let dPlus = 0, dMinus = 0, ref = ele[0];
    for (let i = 1; i < n; i++) {
      const diff = ele[i] - ref;
      if (diff >= THRESH) { dPlus += diff; ref = ele[i]; }
      else if (diff <= -THRESH) { dMinus += -diff; ref = ele[i]; }
    }

    // Pente locale lissée (fenêtre ~50 m) en chaque point.
    const HALF = 25;
    const grade = new Array(n);
    for (let i = 0; i < n; i++) {
      let a = i; while (a > 0 && cum[i] - cum[a] < HALF) a--;
      let b = i; while (b < n - 1 && cum[b] - cum[i] < HALF) b++;
      const dx = cum[b] - cum[a];
      grade[i] = dx > 0.5 ? (ele[b] - ele[a]) / dx * 100 : 0;
    }

    // Distance-effort cumulée : Σ segmentᵢ × coût(penteᵢ) / coût(0)  (en km).
    // fbar = position (fraction de distance) moyenne pondérée par l'effort :
    // sert d'axe neutre au split pour que le temps total reste = temps visé.
    let effort = 0, fbarNum = 0;
    for (let i = 1; i < n; i++) {
      const seg = cum[i] - cum[i - 1];
      const w = (seg / 1000) * (minettiCost(grade[i]) / C0);
      effort += w;
      fbarNum += w * (total > 0 ? cum[i] / total : 0);
    }
    const fbar = effort > 0 ? fbarNum / effort : 0.5;

    return { n, cum, ele, grade, total, dPlus, dMinus, effort, fbar, minE: Math.min(...ele), maxE: Math.max(...ele) };
  }

  /* --- Rendu du profil (SVG) ---------------------------------------------- */
  function yOf(e) {
    if (track.maxE === track.minE) return VB_H / 2;
    return VB_H - 6 - (e - track.minE) / (track.maxE - track.minE) * (VB_H - 12);
  }
  function xOf(d) { return track.total > 0 ? (d / track.total) * VB_W : 0; }

  function renderChart() {
    const { n, cum, ele } = track;
    const STEP = Math.max(1, Math.floor(n / 600));    // décimation pour le tracé
    let line = '', area = '';
    for (let i = 0; i < n; i += STEP) {
      const x = xOf(cum[i]).toFixed(1), y = yOf(ele[i]).toFixed(1);
      line += (i === 0 ? 'M' : 'L') + x + ' ' + y + ' ';
    }
    // garantit le dernier point
    const lx = xOf(cum[n - 1]).toFixed(1), ly = yOf(ele[n - 1]).toFixed(1);
    line += 'L' + lx + ' ' + ly;
    area = line + ' L' + lx + ' ' + VB_H + ' L0 ' + VB_H + ' Z';
    lineEl.setAttribute('d', line);
    areaEl.setAttribute('d', area);
  }

  /* --- Allure cible à effort constant ------------------------------------- */
  function targetTimeSec() {
    const h = parseFloat(document.getElementById('gpx-th').value) || 0;
    const m = parseFloat(document.getElementById('gpx-tm').value) || 0;
    const s = parseFloat(document.getElementById('gpx-ts').value) || 0;
    return h * 3600 + m * 60 + s;
  }
  // Allure plate équivalente P (s/km) : temps visé ÷ distance-effort.
  function flatPace() {
    const t = targetTimeSec();
    if (!track || track.effort <= 0 || t <= 0) return null;
    return t / track.effort;
  }
  // Split : pente d'allure a = curseur / 100 (a>0 = positif, départ rapide).
  function splitSlope() {
    return (parseFloat(document.getElementById('gpx-split-input').value) || 0) / 100;
  }
  // Facteur de split en une fraction de distance f, neutre en moyenne d'effort
  // (centré sur fbar) → le temps total reste exactement le temps visé.
  function splitFactor(f) {
    return 1 + splitSlope() * (f - track.fbar);
  }
  // Allure cible (s/km) : P × coût(pente)/coût(0) × facteur de split.
  function paceAt(g, f) {
    const P = flatPace();
    return P == null ? null : P * (minettiCost(g) / C0) * splitFactor(f);
  }

  function updateHint() {
    const P = flatPace();
    paceHint.textContent = P == null
      ? "Renseigne un temps visé pour obtenir l'allure adaptée à chaque pente."
      : 'Allure plate équivalente : ' + fmtPace(P) + ' /km — au survol, on l\'ajuste à la pente.';
  }

  /* --- Interaction au survol ---------------------------------------------- */
  function nearestIndex(distM) {
    const cum = track.cum;
    let lo = 0, hi = track.n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < distM) lo = mid + 1; else hi = mid; }
    if (lo > 0 && (cum[lo] - distM) > (distM - cum[lo - 1])) lo--;
    return lo;
  }
  function onMove(ev) {
    if (!track) return;
    const rect = svg.getBoundingClientRect();
    const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
    let frac = (clientX - rect.left) / rect.width;
    frac = Math.max(0, Math.min(1, frac));
    const i = nearestIndex(frac * track.total);
    const xPx = xOf(track.cum[i]);
    const yPx = yOf(track.ele[i]);
    cursor.setAttribute('x1', xPx); cursor.setAttribute('x2', xPx);
    dot.setAttribute('cx', xPx); dot.setAttribute('cy', yPx);
    const g = track.grade[i];
    const pace = paceAt(g, track.total > 0 ? track.cum[i] / track.total : 0);
    tipKm.textContent = (track.cum[i] / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    tipAlt.textContent = intFmt(track.ele[i]) + ' m';
    tipSlope.textContent = (g >= 0 ? '+' : '') + g.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    tipPace.textContent = pace == null ? '—' : fmtPace(pace) + ' /km';
    // position du tooltip + recadrage aux bords pour éviter le débordement
    tip.style.left = (frac * 100) + '%';
    const tx = frac < 0.18 ? '0' : frac > 0.82 ? '-100%' : '-50%';
    tip.style.transform = 'translate(' + tx + ', -8px)';
    inner.classList.add('is-hover');
  }
  function onLeave() { inner.classList.remove('is-hover'); }

  inner.addEventListener('mousemove', onMove);
  inner.addEventListener('mouseleave', onLeave);
  inner.addEventListener('touchstart', onMove, { passive: true });
  inner.addEventListener('touchmove', onMove, { passive: true });
  inner.addEventListener('touchend', onLeave);

  ['gpx-th', 'gpx-tm', 'gpx-ts'].forEach(id =>
    document.getElementById(id).addEventListener('input', updateHint));

  // Slider negative / positive split
  const splitInput = document.getElementById('gpx-split-input');
  const splitVal   = document.getElementById('gpx-split-val');
  function updateSplitLabel() {
    const p = Math.round(parseFloat(splitInput.value) || 0);
    splitVal.textContent = p === 0 ? 'Régulier'
      : p > 0 ? 'Positif · ' + p + ' %'
      : 'Négatif · ' + Math.abs(p) + ' %';
  }
  splitInput.addEventListener('input', updateSplitLabel);
  updateSplitLabel();

  /* --- Chargement d'un fichier -------------------------------------------- */
  function handleFile(file) {
    if (!file) return;
    if (!/\.gpx$/i.test(file.name)) {
      showSnackbar('Mauvais format', 'Il me faut un fichier .gpx, pas autre chose.', { variant: 'error' });
      return;
    }
    showSnackbar('Analyse en cours…', 'On déplie ta trace point par point.', { variant: 'loading', sticky: true });
    const reader = new FileReader();
    reader.onerror = () => showSnackbar('Lecture impossible', "Le fichier n'a pas pu être lu.", { variant: 'error' });
    reader.onload = () => {
      try {
        const pts = parseGPX(reader.result);
        track = analyse(pts);
        elDplus.textContent = 'D+ ' + intFmt(track.dPlus) + ' m';
        elDmin.textContent  = 'D- ' + intFmt(track.dMinus) + ' m';
        elDist.textContent  = (track.total / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
        elDistS.textContent = 'distance réelle';
        card.classList.remove('is-empty');
        renderChart();
        updateHint();
        showSnackbar('Trace importée', track.n.toLocaleString('fr-FR') + ' points analysés. Survole le profil.', { variant: 'success' });
      } catch (err) {
        showSnackbar('Import impossible', err.message || 'Fichier GPX invalide.', { variant: 'error' });
      }
    };
    reader.readAsText(file);
  }

  /* --- Dépôt & sélection -------------------------------------------------- */
  drop.addEventListener('click', () => fileIn.click());
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileIn.click(); }
  });
  fileIn.addEventListener('change', () => handleFile(fileIn.files[0]));
  ['dragenter', 'dragover'].forEach(ev =>
    drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'dragend'].forEach(ev =>
    drop.addEventListener(ev, () => drop.classList.remove('is-drag')));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('is-drag');
    handleFile(e.dataTransfer.files[0]);
  });
})();
