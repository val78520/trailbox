/* ============================================================================
   COOKIES — Bannière de consentement (RGPD / CNIL)
   ----------------------------------------------------------------------------
   Aucun traceur non essentiel n'est déposé tant que l'utilisateur n'a pas
   donné son accord explicite. Ici, le seul concerné est Google Analytics :
   son script n'est chargé QUE si le consentement est « granted ».

   • Refuser est aussi simple qu'accepter (exigence CNIL).
   • Le choix est mémorisé dans localStorage — donnée strictement nécessaire au
     fonctionnement du consentement, donc hors champ du consentement lui-même.
   • L'utilisateur peut revenir sur son choix à tout moment (« Gérer les
     cookies » dans le pied de page).
   ========================================================================== */
(function () {
  'use strict';

  var CONSENT_KEY = 'tb-cookie-consent';            // 'granted' | 'denied'
  var GA_ID       = 'G-Z7D9JWV9Z5';

  function getConsent() {
    try { return localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function setConsent(value) {
    try { localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  /* Charge Google Analytics — appelé uniquement après consentement explicite. */
  function loadAnalytics() {
    if (window.__tbGaLoaded) return;
    window.__tbGaLoaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('cookie-banner');
    if (!banner) return;

    function showBanner() { banner.hidden = false; }
    function hideBanner() { banner.hidden = true; }

    function accept() { setConsent('granted'); hideBanner(); loadAnalytics(); }
    function decline() { setConsent('denied'); hideBanner(); }

    /* État initial : on applique le choix déjà fait, sinon on affiche la bannière. */
    if (getConsent() === 'granted') {
      loadAnalytics();
    } else if (getConsent() !== 'denied') {
      showBanner();
    }

    /* Boutons de la bannière + lien « Gérer les cookies » du pied de page. */
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-cookie-action]');
      if (!trigger) return;
      var action = trigger.getAttribute('data-cookie-action');

      if (action === 'accept')  { accept(); }
      else if (action === 'decline') { decline(); }
      else if (action === 'manage') { e.preventDefault(); showBanner(); }
    });
  });
})();
