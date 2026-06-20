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
const VALID_TOOLS = new Set(['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course', 'gpx']);

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
/* Outils visibles uniquement pour un utilisateur connecté. */
const GATED_TOOLS = ['gpx'];
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
  const originalOrder = ['pace', 'slope', 'gap', 'time', 'vo2', 'vma', 'allures', 'course', 'gpx'];
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

  renderFavorites(); // rendu immédiat : gating GPX + carte d'incitation

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
  if (!authResolved) { authResolved = true; renderFavorites(); }
}, 4000);

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
  const plot    = document.getElementById('gpx-plot');
  const svg     = document.getElementById('gpx-svg');
  const areaEl  = document.getElementById('gpx-area');
  const lineEl  = document.getElementById('gpx-line');
  const paceLineEl = document.getElementById('gpx-pace-line');
  const axisPaceEl = document.getElementById('gpx-axis-pace');
  const axisEleEl  = document.getElementById('gpx-axis-ele');
  const cursor  = document.getElementById('gpx-cursor');
  const dot     = document.getElementById('gpx-dot');
  const tip     = document.getElementById('gpx-tip');
  const tipKm   = document.getElementById('gpx-tip-km');
  const tipAlt  = document.getElementById('gpx-tip-alt');
  const tipSlope= document.getElementById('gpx-tip-slope');
  const tipPace = document.getElementById('gpx-tip-pace');
  const tipPaceLabel = document.getElementById('gpx-tip-pace-label');
  const paceHint= document.getElementById('gpx-pace-hint');
  const mapEl   = document.getElementById('gpx-map');

  const VB_W = 1000, VB_H = 260;          // repère du viewBox SVG
  const intFmt = n => Math.round(n).toLocaleString('fr-FR');
  const C0 = minettiCost(0);              // coût à plat (= 3,6)

  let track = null;                        // données calculées de la trace
  let pacingOn = false;                     // calcul d'allure cible activé (switch)
  let ravitos = [];                        // [{ id, distM, stopSec }] points d'arrêt
  let ravitoSeq = 0;                        // identifiant incrémental

  const RAVITO_COLOR = '#E8590C';          // ambre — distinct du tracé (bleu)
  const totalStopSec = () => ravitos.reduce((s, r) => s + r.stopSec, 0);
  const stopsUpTo = distM => ravitos.reduce((s, r) => s + (r.distM <= distM ? r.stopSec : 0), 0);

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
    const dPlusCum = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const diff = ele[i] - ref;
      if (diff >= THRESH) { dPlus += diff; ref = ele[i]; }
      else if (diff <= -THRESH) { dMinus += -diff; ref = ele[i]; }
      dPlusCum[i] = dPlus;
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

    // Ratio de coût par point (vs plat), fortement lissé → tendance d'allure.
    const ratio = grade.map(g => minettiCost(g) / C0);
    let win = Math.max(5, Math.round(n * 0.05));
    if (win % 2 === 0) win++;
    const ratioTrend = smooth(ratio, win);

    const coords = pts.map(p => [p.lat, p.lon]);

    return { n, cum, ele, grade, total, dPlus, dMinus, dPlusCum, effort, fbar, ratioTrend, coords,
             minE: Math.min(...ele), maxE: Math.max(...ele) };
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

  // Axe altitude (droite) : haut = point le plus haut, bas = le plus bas.
  function renderEleAxis() {
    if (!track) { axisEleEl.innerHTML = ''; return; }
    let html = '';
    for (let k = 0; k < 5; k++) {
      const v = track.maxE - (track.maxE - track.minE) * k / 4;
      html += '<span>' + intFmt(v) + ' m</span>';
    }
    axisEleEl.innerHTML = html;
  }

  // Allure moyenne par kilomètre (intègre pente Minetti + split) — sert à la
  // courbe en escalier et au tooltip. Mise à jour à chaque rendu de la courbe.
  let kmPace = [];
  function computeKmPace() {
    kmPace = [];
    const P = flatPace();
    if (!track || P == null) return;
    computeClimbBar();
    const { n, cum, grade, total } = track;
    const nb = Math.max(1, Math.ceil(total / 1000));
    const bTime = new Array(nb).fill(0);
    const bDist = new Array(nb).fill(0);
    for (let i = 1; i < n; i++) {
      const seg = cum[i] - cum[i - 1];
      const mid = (cum[i] + cum[i - 1]) / 2;
      let b = Math.floor(mid / 1000); if (b >= nb) b = nb - 1;
      bTime[b] += (seg / 1000) * P * (minettiCost(grade[i]) / C0) * splitFactor(mid / total) * climbMod(grade[i]);
      bDist[b] += seg;
    }
    kmPace = bTime.map((t, k) => bDist[k] > 0 ? t / (bDist[k] / 1000) : null);
  }

  // Courbe d'allure en escalier : un palier = allure moyenne du kilomètre.
  function renderPaceCurve() {
    if (!track) return;
    const P = flatPace();
    if (P == null) { paceLineEl.setAttribute('d', ''); axisPaceEl.innerHTML = ''; kmPace = []; return; }
    computeKmPace();
    const { total } = track;
    const nb = kmPace.length;
    let pMin = Infinity, pMax = -Infinity;
    for (const p of kmPace) { if (p == null) continue; if (p < pMin) pMin = p; if (p > pMax) pMax = p; }
    if (!isFinite(pMin)) { pMin = 0; pMax = 1; }
    if (pMax - pMin < 1) { const mid = (pMax + pMin) / 2; pMin = mid - 15; pMax = mid + 15; }
    const yP = p => 6 + (p - pMin) / (pMax - pMin) * (VB_H - 12);  // pMin (rapide) en haut
    let d = '';
    for (let k = 0; k < nb; k++) {
      if (kmPace[k] == null) continue;
      const x0 = xOf(k * 1000), x1 = xOf(Math.min((k + 1) * 1000, total));
      const y = yP(kmPace[k]).toFixed(1);
      d += (d === '' ? 'M' : 'L') + x0.toFixed(1) + ' ' + y + ' L' + x1.toFixed(1) + ' ' + y + ' ';
    }
    paceLineEl.setAttribute('d', d.trim());
    let html = '';
    for (let k = 0; k < 5; k++) html += '<span>' + fmtPace(pMin + (pMax - pMin) * k / 4) + '</span>';
    axisPaceEl.innerHTML = html;
  }

  /* --- Temps de passage (¼, ½, ¾) ---------------------------------------- */
  // Temps cumulé à effort constant jusqu'à chaque fraction de distance,
  // intégrant pente (Minetti) et stratégie de split — cohérent avec l'allure cible.
  function renderSplits() {
    const body = document.getElementById('gpx-splits-body');
    if (!body) return;
    const P = flatPace();
    if (!track || P == null) {
      body.innerHTML = '<p class="gpx-splits-empty">Renseigne un temps visé pour obtenir les temps de passage.</p>';
      return;
    }
    computeClimbBar();
    const { n, cum, grade, total, dPlusCum } = track;
    const fracs = [0.25, 0.5, 0.75];
    const labels = ['¼', '½', '¾'];
    const rows = fracs.map(f => ({ f, target: f * total, time: null, dist: 0, dplus: 0 }));
    let t = 0, ti = 0;
    for (let i = 1; i < n; i++) {
      const seg = (cum[i] - cum[i - 1]) / 1000;
      const fr = total > 0 ? cum[i] / total : 0;
      t += seg * P * (minettiCost(grade[i]) / C0) * splitFactor(fr) * climbMod(grade[i]);
      while (ti < rows.length && cum[i] >= rows[ti].target) {
        // Temps de passage = temps de course + arrêts ravitos déjà franchis.
        rows[ti].time = t + stopsUpTo(cum[i]); rows[ti].dist = cum[i]; rows[ti].dplus = dPlusCum[i]; ti++;
      }
    }
    body.innerHTML = '<div class="gpx-splits-list">' + rows.map((r, k) =>
      '<div class="gpx-split-row">' +
        '<span class="gpx-split-frac">' + labels[k] + '</span>' +
        '<span class="gpx-split-meta">' +
          (r.dist / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km' +
          ' · D+ ' + intFmt(r.dplus) + ' m' +
        '</span>' +
        '<span class="gpx-split-time">' + (r.time == null ? '—' : fmtTime(r.time)) + '</span>' +
      '</div>'
    ).join('') + '</div>';
  }

  /* --- Allure cible à effort constant ------------------------------------- */
  function targetTimeSec() {
    const h = parseFloat(document.getElementById('gpx-th').value) || 0;
    const m = parseFloat(document.getElementById('gpx-tm').value) || 0;
    const s = parseFloat(document.getElementById('gpx-ts').value) || 0;
    return h * 3600 + m * 60 + s;
  }
  // Allure plate équivalente P (s/km) : temps de course (temps visé − arrêts
  // ravitos) ÷ distance-effort. Les arrêts sont du temps mort inclus dans
  // l'objectif → l'allure de course s'accélère pour les absorber.
  function flatPace() {
    if (!pacingOn) return null;    // fonctionnalité désactivée (switch) → pas d'allure
    const t = targetTimeSec();
    if (!track || track.effort <= 0 || t <= 0) return null;
    const run = t - totalStopSec();
    if (run <= 0) return null;     // les arrêts dépassent l'objectif
    return run / track.effort;
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

  /* --- Effort en montée --------------------------------------------------- */
  // Curseur -100..100 → e ∈ [-EMAX, EMAX]. e>0 = on pousse en montée.
  const CLIMB_GREF = 12;     // pente (%) où l'intensité de montée sature à 1
  const CLIMB_EMAX = 0.30;   // amplitude max (±30 %) sur les portions les plus raides
  function climbEffort() {
    return ((parseFloat(document.getElementById('gpx-climb-input').value) || 0) / 100) * CLIMB_EMAX;
  }
  // Intensité de montée d'un point ∈ [0,1] : 0 à plat/descente, 1 dès CLIMB_GREF.
  function uClimb(g) { return Math.min(1, Math.max(0, g) / CLIMB_GREF); }

  // Moyenne d'intensité de montée pondérée par l'effort (et le split) du tracé.
  // Centrer uClimb sur cette valeur garantit Σ W·(u−ū)=0 → temps total inchangé.
  let climbBar = 0;
  function computeClimbBar() {
    climbBar = 0;
    if (!track) return;
    const { n, cum, grade, total } = track;
    let num = 0, den = 0;
    for (let i = 1; i < n; i++) {
      const seg = (cum[i] - cum[i - 1]) / 1000;
      const fr = total > 0 ? cum[i] / total : 0;
      const W = seg * (minettiCost(grade[i]) / C0) * splitFactor(fr);
      num += W * uClimb(grade[i]);
      den += W;
    }
    climbBar = den > 0 ? num / den : 0;
  }
  // Modificateur d'allure dû à l'effort en montée (centré → temps total constant).
  // <1 = plus rapide (montées quand on pousse), >1 = plus lent (plat/descente, compense).
  function climbMod(g) {
    const m = 1 - climbEffort() * (uClimb(g) - climbBar);
    return Math.max(0.5, m);   // garde-fou contre une allure aberrante
  }

  // Allure cible (s/km) : P × coût(pente)/coût(0) × split × effort-montée.
  function paceAt(g, f) {
    const P = flatPace();
    return P == null ? null : P * (minettiCost(g) / C0) * splitFactor(f) * climbMod(g);
  }

  function updateHint() {
    const P = flatPace();
    if (P != null) { paceHint.textContent = ''; return; }
    if (!pacingOn) { paceHint.textContent = "Active l'allure cible pour calculer l'allure adaptée à chaque pente."; return; }
    paceHint.textContent = (track && targetTimeSec() > 0 && totalStopSec() >= targetTimeSec())
      ? 'Tes arrêts ravitos dépassent le temps visé : augmente ton objectif.'
      : "Renseigne un temps visé pour obtenir l'allure adaptée à chaque pente.";
  }

  /* --- Interaction au survol ---------------------------------------------- */
  function nearestIndex(distM) {
    const cum = track.cum;
    let lo = 0, hi = track.n - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < distM) lo = mid + 1; else hi = mid; }
    if (lo > 0 && (cum[lo] - distM) > (distM - cum[lo - 1])) lo--;
    return lo;
  }
  // Pente affichée au survol : moyenne sur les 10 m précédents et 10 m suivants.
  function slopeWindow(i, half) {
    const { n, cum, ele } = track;
    let a = i; while (a > 0 && cum[i] - cum[a] < half) a--;
    let b = i; while (b < n - 1 && cum[b] - cum[i] < half) b++;
    const dx = cum[b] - cum[a];
    return dx > 0.5 ? (ele[b] - ele[a]) / dx * 100 : 0;
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
    const g = slopeWindow(i, 10);
    // Allure moyenne du kilomètre en cours (cohérent avec la courbe en escalier).
    let km = Math.floor(track.cum[i] / 1000);
    if (km >= kmPace.length) km = kmPace.length - 1;
    const pace = (km >= 0 && kmPace[km] != null) ? kmPace[km] : null;
    tipKm.textContent = (track.cum[i] / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    tipAlt.textContent = intFmt(track.ele[i]) + ' m';
    tipSlope.textContent = (g >= 0 ? '+' : '') + g.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
    if (tipPaceLabel) tipPaceLabel.textContent = km >= 0 ? 'Allure moy. km ' + (km + 1) : 'Allure cible';
    tipPace.textContent = pace == null ? '—' : fmtPace(pace) + ' /km';
    // position du tooltip + recadrage aux bords pour éviter le débordement
    tip.style.left = (frac * 100) + '%';
    const tx = frac < 0.18 ? '0' : frac > 0.82 ? '-100%' : '-50%';
    tip.style.transform = 'translate(' + tx + ', -8px)';
    inner.classList.add('is-hover');
  }
  function onLeave() { inner.classList.remove('is-hover'); }

  plot.addEventListener('mousemove', onMove);
  plot.addEventListener('mouseleave', onLeave);
  plot.addEventListener('touchstart', onMove, { passive: true });
  plot.addEventListener('touchmove', onMove, { passive: true });
  plot.addEventListener('touchend', onLeave);

  ['gpx-th', 'gpx-tm', 'gpx-ts'].forEach(id =>
    document.getElementById(id).addEventListener('input', () => { updateHint(); renderPaceCurve(); renderSplits(); renderRavitosList(); }));

  // Slider negative / positive split
  const splitInput = document.getElementById('gpx-split-input');
  const splitVal   = document.getElementById('gpx-split-val');
  function updateSplitLabel() {
    const p = Math.round(parseFloat(splitInput.value) || 0);
    splitVal.textContent = p === 0 ? 'Régulier'
      : p > 0 ? 'Positif · ' + p + ' %'
      : 'Négatif · ' + Math.abs(p) + ' %';
  }
  splitInput.addEventListener('input', () => { updateSplitLabel(); renderPaceCurve(); renderSplits(); renderRavitosList(); });
  updateSplitLabel();

  // Slider effort en montée
  const climbInput = document.getElementById('gpx-climb-input');
  const climbValEl = document.getElementById('gpx-climb-val');
  function updateClimbLabel() {
    const p = Math.round(parseFloat(climbInput.value) || 0);
    climbValEl.textContent = p === 0 ? 'Neutre'
      : p > 0 ? 'Offensif · +' + p + ' %'
      : 'Tranquille · ' + p + ' %';
  }
  climbInput.addEventListener('input', () => { updateClimbLabel(); renderPaceCurve(); renderSplits(); renderRavitosList(); });
  updateClimbLabel();

  // Section repliable des temps de passage (repliée par défaut)
  const splitsBox = document.getElementById('gpx-splits');
  const splitsToggle = document.getElementById('gpx-splits-toggle');
  function setSplitsOpen(open) {
    splitsBox.classList.toggle('is-open', open);
    splitsToggle.setAttribute('aria-expanded', String(open));
  }
  splitsToggle.addEventListener('click', () => setSplitsOpen(!splitsBox.classList.contains('is-open')));

  /* --- Allure cible : activation (switch) + repli ------------------------- */
  const pacingBox    = document.getElementById('gpx-pacing-box');
  const pacingToggle = document.getElementById('gpx-pacing-toggle');
  const pacingSwitch = document.getElementById('gpx-pacing-switch');

  function setPacingOpen(open) {
    pacingBox.classList.toggle('is-open', open);
    pacingToggle.setAttribute('aria-expanded', String(open));
  }
  pacingToggle.addEventListener('click', () => setPacingOpen(!pacingBox.classList.contains('is-open')));

  // Reflète l'état du switch : courbe d'allure, temps de passage, hints.
  function applyPacing() {
    pacingBox.classList.toggle('is-on', pacingOn);
    card.classList.toggle('gpx-no-pacing', !pacingOn);
    renderPaceCurve();
    renderSplits();
    renderRavitosList();
    updateHint();
  }
  pacingSwitch.addEventListener('change', () => {
    pacingOn = pacingSwitch.checked;
    if (pacingOn) setPacingOpen(true);   // on déplie pour saisir le temps visé
    applyPacing();
  });

  /* --- Ravitaillements ---------------------------------------------------- */
  const ravBox     = document.getElementById('gpx-ravitos-box');
  const ravToggle  = document.getElementById('gpx-ravitos-toggle');
  const ravListEl  = document.getElementById('gpx-ravitos-list');
  const ravCountEl = document.getElementById('gpx-ravitos-count');
  const ravAddBtn  = document.getElementById('gpx-ravito-addbtn');
  const ravForm    = document.getElementById('gpx-ravito-form');
  const ravPosEl   = document.getElementById('gpx-ravito-pos');
  const ravStopEl  = document.getElementById('gpx-ravito-stop');
  const ravConfirm = document.getElementById('gpx-ravito-confirm');
  const ravCancel  = document.getElementById('gpx-ravito-cancel');
  const ravMarksEl = document.getElementById('gpx-ravito-marks');

  function setRavOpen(open) {
    ravBox.classList.toggle('is-open', open);
    ravToggle.setAttribute('aria-expanded', String(open));
  }
  ravToggle.addEventListener('click', () => setRavOpen(!ravBox.classList.contains('is-open')));

  // Durée d'arrêt formatée : « 3 min » ou « 1 min 30 ».
  function fmtStop(sec) {
    const m = Math.floor(sec / 60), s = Math.round(sec - m * 60);
    if (s === 0) return m + ' min';
    if (m === 0) return s + ' s';
    return m + ' min ' + String(s).padStart(2, '0');
  }

  // Heure de passage (arrivée) à chaque ravito : temps de course jusqu'au point
  // + arrêts des ravitos précédents (on arrive, on n'a pas encore stationné ici).
  function ravitoPassages() {
    const res = {};
    const P = flatPace();
    if (!track || P == null) return res;
    computeClimbBar();
    const { n, cum, grade, total } = track;
    const sorted = ravitos.slice().sort((a, b) => a.distM - b.distM);
    let t = 0, ri = 0;
    const runAt = {};
    for (let i = 1; i < n && ri < sorted.length; i++) {
      const seg = (cum[i] - cum[i - 1]) / 1000;
      const fr = total > 0 ? cum[i] / total : 0;
      const dt = seg * P * (minettiCost(grade[i]) / C0) * splitFactor(fr) * climbMod(grade[i]);
      // Le ravito tombe au milieu du segment : on interpole le temps de course
      // au prorata de la distance, pour une heure de passage exacte (indépendante
      // de la densité d'échantillonnage du GPX).
      while (ri < sorted.length && cum[i] >= sorted[ri].distM) {
        const segLen = cum[i] - cum[i - 1];
        const frac = segLen > 0 ? (sorted[ri].distM - cum[i - 1]) / segLen : 1;
        runAt[sorted[ri].id] = t + dt * Math.max(0, Math.min(1, frac));
        ri++;
      }
      t += dt;
    }
    let cumStop = 0;
    for (const r of sorted) {
      res[r.id] = (runAt[r.id] != null ? runAt[r.id] : t) + cumStop;
      cumStop += r.stopSec;
    }
    return res;
  }

  function renderRavitosList() {
    ravCountEl.textContent = ravitos.length;
    const sorted = ravitos.slice().sort((a, b) => a.distM - b.distM);
    if (!sorted.length) {
      ravListEl.innerHTML = '<p class="gpx-splits-empty">Aucun ravito. Ajoute tes points d\'arrêt pour ajuster allures et temps de passage.</p>';
      return;
    }
    const pass = ravitoPassages();
    ravListEl.innerHTML = sorted.map((r, k) => {
      const km = (r.distM / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const p = pass[r.id];
      return '<div class="gpx-ravito-row">' +
        '<div class="gpx-ravito-main">' +
          '<span class="gpx-ravito-pos"><span class="gpx-ravito-dot"></span>km ' + km + '</span>' +
          '<span class="gpx-ravito-meta">arrêt ' + fmtStop(r.stopSec) +
            (p != null ? ' · passage ≈ ' + fmtTime(p) : '') + '</span>' +
        '</div>' +
        '<button class="gpx-ravito-del" type="button" data-del="' + r.id + '" aria-label="Supprimer ce ravitaillement">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
      '</div>';
    }).join('');
  }

  // Marqueurs minimalistes sur le profil : lignes verticales pointillées.
  function renderRavitoMarks() {
    if (!ravMarksEl) return;
    if (!track) { ravMarksEl.innerHTML = ''; return; }
    ravMarksEl.innerHTML = ravitos.map(r => {
      const x = xOf(Math.min(r.distM, track.total)).toFixed(1);
      return '<line class="gpx-ravito-mark" x1="' + x + '" y1="0" x2="' + x + '" y2="' + VB_H + '" vector-effect="non-scaling-stroke"/>';
    }).join('');
  }

  function refreshRavitoOutputs() {
    renderRavitosList();
    renderRavitoMarks();
    renderPaceCurve();
    renderSplits();
    updateHint();
    if (card.classList.contains('is-map')) renderRavitoMap();
  }

  function resetRavitos() {
    ravitos = [];
    ravForm.hidden = true;
    ravAddBtn.hidden = false;
    renderRavitosList();
    renderRavitoMarks();
    if (map) renderRavitoMap();
  }

  function openRavitoForm() {
    if (!track) return;
    ravForm.hidden = false;
    ravAddBtn.hidden = true;
    ravPosEl.max = (track.total / 1000).toFixed(2);
    ravPosEl.value = '';
    ravPosEl.focus();
  }
  function closeRavitoForm() {
    ravForm.hidden = true;
    ravAddBtn.hidden = false;
  }

  function confirmRavito() {
    if (!track) return;
    const maxKm = track.total / 1000;
    const posKm = parseFloat(ravPosEl.value);
    const stopMin = parseFloat(ravStopEl.value);
    if (!isFinite(posKm) || posKm <= 0) {
      showSnackbar('Position manquante', 'Indique une position comprise entre 0 et ' + maxKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km.', { variant: 'error' });
      return;
    }
    if (posKm > maxKm) {
      showSnackbar('Position hors tracé', 'Le ravito ne peut pas dépasser ' + maxKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km.', { variant: 'error' });
      return;
    }
    if (!isFinite(stopMin) || stopMin <= 0) {
      showSnackbar('Durée manquante', "Indique un temps d'arrêt supérieur à zéro.", { variant: 'error' });
      return;
    }
    ravitos.push({ id: ++ravitoSeq, distM: posKm * 1000, stopSec: Math.round(stopMin * 60) });
    closeRavitoForm();
    refreshRavitoOutputs();
    showSnackbar('Ravitaillement ajouté', 'km ' + posKm.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' · arrêt ' + fmtStop(Math.round(stopMin * 60)) + '.', { variant: 'success' });
  }

  ravAddBtn.addEventListener('click', openRavitoForm);
  ravCancel.addEventListener('click', closeRavitoForm);
  ravConfirm.addEventListener('click', confirmRavito);
  ravPosEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmRavito(); } });
  ravStopEl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirmRavito(); } });

  ravListEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const id = parseInt(btn.dataset.del, 10);
    ravitos = ravitos.filter(r => r.id !== id);
    refreshRavitoOutputs();
    showSnackbar('Ravitaillement supprimé', 'Allures et temps de passage recalculés.', { variant: 'default' });
  });

  renderRavitosList();
  applyPacing();   // état initial : calcul d'allure désactivé

  /* --- Bascule Graphique / Carte (Leaflet) -------------------------------- */
  const PRIMARY = (getComputedStyle(document.documentElement)
    .getPropertyValue('--ds-sys-color-primary') || '#002FA7').trim();
  let map = null, trackLayer = null, mapBounds = null, ravitoMapLayer = null;

  // Marqueurs ravitos sur la carte (au point GPS le plus proche de la position).
  function renderRavitoMap() {
    if (!map) return;
    if (ravitoMapLayer) { ravitoMapLayer.remove(); ravitoMapLayer = null; }
    if (!track || !ravitos.length || typeof L === 'undefined') return;
    const marks = ravitos.map(r => {
      const i = nearestIndex(Math.min(r.distM, track.total));
      const km = (r.distM / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
      return L.circleMarker(track.coords[i], { radius: 5, color: '#fff', weight: 2, fillColor: RAVITO_COLOR, fillOpacity: 1 })
        .bindTooltip('Ravito · km ' + km);
    });
    ravitoMapLayer = L.layerGroup(marks).addTo(map);
  }

  function renderMap() {
    if (!track || !track.coords || track.coords.length < 2) return;
    if (typeof L === 'undefined') {
      showSnackbar('Carte indisponible', "Le module carte n'a pas pu être chargé.", { variant: 'error' });
      return;
    }
    if (!map) {
      map = L.map(mapEl, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
    }
    if (trackLayer) trackLayer.remove();
    const line = L.polyline(track.coords, { color: PRIMARY, weight: 4, opacity: .9 });
    const start = L.circleMarker(track.coords[0], { radius: 6, color: '#fff', weight: 2, fillColor: PRIMARY, fillOpacity: 1 });
    const end = L.circleMarker(track.coords[track.coords.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: '#15151A', fillOpacity: 1 });
    trackLayer = L.layerGroup([line, start, end]).addTo(map);
    mapBounds = line.getBounds();
    renderRavitoMap();
    fitMap();
    // Le layout (grille plein écran) peut se stabiliser après coup : on recadre.
    requestAnimationFrame(fitMap);
  }

  // Recadre la carte sur la trace après tout changement de taille du conteneur.
  function fitMap() {
    if (!map || !mapBounds) return;
    map.invalidateSize();
    map.fitBounds(mapBounds, { padding: [18, 18] });
  }

  function showView(view) {
    const isMap = view === 'map';
    card.classList.toggle('is-map', isMap);
    document.querySelectorAll('#gpx-view button').forEach(b =>
      b.classList.toggle('is-active', b.dataset.view === view));
    if (isMap) renderMap();
  }
  document.querySelectorAll('#gpx-view button').forEach(b =>
    b.addEventListener('click', () => showView(b.dataset.view)));

  /* --- Plein écran -------------------------------------------------------- */
  const fsBtn = document.getElementById('gpx-fs-btn');
  let isFS = false, placeholder = null, backdrop = null;

  function fsTarget() {
    const M = window.innerWidth <= 600 ? 20 : 28;   // padding latéral .wrap par breakpoint
    const V = 16;                                     // marge haut/bas
    const maxW = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--ds-sys-size-container-max'), 10) || 1200;
    // Même cadrage que .wrap : largeur plafonnée au conteneur, centrée.
    const width = Math.min(window.innerWidth - 2 * M, maxW);
    const left = (window.innerWidth - width) / 2;
    return { left, top: V, width, height: window.innerHeight - 2 * V };
  }
  function setBox(b) {
    card.style.left = b.left + 'px';
    card.style.top = b.top + 'px';
    card.style.width = b.width + 'px';
    card.style.height = b.height + 'px';
  }

  function enterFS() {
    if (isFS) return;
    isFS = true;
    const r = card.getBoundingClientRect();
    placeholder = document.createElement('div');
    placeholder.style.width = r.width + 'px';
    placeholder.style.height = r.height + 'px';
    card.parentNode.insertBefore(placeholder, card);

    backdrop = document.createElement('div');
    backdrop.className = 'gpx-fs-backdrop';
    backdrop.addEventListener('click', exitFS);
    document.body.appendChild(backdrop);

    card.classList.add('is-fixed');
    setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    void card.offsetWidth;                            // reflow : fige l'état de départ

    requestAnimationFrame(() => {
      card.classList.add('is-fullscreen');
      backdrop.classList.add('is-visible');
      setBox(fsTarget());
    });
    fsBtn.setAttribute('aria-pressed', 'true');
    fsBtn.setAttribute('aria-label', 'Quitter le plein écran');
    document.body.style.overflow = 'hidden';
    setSplitsOpen(true);                                // dépliées par défaut en plein écran
    setRavOpen(true);
    setPacingOpen(true);

    card.addEventListener('transitionend', onResizeFS, { once: true });
  }

  function exitFS() {
    if (!isFS) return;
    isFS = false;
    const r = placeholder.getBoundingClientRect();
    setSplitsOpen(false);                               // repliées en revenant en mode normal
    setRavOpen(false);
    setPacingOpen(false);
    card.classList.remove('is-fullscreen');
    backdrop.classList.remove('is-visible');
    setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
    fsBtn.setAttribute('aria-pressed', 'false');
    fsBtn.setAttribute('aria-label', 'Afficher en plein écran');

    card.addEventListener('transitionend', function done(e) {
      if (e.propertyName !== 'width') return;
      card.removeEventListener('transitionend', done);
      card.classList.remove('is-fixed');
      card.style.left = card.style.top = card.style.width = card.style.height = '';
      if (placeholder) { placeholder.remove(); placeholder = null; }
      if (backdrop) { backdrop.remove(); backdrop = null; }
      document.body.style.overflow = '';
      if (card.classList.contains('is-map')) fitMap();
    }, false);
  }

  function onResizeFS() {
    if (card.classList.contains('is-map')) fitMap();
  }

  fsBtn.addEventListener('click', () => isFS ? exitFS() : enterFS());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isFS) exitFS(); });
  window.addEventListener('resize', () => {
    if (!isFS) return;
    setBox(fsTarget());
    if (card.classList.contains('is-map')) fitMap();
  });

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
        resetRavitos();
        renderChart();
        renderEleAxis();
        renderPaceCurve();
        renderSplits();
        updateHint();
        renderRavitoMarks();
        if (card.classList.contains('is-map')) renderMap();
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
