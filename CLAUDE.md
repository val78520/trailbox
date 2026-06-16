# CLAUDE.md — Design & UI Guidelines

> Fichier de référence pour guider Claude sur les conventions de
> design, d'UI et de front-end de ce projet. Adapte les valeurs entre `<…>` à ton produit.

---

## 1. Principes de design

- **Clarté avant esthétique** : si un choix visuel nuit à la compréhension, on le retire.
- **Cohérence** : un même composant se comporte et se présente de façon identique partout.
- **Accessibilité par défaut** : on vise WCAG 2.1 AA sur 100 % des écrans (voir §8).
- **REsponsive** : on conçoit pour le plus petit écran, puis on enrichit vers le haut.
- **Tokens, pas de valeurs en dur** : aucune couleur/espacement/taille codé à la main dans les composants.

❌ À éviter
```css
.button { background: #4F46E5; padding: 12px 24px; }
```

✅ Préféré
```css
.button { background: var(--color-primary); padding: var(--space-3) var(--space-6); }
```

---

## 2. Design tokens

Source de vérité unique. Toute valeur visuelle dérive d'un token présent dans le fichier : design_system.css

---

## 3. États d'interface

Toujours prévoir les 4 états d'une vue qui charge des données :

| État        | Ce qu'on affiche                                  |
|-------------|---------------------------------------------------|
| **Loading** | Skeleton ou spinner, jamais un écran vide figé    |
| **Empty**   | Message clair + action (ex. « Aucun résultat, créez-en un ») |
| **Error**   | Message non technique + bouton « Réessayer »      |
| **Success** | Le contenu                                        |

```tsx
if (isLoading) return <Skeleton rows={3} />;
if (error)     return <ErrorState onRetry={refetch} />;
if (!items.length) return <EmptyState action="Créer" />;
return <List items={items} />;
```

---

## 4. Accessibilité (WCAG 2.1 AA)

- **Contraste** : ≥ 4.5:1 pour le texte normal, ≥ 3:1 pour le texte large et les icônes.
- **Images** : `alt` descriptif, ou `alt=""` si décoratif.
- **Sémantique** : `<button>` pour une action, `<a>` pour naviguer. Jamais un `<div onClick>`.
- **Formulaires** : chaque `input` a un `<label>` associé (`htmlFor` / `id`).
- **Navigation clavier** : tout est atteignable au `Tab`, ordre logique, pièges à focus évités dans les modals.

---

## 4. Animations

- Durées : `150ms` (micro), `250ms` (standard), `400ms` (transition de vue).
- Easing par défaut : `cubic-bezier(0.4, 0, 0.2, 1)`.
- On anime `transform` et `opacity` en priorité (performant). On évite d'animer `width`, `height`, `top`, `left`.

```css
.fade-in { animation: fade-in 250ms cubic-bezier(0.4,0,0.2,1); }
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 5. Checklist avant de livrer un écran

- [ ] Aucune valeur en dur (couleurs, espacements, tailles) → tokens uniquement
- [ ] Les 4 états gérés (loading / empty / error / success)
- [ ] Responsive validé sur mobile, tablette, desktop
- [ ] Contraste et focus vérifiés, navigation clavier OK
- [ ] Dark mode fonctionnel
- [ ] Textes UX relus (clairs, sans jargon, ton cohérent)
- [ ] Pas de régression sur les composants partagés

---

## 6. Ce que Claude doit faire / éviter

**À faire**
- Réutiliser les composants et tokens existants avant d'en créer.
- Proposer un design accessible et responsive par défaut.
- Signaler toute incohérence avec ce guide.

**À éviter**
- Introduire une nouvelle couleur/police sans la justifier.
- Coder des valeurs en dur.
- Créer un composant qui duplique un composant existant.
- Supprimer les styles de focus.
