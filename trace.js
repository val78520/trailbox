/* ============================================================================
   TRAIL BOX — ANALYSE DE TRACÉ (page dédiée /trace)
   Page réservée aux membres connectés (gating ci-dessous). Le module GPX est
   identique à celui de la boîte à outils, mais présenté en contenu de page.
   100 % navigateur : le fichier GPX ne quitte jamais la machine.
   ----------------------------------------------------------------------------
   Helpers partagés repris d'app.js (la page ne charge pas app.js, qui lie des
   éléments propres à la home). On en duplique le strict nécessaire.
   ========================================================================== */

const fr = (n, d = 1) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

function fmtPace(secPerKm) {
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm - m * 60);
  if (s === 60) { m += 1; s = 0; }
  return m + ':' + String(s).padStart(2, '0');
}

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

/* Coût énergétique de la course en J/(kg·m) — polynôme de Minetti (2002). */
function minettiCost(gradePct) {
  const i = Math.max(-45, Math.min(45, gradePct)) / 100;
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3
       + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/* ---- Snackbar (réutilisable) -------------------------------------------- */
const snackbar = document.getElementById('snackbar');
const snackbarTitle = document.getElementById('snackbar-title');
const snackbarDesc = document.getElementById('snackbar-desc');
const snackbarIcon = snackbar ? snackbar.querySelector('.snackbar-icon') : null;
let snackbarTimer = null;

const SNACK_ICONS = {
  default: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  error:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  loading: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>',
};

function showSnackbar(title, desc, opts = {}) {
  if (!snackbar) return;
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
   GATING — page réservée aux membres connectés
   ----------------------------------------------------------------------------
   Décision initiale autoritative via sb.auth.getSession() (le client `sb` est
   défini par auth.js, chargé avant ce fichier) — on ne dépend pas de l'ordre
   des évènements de session. Tant que l'accès n'est pas tranché, le contenu
   reste masqué (voile « Vérification de l'accès »). Connecté → on révèle.
   Anonyme, erreur, ou session jamais confirmée sous 6 s → retour à l'accueil
   (sécurité « fail-closed »). Une déconnexion en cours de route ramène aussi
   à l'accueil.
   ========================================================================== */
(function gateAccess() {
  let settled = false, allowed = false;
  function allow() {
    if (settled) return;
    settled = true; allowed = true;
    document.body.classList.add('is-authed');
  }
  function deny() {
    if (settled) return;
    settled = true;
    location.replace('index.html');
  }

  try {
    if (typeof sb !== 'undefined' && sb.auth) {
      sb.auth.getSession()
        .then(({ data: { session } }) => session && session.user ? allow() : deny())
        .catch(deny);
    }
  } catch (_) { /* sb indisponible : le filet de sécurité ci-dessous tranchera */ }

  // Déconnexion pendant la visite : on quitte la page réservée.
  document.addEventListener('trailbox:auth', e => {
    const user = e.detail && e.detail.user;
    if (!user && allowed) location.replace('index.html');
  });

  setTimeout(() => { if (!settled) deny(); }, 6000);
})();

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
  const diffEl  = document.getElementById('gpx-diff-zones');
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
  let currentGpx = null;                    // { text, name, savedId } du GPX courant
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

  /* --- Zones de difficulté (bande colorée sous le profil) ----------------- */
  // Classement par pente locale absolue : facile < 8 %, modéré 8–15 %, difficile > 15 %.
  const GRADE_MOD = 8, GRADE_HARD = 15;
  function gradeClass(g) {
    const a = Math.abs(g);
    return a < GRADE_MOD ? 'easy' : a < GRADE_HARD ? 'moderate' : 'hard';
  }
  // Bande en bas du viewBox : un rect par tronçon contigu de même difficulté.
  function renderDiffZones() {
    if (!diffEl) return;
    if (!track) { diffEl.innerHTML = ''; return; }
    const { n, cum, grade } = track;
    const BAND_H = 9, yTop = (VB_H - BAND_H).toFixed(1);
    const rect = (x0, x1, cls) =>
      '<rect class="gpx-diff gpx-diff--' + cls + '" x="' + x0.toFixed(1) + '" y="' + yTop +
      '" width="' + Math.max(0, x1 - x0).toFixed(1) + '" height="' + BAND_H + '"/>';
    let html = '', startX = 0, cls = gradeClass(grade[0] || 0);
    for (let i = 1; i < n; i++) {
      const c = gradeClass(grade[i]);
      if (c !== cls) {
        const x = xOf(cum[i]);
        html += rect(startX, x, cls);
        startX = x; cls = c;
      }
    }
    html += rect(startX, xOf(cum[n - 1]), cls);
    diffEl.innerHTML = html;
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
    renderRavitoMap();   // no-op si la carte n'est pas encore initialisée
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
  // Sur la page dédiée, les réglages sont ouverts dès l'arrivée (toujours à portée).
  setPacingOpen(true);
  setRavOpen(true);
  setSplitsOpen(true);

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

  // Recadrage de la carte au redimensionnement de la fenêtre (largeur fluide).
  let fitTimer = null;
  window.addEventListener('resize', () => {
    if (!map) return;
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitMap, 150);
  });

  /* --- Application d'un GPX (source commune import / rechargement) ---------- */
  // Parse + analyse + rendu d'un GPX (texte brut). Utilisé par l'import de
  // fichier ET par le rechargement d'un tracé enregistré. Mémorise le GPX
  // courant (texte + nom) pour permettre sa sauvegarde. Renvoie le nb de points.
  function applyTrace(text, name) {
    const pts = parseGPX(text);
    track = analyse(pts);
    elDplus.textContent = 'D+ ' + intFmt(track.dPlus) + ' m';
    elDmin.textContent  = 'D- ' + intFmt(track.dMinus) + ' m';
    elDist.textContent  = (track.total / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
    elDistS.textContent = 'distance réelle';
    card.classList.remove('is-empty');
    resetRavitos();
    renderChart();
    renderDiffZones();
    renderEleAxis();
    renderPaceCurve();
    renderSplits();
    updateHint();
    renderRavitoMarks();
    renderMap();   // profil ET carte affichés ensemble (plus de bascule)
    currentGpx = { text, name, savedId: null };
    updateSaveBtn();
    return track.n;
  }

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
        const name = file.name.replace(/\.gpx$/i, '');
        const n = applyTrace(reader.result, name);
        showSnackbar('Trace importée', n.toLocaleString('fr-FR') + ' points analysés. Survole le profil.', { variant: 'success' });
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

  /* ========================================================================
     TRACÉS ENREGISTRÉS (Supabase) — sauvegarde liée au profil, max 3
     ------------------------------------------------------------------------
     La page est déjà réservée aux membres (voir gating en tête de fichier).
     On stocke le GPX brut + son nom dans la table `user_traces` (RLS par
     utilisateur, limite de 3 garantie côté serveur). Le localStorage n'est
     pas utilisé : la trace appartient au compte, pas à la machine.
     ====================================================================== */
  const MAX_TRACES   = 3;
  const MAX_GPX_LEN  = 3000000;            // garde-fou taille (≈ check serveur)
  const savedBox     = document.getElementById('gpx-saved');
  const savedListEl  = document.getElementById('gpx-saved-list');
  const savedCountEl = document.getElementById('gpx-saved-count');
  const savedSaveBtn = document.getElementById('gpx-saved-savebtn');
  let savedTraces = [];                     // [{ id, name }] métadonnées (sans GPX)
  let savedUserId = null;

  const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Bouton « Sauvegarder » : visible si un tracé est chargé et pas déjà enregistré.
  function updateSaveBtn() {
    if (!savedSaveBtn) return;
    savedSaveBtn.hidden = !currentGpx || !!currentGpx.savedId;
  }

  function renderSavedList() {
    if (!savedListEl) return;
    savedCountEl.textContent = savedTraces.length + '/' + MAX_TRACES;
    if (!savedTraces.length) {
      savedListEl.innerHTML = '<p class="gpx-splits-empty">Aucun tracé enregistré. Importe un GPX puis sauvegarde-le pour le retrouver à ta prochaine visite.</p>';
      return;
    }
    savedListEl.innerHTML = savedTraces.map(t =>
      '<div class="gpx-saved-item">' +
        '<button class="gpx-saved-load" type="button" data-load="' + t.id + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
          '<span class="gpx-saved-name">' + escapeHtml(t.name) + '</span>' +
        '</button>' +
        '<button class="gpx-saved-del" type="button" data-del-trace="' + t.id + '" aria-label="Supprimer le tracé ' + escapeHtml(t.name) + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
        '</button>' +
      '</div>'
    ).join('');
  }

  async function refreshSavedTraces() {
    if (!savedUserId) return;
    const { data, error } = await sb
      .from('user_traces')
      .select('id, name')
      .order('created_at', { ascending: true });
    if (error) { console.warn('[tracés] lecture impossible', error); return; }
    savedTraces = data || [];
    renderSavedList();
  }

  async function saveCurrentTrace() {
    if (!currentGpx || !savedUserId || currentGpx.savedId) return;
    if (savedTraces.length >= MAX_TRACES) {
      showSnackbar('Limite atteinte', 'Tu peux enregistrer 3 tracés au maximum. Supprimes-en un pour faire de la place.', { variant: 'error' });
      return;
    }
    if (currentGpx.text.length > MAX_GPX_LEN) {
      showSnackbar('Tracé trop volumineux', 'Ce GPX est trop lourd pour être enregistré.', { variant: 'error' });
      return;
    }
    showSnackbar('Enregistrement…', 'On sauvegarde ton tracé sur ton compte.', { variant: 'loading', sticky: true });
    const { data, error } = await sb
      .from('user_traces')
      .insert({ user_id: savedUserId, name: currentGpx.name, gpx: currentGpx.text })
      .select('id, name')
      .maybeSingle();
    if (error) {
      const msg = error.message || '';
      if (/trace_limit_reached/.test(msg)) {
        showSnackbar('Limite atteinte', 'Tu as déjà 3 tracés enregistrés.', { variant: 'error' });
      } else if (/_gpx_check|_name_check/.test(msg)) {
        showSnackbar('Tracé non enregistré', 'Ce GPX ne peut pas être sauvegardé en l\'état.', { variant: 'error' });
      } else {
        showSnackbar("Échec de l'enregistrement", 'Réessaie dans un instant.', { variant: 'error' });
      }
      await refreshSavedTraces();
      return;
    }
    currentGpx.savedId = data ? data.id : null;
    updateSaveBtn();
    await refreshSavedTraces();
    showSnackbar('Tracé enregistré', 'Tu le retrouveras dans « Mes tracés » à ta prochaine visite.', { variant: 'success' });
  }

  async function loadSavedTrace(id) {
    const meta = savedTraces.find(t => t.id === id);
    showSnackbar('Chargement…', 'On récupère ton tracé enregistré.', { variant: 'loading', sticky: true });
    const { data, error } = await sb
      .from('user_traces')
      .select('name, gpx')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      showSnackbar('Chargement impossible', "Ce tracé n'a pas pu être récupéré.", { variant: 'error' });
      return;
    }
    try {
      const n = applyTrace(data.gpx, data.name);
      currentGpx.savedId = id;   // déjà en base → pas de re-sauvegarde
      updateSaveBtn();
      showSnackbar('Tracé chargé', (meta ? meta.name : data.name) + ' · ' + n.toLocaleString('fr-FR') + ' points.', { variant: 'success' });
    } catch (err) {
      showSnackbar('Tracé illisible', err.message || 'Le fichier enregistré est invalide.', { variant: 'error' });
    }
  }

  async function deleteSavedTrace(id) {
    const meta = savedTraces.find(t => t.id === id);
    const { error } = await sb.from('user_traces').delete().eq('id', id);
    if (error) {
      showSnackbar('Suppression impossible', 'Réessaie dans un instant.', { variant: 'error' });
      return;
    }
    if (currentGpx && currentGpx.savedId === id) { currentGpx.savedId = null; updateSaveBtn(); }
    await refreshSavedTraces();
    showSnackbar('Tracé supprimé', (meta ? '« ' + meta.name + ' »' : 'Le tracé') + ' a été retiré de ton compte.', { variant: 'default' });
  }

  if (savedSaveBtn) savedSaveBtn.addEventListener('click', saveCurrentTrace);
  if (savedListEl) savedListEl.addEventListener('click', e => {
    const loadBtn = e.target.closest('[data-load]');
    if (loadBtn) { loadSavedTrace(loadBtn.dataset.load); return; }
    const delBtn = e.target.closest('[data-del-trace]');
    if (delBtn) deleteSavedTrace(delBtn.dataset.delTrace);
  });

  // Initialisation : la page étant réservée, l'utilisateur est connecté.
  (async function initSavedTraces() {
    if (!savedBox || typeof sb === 'undefined' || !sb.auth) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session || !session.user) return;
      savedUserId = session.user.id;
      savedBox.hidden = false;
      await refreshSavedTraces();
    } catch (err) { console.warn('[tracés] init impossible', err); }
  })();
})();
