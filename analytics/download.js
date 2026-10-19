// Téléchargement de l'appli depuis le site : /download/<système> renvoie vers le fichier de la
// dernière version publiée sur GitHub (le nom des fichiers change à chaque version) ;
// /download/latest.json donne le numéro de version au site. La version est lue sur la redirection
// publique de GitHub (/releases/latest -> /releases/tag/vX.Y.Z) : l'API de GitHub limite les
// requêtes venant des adresses partagées de Cloudflare. Gardée 10 minutes.
const REPO = 'benjamin-ct/paddock-live';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
// Fichiers publiés par le workflow « Application de bureau » (v = numéro de version sans « v »)
export const FILES = {
  windows: (v) => `Paddock-Live-${v}-x64-win.exe`,
  'windows-portable': (v) => `Paddock-Live-${v}-portable.exe`,
  'mac-arm': (v) => `Paddock-Live-${v}-mac-arm64.dmg`,
  'mac-intel': (v) => `Paddock-Live-${v}-mac-x64.dmg`,
  linux: (v) => `Paddock-Live-${v}-linux-x86_64.AppImage`,
  'linux-arm': (v) => `Paddock-Live-${v}-linux-arm64.AppImage`,
  deb: (v) => `Paddock-Live-${v}-linux-amd64.deb`,
};
const KEEP = 10 * 60e3;
let memo = null;

export async function latestVersion({ fetchFn = fetch, now = Date.now() } = {}) {
  if (memo && now - memo.at < KEEP) return memo.v;
  const r = await fetchFn(RELEASES, { redirect: 'manual', headers: { 'User-Agent': 'paddock-live-site' } });
  const v = (r.headers.get('Location') || '').match(/\/releases\/tag\/v?(\d+\.\d+\.\d+)$/)?.[1];
  if (!v) throw new Error(`GitHub ${r.status}`);
  memo = { at: now, v };
  return v;
}

export async function download(path, opts = {}) {
  const what = path.replace(/^\/download\/?/, '');
  const cache = { 'Cache-Control': 'public, max-age=300' };
  // Version copiée sur Cloudflare d'abord (GitHub limite les demandes venant de Cloudflare)
  let v = (await (await opts.env?.MEDIA?.get('releases/version').catch(() => null))?.text())?.trim() || null;
  if (!v) try { v = await latestVersion(opts); } catch { /* GitHub injoignable : page des versions */ }
  if (what === 'latest.json') {
    return new Response(JSON.stringify({ version: v, files: Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, v ? f(v) : null])) }), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...cache } });
  }
  const file = FILES[what] && v ? FILES[what](v) : null;
  return new Response(null, { status: 302, headers: { Location: file ? `/dl/${file}` : RELEASES, ...cache } });
}

// /dl/<fichier> : copie de la dernière version sur Cloudflare (R2, déposée par le workflow « Application de
// bureau »), bien plus rapide depuis l'Europe que GitHub (serveurs aux États-Unis) ; morceaux (Range) acceptés
// pour la mise à jour de l'appli. releases/version : version copiée ; releases/<fin du nom> : fichier, remplacé
// à chaque version. Autre version, ou copie absente : fichier de GitHub.
export async function mirror(req, env, name) {
  const m = /^Paddock-Live-(\d+\.\d+\.\d+)-([\w.-]+)$/.exec(name);
  if (!m) return new Response('Fichier inconnu', { status: 404 });
  const github = Response.redirect(`https://github.com/${REPO}/releases/download/v${m[1]}/${name}`, 302);
  if ((await (await env.MEDIA?.get('releases/version'))?.text())?.trim() !== m[1]) return github;
  const obj = await env.MEDIA.get(`releases/${m[2]}`, req.headers.has('Range') ? { range: req.headers } : {});
  if (!obj?.body) return github;
  const part = req.headers.has('Range') && obj.range;
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"`, 'Accept-Ranges': 'bytes', ETag: obj.httpEtag };
  if (!part) return new Response(obj.body, { headers: { ...headers, 'Content-Length': String(obj.size) } });
  const end = part.offset + part.length - 1;
  return new Response(obj.body, { status: 206, headers: { ...headers, 'Content-Length': String(part.length), 'Content-Range': `bytes ${part.offset}-${end}/${obj.size}` } });
}
