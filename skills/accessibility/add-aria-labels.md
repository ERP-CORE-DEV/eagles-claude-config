---
name: add-aria-labels
description: Add ARIA labels and roles for screen reader accessibility
argument-hint: [context: forms|navigation|tables|modals|buttons]
tags: [accessibility, ARIA, a11y, screen-reader, WCAG, semantic-HTML]
---

# ARIA Accessibility Guide

Rule #1: Use semantic HTML first. Only add ARIA when native elements can't convey the meaning.

---

## ARIA Attributes

| Attribute | Purpose | Example |
|-----------|---------|---------|
| `aria-label` | Label for element (no visible text) | `<button aria-label="Fermer">X</button>` |
| `aria-labelledby` | Reference visible label | `<div aria-labelledby="title-id">` |
| `aria-describedby` | Additional description | `<input aria-describedby="help-text">` |
| `aria-required` | Field is required | `<input aria-required="true">` |
| `aria-invalid` | Field has validation error | `<input aria-invalid="true">` |
| `aria-live` | Dynamic content updates | `<div aria-live="polite">` |
| `aria-expanded` | Expandable element state | `<button aria-expanded="false">` |
| `aria-hidden` | Hide from screen readers | `<span aria-hidden="true">icon</span>` |

---

## Forms

```html
<div>
  <label for="email">Email</label>
  <input id="email" type="email" aria-required="true"
         aria-invalid="true" aria-describedby="email-error" />
  <span id="email-error" role="alert">Email invalide</span>
</div>

<!-- Group related fields -->
<fieldset>
  <legend>Type de contrat</legend>
  <label><input type="radio" name="contract" value="CDI" /> CDI</label>
  <label><input type="radio" name="contract" value="CDD" /> CDD</label>
</fieldset>

<!-- Dynamic error summary -->
<div role="alert" aria-live="assertive">
  3 erreurs dans le formulaire
</div>
```

---

## Navigation

```html
<nav aria-label="Navigation principale">
  <ul role="menubar">
    <li role="none"><a role="menuitem" href="/">Accueil</a></li>
    <li role="none"><a role="menuitem" href="/candidates" aria-current="page">Candidats</a></li>
  </ul>
</nav>

<nav aria-label="Fil d'Ariane">
  <ol>
    <li><a href="/">Accueil</a></li>
    <li><a href="/candidates">Candidats</a></li>
    <li aria-current="page">Jean Dupont</li>
  </ol>
</nav>
```

---

## Tables

```html
<table aria-label="Liste des candidats">
  <caption>Candidats correspondant aux criteres de recherche</caption>
  <thead>
    <tr>
      <th scope="col" aria-sort="ascending">Nom</th>
      <th scope="col">Competences</th>
      <th scope="col">Score</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Jean Dupont</td><td>React, TypeScript</td><td>0.92</td></tr>
  </tbody>
</table>
```

---

## Modals

```html
<div role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-desc">
  <h2 id="modal-title">Confirmer la suppression</h2>
  <p id="modal-desc">Cette action est irreversible.</p>
  <button>Confirmer</button>
  <button>Annuler</button>
</div>
```

---

## Buttons and Interactive Elements

```html
<!-- Icon-only button -->
<button aria-label="Supprimer le candidat Jean Dupont">
  <svg aria-hidden="true">...</svg>
</button>

<!-- Toggle button -->
<button aria-pressed="false" aria-label="Marquer comme favori">
  Star
</button>

<!-- Loading state -->
<button aria-busy="true" aria-disabled="true">
  <span aria-hidden="true">Spinner</span>
  Chargement...
</button>
```

---

## Live Regions

```html
<!-- Polite: announced at next pause -->
<div aria-live="polite" aria-atomic="true">
  15 resultats trouves
</div>

<!-- Assertive: interrupts immediately -->
<div aria-live="assertive" role="alert">
  Erreur: connexion perdue
</div>

<!-- Status: polite + role -->
<div role="status">
  Sauvegarde en cours...
</div>
```

---

## Testing

```bash
# axe-core
npx axe-cli https://localhost:3000

# Playwright
const violations = await new AxeBuilder({ page }).analyze();
expect(violations.violations).toHaveLength(0);
```
