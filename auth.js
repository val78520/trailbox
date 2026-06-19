/* ============================================================================
   TRAIL BOX — Auth
   Gestion de la session utilisateur via Supabase.
   ========================================================================== */

const SUPABASE_URL     = 'https://dluwfngzwmzsfmuteibn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ccsSDrV8nhAaNUKN-XRVPQ_gbMGXYMk';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---- Références DOM ------------------------------------------------------- */
const modal        = document.getElementById('auth-modal');
const overlay      = document.getElementById('auth-overlay');
const btnClose     = document.getElementById('auth-close');
const tabLogin     = document.getElementById('auth-tab-login');
const tabSignup    = document.getElementById('auth-tab-signup');
const formLogin    = document.getElementById('auth-form-login');
const formSignup   = document.getElementById('auth-form-signup');
const msgEl        = document.getElementById('auth-msg');
const navAuth      = document.getElementById('nav-auth');

/* ---- Modal ---------------------------------------------------------------- */
function openModal(tab = 'login') {
  modal.hidden   = false;
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  switchTab(tab);
  hideMsg();
}

function closeModal() {
  modal.hidden   = true;
  overlay.hidden = true;
  document.body.style.overflow = '';
  formLogin.reset();
  formSignup.reset();
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  tabLogin.setAttribute('aria-selected',  isLogin ? 'true' : 'false');
  tabSignup.setAttribute('aria-selected', isLogin ? 'false' : 'true');
  formLogin.hidden  = !isLogin;
  formSignup.hidden = isLogin;
  hideMsg();
  requestAnimationFrame(() => {
    (isLogin ? formLogin : formSignup).querySelector('input')?.focus();
  });
}

function showMsg(text, type = 'error') {
  msgEl.textContent  = text;
  msgEl.dataset.type = type;
  msgEl.hidden       = false;
}

function hideMsg() {
  msgEl.hidden = true;
}

/* ---- Nav ------------------------------------------------------------------ */
function updateNav(user) {
  const baseline = document.getElementById('hero-baseline');

  if (user) {
    const firstName = user.user_metadata?.first_name;
    const lastName  = user.user_metadata?.last_name;
    const initials  = firstName && lastName
      ? (firstName[0] + lastName[0]).toUpperCase()
      : user.email.slice(0, 2).toUpperCase();

    navAuth.innerHTML = `
      <span class="nav-avatar" title="${user.email}">${initials}</span>
      <button class="btn btn--ghost btn-signout" id="btn-signout" aria-label="Se déconnecter">
        <svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span class="btn-label">Se déconnecter</span>
      </button>
    `;
    document.getElementById('btn-signout').addEventListener('click', handleSignOut);

    if (baseline && firstName) {
      baseline.textContent = `Bienvenu.e ${firstName}, arrête de calculer ton allure sur un coin de nappe.`;
    }
  } else {
    navAuth.innerHTML = `<button class="btn btn--ghost" id="btn-login">Se connecter</button>`;
    document.getElementById('btn-login').addEventListener('click', () => openModal('login'));

    if (baseline) {
      baseline.textContent = 'Arrête de calculer ton allure sur un coin de nappe.';
    }
  }
}

/* ---- Actions auth --------------------------------------------------------- */
async function handleSignIn(e) {
  e.preventDefault();
  const btn = formLogin.querySelector('button[type="submit"]');
  btn.disabled    = true;
  btn.textContent = 'Connexion…';
  hideMsg();

  const { error } = await sb.auth.signInWithPassword({
    email:    document.getElementById('login-email').value,
    password: document.getElementById('login-password').value,
  });

  btn.disabled    = false;
  btn.textContent = 'Se connecter';

  if (error) showMsg('Email ou mot de passe incorrect.');
  else        closeModal();
}

async function handleSignUp(e) {
  e.preventDefault();
  const btn = formSignup.querySelector('button[type="submit"]');
  btn.disabled    = true;
  btn.textContent = 'Création…';
  hideMsg();

  const { data, error } = await sb.auth.signUp({
    email:    document.getElementById('signup-email').value,
    password: document.getElementById('signup-password').value,
    options: {
      data: {
        first_name: document.getElementById('signup-firstname').value.trim(),
        last_name:  document.getElementById('signup-lastname').value.trim(),
      },
    },
  });

  btn.disabled    = false;
  btn.textContent = 'Créer mon compte';

  if (error) {
    showMsg(error.message);
  } else if (data.session) {
    closeModal();
  } else {
    showMsg('Vérifie ta boîte mail pour confirmer ton compte.', 'success');
  }
}

async function handleSignOut() {
  await sb.auth.signOut();
}

/* ---- Listeners ------------------------------------------------------------ */
tabLogin.addEventListener('click',  () => switchTab('login'));
tabSignup.addEventListener('click', () => switchTab('signup'));
btnClose.addEventListener('click',  closeModal);
overlay.addEventListener('click',   closeModal);
formLogin.addEventListener('submit',  handleSignIn);
formSignup.addEventListener('submit', handleSignUp);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

/* ---- Session -------------------------------------------------------------- */
sb.auth.onAuthStateChange((_event, session) => updateNav(session?.user ?? null));

sb.auth.getSession().then(({ data: { session } }) => updateNav(session?.user ?? null));
