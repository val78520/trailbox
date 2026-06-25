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
               recF: '30:52 (C. Beaugrand, 2026)',     recH: '26:55 (J. Gressier, 2025)' },
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

// Liste blanche des ids d'outils (filtre les ids inconnus, ex. 'riegel' suite à la fusion 04+05).
// 'gpx' n'y figure plus : l'analyse de tracé a sa page dédiée (#/trace), elle n'est plus
// un outil favorisable de la homepage. Les éventuels favoris 'gpx' stockés sont nettoyés.
const VALID_TOOLS = new Set(['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course']);

/* Nettoie une liste de favoris : ids connus, dédupliqués, ordre préservé. */
function sanitizeFavorites(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  return arr.filter(x =>
    typeof x === 'string' && VALID_TOOLS.has(x) && !seen.has(x) && seen.add(x)
  );
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    return sanitizeFavorites(JSON.parse(raw));
  } catch { return []; }
}

function saveFavorites(list) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch {}
}

/* ---- Synchronisation cloud (Supabase) ------------------------------------
   Pour un utilisateur connecté, les favoris sont stockés dans la table
   `user_favorites` (une ligne par utilisateur, tableau ordonné). Le
   localStorage sert de miroir pour un rendu instantané et pour l'anonyme. */
let currentUserId = null;

/* Lit les favoris cloud. Renvoie un tableau, ou null si la lecture a échoué
   (réseau / RLS) — distinct d'un tableau vide qui signifie « aucun favori ». */
async function fetchCloudFavorites(userId) {
  try {
    const { data, error } = await sb
      .from('user_favorites')
      .select('tools')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return sanitizeFavorites(data?.tools || []);
  } catch (err) {
    console.warn('[favoris] lecture cloud impossible', err);
    return null;
  }
}

/* Écrit (upsert) les favoris de l'utilisateur courant. Fire-and-forget. */
async function pushCloudFavorites(userId, list) {
  if (!userId) return false;
  try {
    const { error } = await sb
      .from('user_favorites')
      .upsert({ user_id: userId, tools: list, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('[favoris] écriture cloud impossible', err);
    return false;
  }
}

/* À la connexion : fusionne les favoris épinglés hors-ligne avec le cloud
   (le cloud fait foi, on ajoute les épingles locales non encore synchronisées),
   met à jour le miroir local et pousse la fusion si elle diffère du cloud. */
async function syncFavoritesOnLogin(user) {
  currentUserId = user.id;
  const cloud = await fetchCloudFavorites(user.id);
  if (cloud === null) return; // échec réseau : on ne touche pas au local

  const local  = loadFavorites();
  const merged = sanitizeFavorites([...cloud, ...local]);
  saveFavorites(merged);

  const changed = merged.length !== cloud.length || merged.some((id, i) => id !== cloud[i]);
  if (changed) await pushCloudFavorites(user.id, merged);
}

const toolsGrid = document.getElementById('tools-grid');
const favoritesGrid = document.getElementById('favorites-grid');

/* ---- Accès réservé aux comptes ------------------------------------------- */
/* Outils de la grille visibles uniquement pour un utilisateur connecté.
   L'analyse de tracé (anciennement gated ici) vit désormais sur sa page
   dédiée #/trace, dont l'accès est gardé par le routeur (voir plus bas). */
const GATED_TOOLS = [];
let isAuthenticated = false;
/* L'état de session est asynchrone (Supabase restaure la session après le
   chargement). Tant qu'il n'est pas connu, on n'affiche pas la carte
   d'incitation : sinon elle « flashe » chez un membre déjà connecté,
   visible notamment quand l'URL porte une ancre (#outils) qui scrolle
   directement sur la grille au chargement. */
let authResolved = false;

/* Un outil est disponible s'il n'est pas réservé, ou si on est connecté. */
function isToolAvailable(id) {
  return !GATED_TOOLS.includes(id) || isAuthenticated;
}

/* Carte d'incitation à la création de compte : créée à la demande,
   jamais favorisable, toujours en dernière position, masquée si connecté. */
let signupCtaCard = null;
function getSignupCta() {
  if (signupCtaCard) return signupCtaCard;
  const el = document.createElement('article');
  el.className = 'card card--cta';
  el.id = 'signup-cta';
  el.innerHTML = `
    <div class="card-head">
      <span class="card-num">Compte gratuit</span>
      <h3>Débloque toute la boîte</h3>
      <p class="cta-text">Crée un compte gratuit pour débloquer plus de calculateurs (l'analyse de tracé GPX) et retrouver tes favoris sur tous tes appareils. D'autres outils arrivent.</p>
    </div>
    <button class="btn cta-btn" type="button">Créer mon compte</button>
  `;
  el.querySelector('.cta-btn').addEventListener('click', () => {
    if (typeof openModal === 'function') openModal('signup');
  });
  signupCtaCard = el;
  return el;
}

/* Badge discret « Membre » : signale visuellement les outils débloqués par
   un compte. Injecté une fois sur les cartes réservées, suit GATED_TOOLS. */
function injectPremiumBadge(card) {
  const head = card.querySelector('.card-head');
  if (!head || head.querySelector('.card-premium')) return;
  const badge = document.createElement('span');
  badge.className = 'card-premium';
  badge.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.3 5.9 6.2.4-4.8 4 1.6 6-5.3-3.3-5.3 3.3 1.6-6-4.8-4 6.2-.4z"/></svg>Membre`;
  head.insertBefore(badge, head.firstChild);
}

/* Map id outil → carte (toutes les cartes, peu importe où elles sont) */
const allCards = new Map();
document.querySelectorAll('.card[data-tool]').forEach(card => {
  allCards.set(card.dataset.tool, card);
  injectFavButton(card);
});
GATED_TOOLS.forEach(id => {
  const card = allCards.get(id);
  if (card) injectPremiumBadge(card);
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
  /* On ignore les favoris pointant vers un outil indisponible (réservé + déconnecté) */
  const favs = loadFavorites().filter(isToolAvailable);

  /* Visibilité des outils réservés selon l'état de connexion */
  GATED_TOOLS.forEach(id => {
    const card = allCards.get(id);
    if (card) card.hidden = !isAuthenticated;
  });

  /* Place les cartes favorites dans la grille favoris, dans l'ordre stocké */
  favs.forEach(id => {
    const card = allCards.get(id);
    if (card && card.parentElement !== favoritesGrid) {
      favoritesGrid.appendChild(card);
    }
  });

  /* Renvoie les cartes non favorites dans la grille principale,
     en restaurant l'ordre d'origine (via data-tool) */
  const originalOrder = ['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course'];
  originalOrder
    .filter(id => !favs.includes(id))
    .forEach(id => {
      const card = allCards.get(id);
      if (card) toolsGrid.appendChild(card);
    });

  /* Carte d'incitation : en dernier, uniquement si l'état d'auth est connu
     ET que l'utilisateur est déconnecté. Tant que la session n'est pas
     résolue, on ne l'affiche pas (évite le flash chez un membre connecté). */
  const cta = getSignupCta();
  if (authResolved && !isAuthenticated) toolsGrid.appendChild(cta);
  else cta.remove();

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

/* Réagit aux changements de session (émis par auth.js) */
let wasAuthenticated = false;
let authSeq = 0; // garde anti-race : seul le dernier évènement peut re-rendre
document.addEventListener('trailbox:auth', async e => {
  const seq     = ++authSeq;
  const user    = e.detail && e.detail.user;
  const nowAuth = !!user;
  isAuthenticated = nowAuth;
  authResolved    = true;

  if (!nowAuth) {
    currentUserId = null;
    // Déconnexion réelle (≠ chargement anonyme) : on vide le miroir local
    // pour ne pas laisser les favoris d'un compte sur un appareil partagé.
    if (wasAuthenticated) saveFavorites([]);
  }
  wasAuthenticated = nowAuth;

  setAuthHint(nowAuth); // mémorise l'état pour un affichage optimiste au prochain chargement
  renderFavorites();   // rendu immédiat : carte d'incitation
  updateTraceChrome(); // promo homepage + lien nav (réservés aux membres)

  if (nowAuth) {
    await syncFavoritesOnLogin(user);
    if (seq !== authSeq) return;   // un évènement plus récent a pris la main
    renderFavorites();             // re-rendu une fois la fusion cloud terminée
  }
});

/* Filet de sécurité : si aucun évènement d'auth n'arrive (ex. échec de
   chargement de Supabase), on bascule en « anonyme résolu » pour que la
   carte d'incitation finisse par s'afficher au lieu de rester masquée. */
setTimeout(() => {
  if (!authResolved) { authResolved = true; renderFavorites(); updateTraceChrome(); }
}, 4000);

/* ----------------------------------------------------------------------------
   Mise en avant « Analyse de tracé » (page dédiée trace.html)
   ----------------------------------------------------------------------------
   La promo de la homepage et le lien de nav ne sont visibles que pour un
   membre connecté. La page trace.html garde elle-même son accès.

   Affichage OPTIMISTE : la vérification de session Supabase est asynchrone et
   peut prendre un instant à chaque chargement. Pour éviter que la section
   « clignote » / apparaisse en retard quand un membre revient sur la home, on
   mémorise un drapeau local à la connexion. Au chargement, tant que la vraie
   session n'est pas résolue, on se fie à ce drapeau ; une fois résolue, la
   vérité Supabase prime (et corrige le rare cas d'une session expirée). */
const AUTH_HINT_KEY = 'trailbox.authed.v1';
function hasAuthHint() {
  try { return localStorage.getItem(AUTH_HINT_KEY) === '1'; } catch { return false; }
}
function setAuthHint(on) {
  try {
    if (on) localStorage.setItem(AUTH_HINT_KEY, '1');
    else    localStorage.removeItem(AUTH_HINT_KEY);
  } catch {}
}

function updateTraceChrome() {
  // Avant résolution : on fait confiance au drapeau. Après : à la vérité Supabase.
  const show = authResolved ? isAuthenticated : hasAuthHint();
  const promo = document.getElementById('trace-promo');
  const navLink = document.getElementById('nav-trace');
  if (promo)   promo.hidden = !show;
  if (navLink) navLink.hidden = !show;
}

/* Rendu optimiste immédiat au chargement (avant la réponse de Supabase). */
updateTraceChrome();

function toggleFavorite(id) {
  const favs = loadFavorites();
  const idx = favs.indexOf(id);
  let added;
  if (idx === -1) { favs.push(id); added = true; }
  else { favs.splice(idx, 1); added = false; }
  saveFavorites(favs);
  renderFavorites();
  // Connecté : on propage au cloud en arrière-plan (UI déjà à jour)
  if (isAuthenticated && currentUserId) pushCloudFavorites(currentUserId, favs);
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

