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
  if (user) {
    const initials = user.email.slice(0, 2).toUpperCase();
    navAuth.innerHTML = `
      <span class="nav-avatar" title="${user.email}">${initials}</span>
      <button class="btn btn--ghost" id="btn-signout">Se déconnecter</button>
    `;
    document.getElementById('btn-signout').addEventListener('click', handleSignOut);
  } else {
    navAuth.innerHTML = `<button class="btn btn--ghost" id="btn-login">Se connecter</button>`;
    document.getElementById('btn-login').addEventListener('click', () => openModal('login'));
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
