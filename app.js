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
  calcVMATraining();
}
document.getElementById('v-dist').addEventListener('input', calcVMA);

/* ---- Premier calcul au chargement --------------------------------------- */
calcPace(); calcSlope(); calcGAP(); calcTimeUnified(); calcVO2(); calcVMA();


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
    const valid = new Set(['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures']);
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
  const originalOrder = ['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures'];
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
let snackbarTimer = null;

function showSnackbar(title, desc, duration = 4000) {
  snackbarTitle.textContent = title;
  snackbarDesc.textContent = desc;
  snackbar.classList.add('is-visible');
  snackbar.setAttribute('aria-hidden', 'false');
  if (snackbarTimer) clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => {
    snackbar.classList.remove('is-visible');
    snackbar.setAttribute('aria-hidden', 'true');
  }, duration);
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
  const hint = document.getElementById('vt-vma-saved');
  const saved = loadSavedVMA();
  hint.textContent = saved
    ? 'Dernière VMA sauvegardée : ' + fr(saved) + ' km/h'
    : "Aucune VMA sauvegardée pour l'instant.";
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
    calcVMATraining();
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
