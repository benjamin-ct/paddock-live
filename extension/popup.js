// Fenêtre de l'extension : état de la connexion F1 TV du navigateur et de l'appli Paddock Live
const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const t = (k) => api.i18n.getMessage(k);
document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });

function show(s) {
  $('f1Dot').className = `dot ${s.signedIn ? 'on' : 'off'}`;
  $('f1Text').textContent = t(s.signedIn ? 'f1tvOn' : 'f1tvOff');
  $('login').hidden = s.signedIn;
  $('appDot').className = `dot ${s.app ? (s.app.linked ? 'on' : '') : 'off'}`;
  $('appText').textContent = !s.app ? t('appOff') : t(s.app.linked ? 'appLinked' : 'appUnlinked');
  $('get').hidden = !!s.app;
  $('send').hidden = !(s.signedIn && s.app);
  $('msg').className = s.error ? '' : 'ok';
  $('msg').textContent = s.error || (s.justSent ? t('sent') : '');
}

const ask = (msg) => api.runtime.sendMessage({ type: 'sync', ...msg }).then(show);
ask({});
$('send').onclick = () => ask({ force: true });
