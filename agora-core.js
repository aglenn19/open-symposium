// =====================================================================
//  agora-core.js: shared by the table (index.html) and the Agora (agora.html)
//  - connects to the Agora database (Supabase)
//  - sign in by emailed link, sign out, rename, delete account
//  - small helpers (portraits, dates)
//  The publishable key below is meant to be public: the database's own
//  security rules decide what anyone can read or change.
// =====================================================================
(function(){
  const SUPABASE_URL = 'https://yrkielqkfqrhswupisms.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_QWvWK4jfCZxlgFytVGqKpQ_nPkRogvv';

  const PHILOSOPHERS = ["Heraclitus","Nietzsche","Epictetus","Marcus Aurelius","Camus","Spinoza","Diogenes","Lao Tzu",
    "de Beauvoir","Alan Watts","Socrates","Plato","Aristotle","Confucius","Buddha","Kant","Rousseau","Hume","Sartre",
    "Arendt","Wittgenstein","Rumi","Kierkegaard","Mill","Hobbes","Locke","Simone Weil","Wollstonecraft","Zhuangzi",
    "Foucault","Al-Ghazali","Zeno of Citium","Emerson","Pythagoras","Descartes","Hegel","Marx","Heidegger","Augustine",
    "Epicurus","Rawls","Shankara","Fanon","Russell","Machiavelli"];

  const track = (name, data) => { try { if(window.umami && window.umami.track) window.umami.track(name, data); } catch(e){} };
  const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; };

  // a round portrait for a philosopher (falls back to initials if the image is missing)
  function face(name, size){
    const f = el('span', 'ag-face'); if(size) f.style.width = f.style.height = size + 'px';
    if(name === 'You' || !PHILOSOPHERS.includes(name)){ f.textContent = String(name).slice(0, 1).toUpperCase(); f.classList.add('ag-face-text'); return f; }
    const img = new Image(); img.alt = name; img.loading = 'lazy'; img.src = 'portraits/' + slug(name) + '.jpg';
    img.onerror = () => { img.remove(); f.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2); f.classList.add('ag-face-text'); };
    f.appendChild(img); f.title = name; return f;
  }
  // "3h ago", "Nov 14"
  function when(iso){
    const t = new Date(iso), s = (Date.now() - t) / 1000;
    if(s < 60) return 'just now';
    if(s < 3600) return Math.floor(s / 60) + 'm ago';
    if(s < 86400) return Math.floor(s / 3600) + 'h ago';
    if(s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
    return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  // turn a database error into plain words
  function plainError(err){
    const m = String((err && (err.message || err.error_description)) || err || '');
    if(/rate limit|too many|429/i.test(m)) return 'Too many sign-in emails right now. Try again in a little while.';
    if(/duplicate key|already exists|23505/i.test(m) && /nickname/i.test(m)) return 'That nickname is taken.';
    if(/check constraint.*nickname|nickname_check/i.test(m)) return 'Nicknames are 2 to 30 characters.';
    if(/row-level security|permission denied|42501/i.test(m)) return "You don't have permission to do that.";
    if(/Failed to fetch|NetworkError|network/i.test(m)) return "Couldn't reach the Agora. Check your connection.";
    return m || 'Something went wrong. Try again.';
  }

  if(!window.supabase || !window.supabase.createClient){
    // the database library didn't load (blocked or offline): everything else on the page still works
    window.agora = { ready: Promise.resolve(), offline: true, user: null, profile: null, onChange(){}, mountAccount(){},
      requireSignIn(){ return false; }, PHILOSOPHERS, slug, face, when, plainError, el, track };
    if(window.__agoraReady) window.__agoraReady(window.agora);   // tell the table page we're done loading
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const listeners = [];
  const A = { sb, user: null, profile: null, offline: false, PHILOSOPHERS, slug, face, when, plainError, el, track };

  async function refresh(){
    const { data } = await sb.auth.getSession();
    const user = (data && data.session && data.session.user) || null;
    let profile = null;
    if(user){
      const r = await sb.from('profiles').select('id,nickname,is_admin,is_banned').eq('id', user.id).maybeSingle();
      profile = r.data || null;
    }
    const changed = (A.user && A.user.id) !== (user && user.id) || JSON.stringify(A.profile) !== JSON.stringify(profile);
    A.user = user; A.profile = profile;
    if(changed) listeners.forEach(fn => { try { fn(A); } catch(e){ console.error(e); } });
  }
  A.ready = refresh();
  A.refresh = refresh;
  A.onChange = fn => { listeners.push(fn); };
  sb.auth.onAuthStateChange((evt) => { setTimeout(refresh, 0); if(evt === 'SIGNED_IN') track('signed-in'); });
  // signing in from the email link usually opens a NEW tab: pick that sign-in up here too
  window.addEventListener('storage', e => { if(e.key && e.key.startsWith('sb-')) refresh(); });
  document.addEventListener('visibilitychange', () => { if(!document.hidden) refresh(); });

  // ---------- modal helper ----------
  function modal(build){
    const back = el('div', 'ag-modal-back');
    const box = el('div', 'ag-modal'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const x = el('button', 'ag-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if(e.key === 'Escape') close(); };
    x.onclick = close; back.addEventListener('click', e => { if(e.target === back) close(); });
    document.addEventListener('keydown', esc);
    box.appendChild(x); build(box, close); back.appendChild(box); document.body.appendChild(back);
    const first = box.querySelector('input, button:not(.ag-x)'); if(first) setTimeout(() => first.focus(), 30);
    return close;
  }
  A.modal = modal;

  // ---------- sign in ----------
  // Which sign-in buttons to show: asks Supabase which providers are switched on,
  // so a Google/Facebook button only appears once it's set up in the dashboard.
  let providersP = null;
  function enabledProviders(){
    if(!providersP) providersP = fetch(SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: SUPABASE_KEY } })
      .then(r => r.ok ? r.json() : {}).then(j => (j && j.external) || {}).catch(() => ({}));
    return providersP;
  }
  const PROVIDER_NAMES = { google: 'Google', facebook: 'Facebook' };

  // Google/Facebook sign-in runs in a small popup window, so the page underneath
  // (and any unpublished conversation on it) stays exactly where it was.
  async function signInWith(provider, msg){
    const popup = window.open('', 'agora-signin', 'width=520,height=680');   // opened right away, or browsers block it
    const { data, error } = await sb.auth.signInWithOAuth({ provider,
      options: { redirectTo: location.origin + location.pathname.replace(/[^/]*$/, '') + 'signed-in.html', skipBrowserRedirect: true } });
    if(error || !data || !data.url){ if(popup) popup.close(); msg.textContent = plainError(error || 'Sign-in is not available right now.'); msg.className = 'ag-msg bad'; return; }
    track('signin-provider', { provider });
    if(popup && !popup.closed){ popup.location.href = data.url; msg.textContent = 'Finish signing in in the window that opened…'; msg.className = 'ag-msg'; return; }
    // popups blocked: sign in in this tab instead, and come back to this page afterwards
    const r = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.href.split('#')[0] } });
    if(r.error){ msg.textContent = plainError(r.error); msg.className = 'ag-msg bad'; }
  }

  function openSignIn(why){
    track('signin-opened');
    modal((box, close) => {
      // the box closes by itself as soon as sign-in finishes (in the popup or another tab)
      const watch = () => { if(A.user && box.isConnected) close(); };
      listeners.push(watch);
      box.appendChild(el('p', 'ag-modal-title', 'Sign in to the Agora'));
      box.appendChild(el('p', 'ag-modal-lead', why || 'Reading is open to everyone. Sign in to publish, and soon to vote and comment.'));
      const ageRow = el('label', 'ag-check'); const age = el('input'); age.type = 'checkbox';
      ageRow.appendChild(age); ageRow.appendChild(document.createTextNode(" I'm 13 or older and agree to the "));
      const rules = el('a', null, 'privacy policy and community rules'); rules.href = 'privacy.html'; rules.target = '_blank';
      ageRow.appendChild(rules);
      box.appendChild(ageRow);
      const msg = el('p', 'ag-msg');
      const needAge = () => { if(age.checked) return true; msg.textContent = 'Please confirm you’re 13 or older.'; msg.className = 'ag-msg bad'; return false; };

      // Google / Facebook buttons (only the ones switched on in Supabase)
      const social = el('div', 'ag-social'); box.appendChild(social);
      enabledProviders().then(on => {
        ['google', 'facebook'].filter(p => on[p]).forEach(p => {
          const b = el('button', 'ag-btn ag-provider ag-' + p, 'Continue with ' + PROVIDER_NAMES[p]); b.type = 'button';
          b.onclick = () => { if(needAge()) signInWith(p, msg); };
          social.appendChild(b);
        });
        if(social.children.length) social.appendChild(el('p', 'ag-or', 'or get a sign-in link by email'));
      });

      // email link
      const form = el('form', 'ag-form');
      const email = el('input'); email.type = 'email'; email.required = true; email.placeholder = 'Your email'; email.autocomplete = 'email';
      const go = el('button', 'ag-btn', 'Email me a sign-in link'); go.type = 'submit';
      form.append(email, go);
      form.addEventListener('submit', async e => {
        e.preventDefault(); msg.className = 'ag-msg';
        if(!needAge()) return;
        go.disabled = true; go.textContent = 'Sending…';
        const { error } = await sb.auth.signInWithOtp({ email: email.value.trim(),
          options: { emailRedirectTo: location.origin + location.pathname + location.search } });
        go.disabled = false; go.textContent = 'Email me a sign-in link';
        if(error){ msg.textContent = plainError(error); msg.className = 'ag-msg bad'; return; }
        track('signin-email-sent');
        const sent = el('div', 'ag-sent');
        sent.appendChild(el('p', 'ag-modal-lead', 'Check your inbox at ' + email.value.trim() + '.'));
        sent.appendChild(el('p', 'ag-modal-lead', 'The link signs you in. If it opens a new tab, you can come back to this one: it will notice you’re signed in.'));
        const ok = el('button', 'ag-btn', 'Done'); ok.type = 'button'; ok.onclick = close; sent.appendChild(ok);
        form.replaceWith(sent); social.remove();
      });
      box.appendChild(form);
      box.appendChild(msg);
    });
  }

  // First sign-in: everyone starts as "thinker-xxxxxx" (we never show the name Google or
  // Facebook shares), so ask once for the nickname they want shown publicly.
  function openPickNickname(){
    modal((box, close) => {
      box.appendChild(el('p', 'ag-modal-title', 'Pick a nickname'));
      box.appendChild(el('p', 'ag-modal-lead', 'This is the only name shown on what you publish. Your real name and email stay private.'));
      const form = el('form', 'ag-form');
      const nick = el('input'); nick.type = 'text'; nick.maxLength = 30; nick.placeholder = 'e.g. Socratic Sam';
      const save = el('button', 'ag-btn primary', 'Save'); save.type = 'submit';
      const later = el('button', 'ag-btn', 'Keep ' + ((A.profile && A.profile.nickname) || 'it')); later.type = 'button'; later.onclick = close;
      const msg = el('p', 'ag-msg');
      form.append(nick, save, later, msg);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const v = nick.value.trim();
        if(v.length < 2 || v.length > 30){ msg.textContent = 'Nicknames are 2 to 30 characters.'; msg.className = 'ag-msg bad'; return; }
        const { error } = await sb.from('profiles').update({ nickname: v }).eq('id', A.user.id);
        if(error){ msg.textContent = plainError(error); msg.className = 'ag-msg bad'; return; }
        track('nickname-picked'); close(); refresh();
      });
      box.appendChild(form);
    });
  }
  listeners.push(a => {
    if(window.AGORA_NO_PROMPT || !a.user || !a.profile || !/^thinker-/.test(a.profile.nickname)) return;
    const key = 'agora-nick-asked-' + a.user.id;
    try { if(localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch(e){}
    setTimeout(() => { if(!document.querySelector('.ag-modal-back')) openPickNickname(); else setTimeout(openPickNickname, 1500); }, 400);
  });
  A.openSignIn = openSignIn;
  // returns true if signed in; otherwise opens the sign-in box and returns false
  A.requireSignIn = why => { if(A.user) return true; openSignIn(why); return false; };

  // ---------- account panel ----------
  function openAccount(){
    modal((box, close) => {
      box.appendChild(el('p', 'ag-modal-title', 'Your account'));
      box.appendChild(el('p', 'ag-modal-lead', 'Signed in as ' + (A.user && A.user.email || '') + '. Only your nickname is shown publicly.'));
      const form = el('form', 'ag-form');
      const nick = el('input'); nick.type = 'text'; nick.value = (A.profile && A.profile.nickname) || ''; nick.maxLength = 30;
      const save = el('button', 'ag-btn primary', 'Save nickname'); save.type = 'submit';
      const msg = el('p', 'ag-msg');
      form.append(nick, save, msg);
      form.addEventListener('submit', async e => {
        e.preventDefault(); msg.className = 'ag-msg';
        const v = nick.value.trim();
        if(v.length < 2 || v.length > 30){ msg.textContent = 'Nicknames are 2 to 30 characters.'; msg.classList.add('bad'); return; }
        const { error } = await sb.from('profiles').update({ nickname: v }).eq('id', A.user.id);
        if(error){ msg.textContent = plainError(error); msg.classList.add('bad'); return; }
        msg.textContent = 'Saved.'; msg.classList.add('good'); refresh();
      });
      box.appendChild(form);
      const row = el('div', 'ag-row');
      const out = el('button', 'ag-btn', 'Sign out'); out.type = 'button';
      out.onclick = async () => { await sb.auth.signOut(); close(); refresh(); };
      const del = el('button', 'ag-btn danger', 'Delete account'); del.type = 'button';
      row.append(out, del); box.appendChild(row);
      const delBox = el('div', 'ag-delete'); delBox.style.display = 'none';
      delBox.appendChild(el('p', 'ag-modal-lead', 'This removes your account, votes and comments. Conversations you published stay up as “by a former member.” Type DELETE to confirm.'));
      const typed = el('input'); typed.type = 'text'; typed.placeholder = 'DELETE';
      const really = el('button', 'ag-btn danger', 'Delete my account'); really.type = 'button';
      const dmsg = el('p', 'ag-msg');
      delBox.append(typed, really, dmsg); box.appendChild(delBox);
      del.onclick = () => { delBox.style.display = 'block'; typed.focus(); };
      really.onclick = async () => {
        if(typed.value.trim() !== 'DELETE'){ dmsg.textContent = 'Type DELETE to confirm.'; dmsg.className = 'ag-msg bad'; return; }
        const { error } = await sb.rpc('delete_my_account');
        if(error){ dmsg.textContent = plainError(error); dmsg.className = 'ag-msg bad'; return; }
        track('account-deleted');
        await sb.auth.signOut(); close(); refresh();
      };
      const prof = el('a', 'ag-small-link', 'View my profile'); prof.href = 'agora.html?u=' + A.user.id;
      prof.style.marginRight = '1.2rem';
      box.appendChild(prof);
      const pp = el('a', 'ag-small-link', 'Privacy policy and community rules'); pp.href = 'privacy.html';
      box.appendChild(pp);
    });
  }
  A.openAccount = openAccount;

  // the small "Sign in" / nickname button
  A.mountAccount = container => {
    const b = el('button', 'ag-account'); b.type = 'button';
    const paint = () => {
      b.textContent = A.user ? ((A.profile && A.profile.nickname) || 'Account') : 'Sign in';
      b.classList.toggle('signed-in', !!A.user);
    };
    b.onclick = () => A.user ? openAccount() : openSignIn();
    paint(); A.onChange(paint); container.appendChild(b);
  };

  window.agora = A;
  if(window.__agoraReady) window.__agoraReady(A);   // tell the table page we're done loading
})();
