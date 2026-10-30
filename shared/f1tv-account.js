// Relais du direct d'un compte F1 TV (analytics/live-relay.js) : un par compte (identifiant d'abonné du jeton), pour que
// tous ses appareils (appli de bureau, version web, téléphone) le partagent, quelle que soit la connexion reçue
// (extension, appairage, renouvelée) : la F1 n'envoie le GPS qu'à une connexion par compte
const payload = (t) => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; } };
export const accountOf = (t) => { const p = payload(t); return String(p.SubscriberId || p.hashedSubscriberId || t); };
export const relayId = async (token) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(accountOf(token))))].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
