// Cookies de connexion F1 TV lus par la fenêtre de connexion de l'appli de bureau : « login-session »
// (ancien site du compte) puis « entitlement_token » (site F1 TV actuel). Le serveur local vérifie
// ensuite que c'est bien un jeton d'abonnement.
const NAMES = ['login-session', 'entitlement_token'];
const onF1 = (c) => /(^|\.)formula1\.com$/.test(String(c.domain || '').replace(/^\./, ''));

// Valeurs à essayer, dans l'ordre
function loginValues(cookies) {
  return NAMES.flatMap((name) => cookies.filter((c) => c.name === name && c.value && onF1(c)).map((c) => c.value));
}

// Forme d'un cookie de connexion : noms des champs seulement, jamais leurs valeurs
function shape(raw) {
  let s = String(raw || '').trim();
  if (/^%7B/i.test(s)) { try { s = decodeURIComponent(s); } catch { /* tel quel */ } }
  let json = null;
  if (s.startsWith('{')) { try { json = JSON.parse(s); s = json?.data?.subscriptionToken || ''; } catch { /* pas du JSON */ } }
  const p = s.replace(/^Bearer\s+/i, '').split('.');
  if (p.length === 3) { try { return `JWT (${Object.keys(JSON.parse(Buffer.from(p[1], 'base64url').toString())).join(', ')})`; } catch { /* pas un JWT */ } }
  if (json) return `JSON (${Object.keys(json).join(', ')})`;
  return `${String(raw || '').length} car.`;
}

// Diagnostic quand la connexion échoue : cookies formula1.com présents (et forme des cookies de connexion)
function diagnose(cookies) {
  const seen = new Set(cookies.filter(onF1).map((c) => (NAMES.includes(c.name) ? `${c.name} : ${shape(c.value)}` : c.name)));
  return [...seen].sort().join(', ');
}

module.exports = { loginValues, diagnose };
