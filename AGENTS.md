# AGENTS.md — Trail Box

> Guide pour les agents IA (Claude, Copilot, Cursor…) travaillant sur **Trail Box**.
> Lis aussi `CLAUDE.md` (conventions de design & UI). Ce fichier décrit **comment**
> contribuer : architecture réelle, contraintes et garde-fous propres à ce projet.

---

## 1. Le projet en bref

- **Quoi** : « la boîte à outils du traileur » — une page web qui regroupe 8 calculateurs
  (allure, pente, GAP, VO2max, VMA, allures d'entraînement, allures de course, profil GPX…).
- **Promesse** : on rentre des chiffres, on sort un résultat. **Pas de pub, pas de tuto.**
  Certains outils avancés (ex. analyse de tracé GPX) sont réservés aux utilisateurs connectés.
  L'esprit est léger et rapide — toute contribution doit le rester.
- **Langue** : tout en **français**, y compris le ton (décalé, direct, un brin d'humour).
- **Public** : coureurs sur mobile et desktop. **Mobile-first obligatoire.**

---

## 2. Stack — et ce qu'elle N'EST PAS

- **HTML / CSS / JavaScript vanilla**, point. **Aucun framework, aucun bundler, aucune étape de build.**
- Pas de `npm install`, pas de `package.json`, pas de transpilation. On édite, on recharge le navigateur.
- Dépendances externes, uniquement via CDN et seulement celles déjà présentes :
  - **Leaflet 1.9.4** — carte du tracé GPX
  - **Google Fonts (Inter)** — typographie
  - **Google Analytics (gtag, `G-Z7D9JWV9Z5`)** — mesure d'audience
- **Ne pas introduire** React/Vue, TypeScript, Tailwind, un bundler, ou une nouvelle lib npm
  sans demande explicite. La légèreté est une fonctionnalité, pas un accident.

---

## 3. Structure du dépôt

```
.
├── index.html          # Page unique (nav, héros, 8 outils, footer). lang="fr"
├── design_system.css   # TOKENS — à charger en 1er. Ne définit aucun composant.
├── styles.css          # COMPOSANTS — consomme les tokens. À charger en 2nd.
├── app.js              # Toute la logique : calculs + UI. defer, chargé en bas de page.
├── CLAUDE.md           # Conventions design & UI (à respecter)
└── .claude/launch.json # Config de serveur local
```

**L'ordre de chargement CSS est critique** et déjà câblé dans `<head>` :
```html
<link rel="stylesheet" href="design_system.css">  <!-- tokens d'abord -->
<link rel="stylesheet" href="styles.css">          <!-- composants ensuite -->
```
`app.js` est chargé une seule fois en bas avec `defer` : `<script src="app.js" defer></script>`.

---

## 4. Lancer le projet

Il **faut** un serveur local (les requêtes Leaflet/GPX et le ton CORS cassent en `file://`).

| Action            | Commande                          |
|-------------------|-----------------------------------|
| Servir en local   | `python3 -m http.server 8000`     |
| Ouvrir            | `http://localhost:8000`           |

C'est exactement ce que fait `.claude/launch.json` (port 8000). Aucune autre commande n'est requise.

---

## 5. Design tokens — la règle d'or

Le système de tokens (dans `design_system.css`) a **deux couches**, inspirées de Material 3 :

1. **REFERENCE** `--ds-ref-*` → valeurs primitives brutes (palette, polices, échelle).
   On n'y touche **presque jamais**.
2. **SYSTEM** `--ds-sys-*` → rôles sémantiques (`primary`, `surface`, `on-surface`, `elevation-1`…).
   **C'est la seule couche que les composants ont le droit de lire.**

> ⛔️ **Aucun composant (styles.css) ne lit un `--ds-ref-*` directement.** Il passe toujours par `--ds-sys-*`.
> ⛔️ **Aucune valeur en dur** (couleur, espacement, rayon, ombre) dans `styles.css`.

❌ À éviter
```css
.card { background: #FFFFFF; padding: 22px; border-radius: 22px; }
.card { background: var(--ds-ref-white); }     /* lit un ref-token : interdit */
```

✅ Préféré
```css
.card {
  background: var(--ds-sys-color-surface);
  padding: var(--ds-sys-spacing-22);
  border-radius: var(--ds-sys-shape-corner-xl);
  box-shadow: var(--ds-sys-elevation-1);
}
```

Repères utiles : couleur de marque = **Bleu Klein** (`--ds-sys-color-primary`), erreurs en `--ds-sys-color-error`,
courbe d'allure en `--ds-sys-color-pace-line` (orange, pour le contraste). Espacement sur grille 4 pt
(`--ds-sys-spacing-4/8/12/16/24/32…`), pas fins disponibles pour les ajustements optiques.

**Breakpoints** : `560px` (sm) et `920px` (md). CSS n'autorisant pas les variables dans les `@media`,
ces valeurs sont répétées en dur dans les media queries — c'est volontaire, ne pas « corriger ».

---

## 6. Conventions HTML

- HTML5 sémantique : `<header>`, `<nav>`, `<main>`/`<section>`, `<article>`, `<footer>`.
- Hiérarchie de titres continue, un seul `<h1>` (le héros).
- `alt` sur les images, `aria-hidden="true"` sur le décor SVG, `<label>` lié à chaque champ.
- **Pas de CSS ni de JS inline.** Les classes viennent de `styles.css`, le comportement de `app.js`.
- Le JS cible le DOM via `id` ou attributs `data-*` (ex. `data-tool`, `data-del`). Si tu ajoutes un
  hook pour le JS, préfère un `data-*` à une classe de style détournée.

---

## 7. Conventions JavaScript (`app.js`)

`app.js` est un **seul fichier non modulaire** : des fonctions au scope global, organisées par
sections commentées (`/* ---- 01 · ALLURE ---- */`, `02 · PENTE`, etc.). Respecte cette organisation.

- **Pas de modules ES, pas d'`import`/`export`** ici — le fichier est chargé tel quel. N'introduis pas
  de découpage en modules sans accord (ça changerait le câblage du `<script>`).
- `const`/`let` uniquement, jamais `var`. Fonctions courtes, une responsabilité.
- **Câblage par `addEventListener`** (≈ 47 dans le fichier), **jamais** de `onclick=` dans le HTML.
- Helpers déjà en place — **réutilise-les** au lieu d'en recréer :
  - `fr(n, d)` → formatage de nombre en français
  - `num(id)` → lit et parse la valeur d'un champ
  - `fmtPace`, `fmtHM`, `fmtTime` → formatage allure / durée
  - `showSnackbar(title, desc, opts)` → notification réutilisable (variantes + sticky)
- **Toujours vérifier l'existence d'un élément** avant de l'utiliser (`if (!el) return;`).

### Persistance
Stockage via `localStorage`, **clés versionnées** — ne pas renommer sans migration :
- `trailbox.favorites.v1` — outils mis en favori
- `trailbox.vma.v1` — dernière VMA saisie
Si tu changes le format d'une clé, incrémente la version (`…v2`) et gère l'ancienne.

### Calculs — zone sensible
Les formules sont scientifiques et **ne doivent pas être cassées** :
coût de Minetti (GAP), demi-Cooper et zones de VMA, VO2max ≈ 3,5 × VMA. Si tu touches un calcul,
vérifie le résultat à la main sur un cas connu et conserve les constantes (`VMA_ZONES`, `COURSE_DISTANCES`…).

---

## 8. États & accessibilité

- Prévoir les états d'une vue qui charge (le projet utilise déjà un `SKELETON_HTML` + snackbar).
- Contraste ≥ 4.5:1, **focus visible jamais supprimé**, navigation clavier fonctionnelle
  (le dropzone GPX gère déjà `Enter`/`Espace` — garder ce niveau d'exigence).
- Respecter `CLAUDE.md` §4/§8 pour le détail WCAG.

---

## 9. Git & commits

- Branches : `feat/<sujet>`, `fix/<sujet>`, `chore/<sujet>`.
- [Conventional Commits](https://www.conventionalcommits.org/) :
  ```
  feat(vma): ajoute les allures de seuil au calcul de VMA
  fix(gap): corrige le coût de Minetti en forte descente
  chore(gpx): allège le parsing du tracé
  ```
- `.gitignore` couvre déjà `.DS_Store` et `node_modules/`. Ne committe ni secrets ni fichiers générés.

---

## 10. Ce que l'agent doit faire / éviter

**À faire**
- Réutiliser tokens `--ds-sys-*`, helpers JS et composants existants avant d'en créer.
- Garder l'expérience légère, rapide, sans friction (l'argument de vente du produit).
- Tester chaque changement dans le navigateur, mobile **et** desktop.
- Vérifier à la main tout calcul modifié.
- Préserver le ton français décalé des textes.

**À éviter**
- Ajouter un framework, un bundler, TypeScript, ou une dépendance npm.
- Lire un `--ds-ref-*` ou coder une valeur en dur dans `styles.css`.
- Mettre du CSS/JS inline, utiliser `var`, ou des handlers `onclick=` dans le HTML.
- Transformer `app.js` en modules ES ou en éclater l'organisation sans accord.
- Renommer une clé `localStorage` sans migration de version.
- Casser les formules de calcul ou supprimer les styles de focus.

---

## 11. Définition de « terminé »

- [ ] Rendu vérifié dans le navigateur, en mobile et en desktop.
- [ ] Aucune valeur en dur ni `--ds-ref-*` côté composants ; tokens `--ds-sys-*` uniquement.
- [ ] Pas de CSS/JS inline ; câblage via `addEventListener`.
- [ ] Calculs touchés re-vérifiés à la main sur un cas connu.
- [ ] Contraste, focus et navigation clavier OK.
- [ ] Aucune dépendance/outillage ajouté ; le site s'ouvre toujours via `python3 -m http.server`.
- [ ] Diff minimal, limité à la tâche.
