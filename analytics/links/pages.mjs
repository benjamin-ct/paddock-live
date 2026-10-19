// Pages « tous mes liens » à mettre en bio des réseaux : /liens (Paddock Live) et /benjy (Benjy Paddock).
// Générées par scripts/build-studio.mjs dans analytics/site.

// Pictogrammes simples (dessinés ici, pas les logos officiels)
const ICONS = {
  site: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.6" cy="7.4" r=".9" fill="currentColor" stroke="none"/>',
  facebook: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M13.5 20v-7h2.3l.4-2.6h-2.7V8.9c0-.8.3-1.3 1.4-1.3h1.4V5.3c-.3 0-1.1-.1-2-.1-2 0-3.4 1.2-3.4 3.5v1.7H8.6V13h2.3v7"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.4 2 4 4.5 4.2"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4.3-2.5z" fill="currentColor" stroke="none"/>',
  x: '<path d="M5 4l14 16M19 4L5 20"/>',
  threads: '<path d="M16.5 11.2c-.3-2.6-2-4-4.5-4-2.8 0-4.6 2.2-4.6 4.9 0 2.9 1.8 4.9 4.7 4.9 2.3 0 4-1.3 4-3.2 0-1.8-1.6-2.8-3.6-2.8-1.6 0-2.7.8-2.7 2 0 1 .9 1.7 2.1 1.7 2 0 3.1-1.6 3.1-4.4"/><path d="M12 21c-5 0-8-3.6-8-9s3-9 8-9c3.7 0 6.3 1.8 7.4 5"/>',
  bluesky: '<path d="M12 11.5C10.4 8.3 7 5 4.8 5 3.6 5 3.5 6.3 3.8 8.2c.4 2.4 1.7 3.6 4.4 3.6-2.8.5-3.3 2.3-1.9 3.8 2.6 2.7 4.4.3 5.7-2.6 1.3 2.9 3.1 5.3 5.7 2.6 1.4-1.5.9-3.3-1.9-3.8 2.7 0 4-1.2 4.4-3.6.3-1.9.2-3.2-1-3.2-2.2 0-5.6 3.3-7.2 6.5z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>`;

export const PAGES = {
  liens: {
    name: 'Paddock Live',
    avatar: '<img src="/site/img/logo.png" alt="">',
    bio: 'La F1 en direct, calée sur ta TV. Chronos, carte GPS, radios traduites et stratégie, sans spoiler.',
    main: [['download', 'Télécharger l\'appli (gratuite)', 'Windows, macOS, Linux', 'https://paddocklive.app/#telecharger'], ['site', 'Le site', 'paddocklive.app', 'https://paddocklive.app/']],
    nets: [
      ['instagram', 'Instagram', '@paddockliveapp', 'https://www.instagram.com/paddockliveapp/'],
      ['facebook', 'Facebook', 'paddockliveapp', 'https://www.facebook.com/paddockliveapp'],
      ['tiktok', 'TikTok', '@paddockliveapp', 'https://www.tiktok.com/@paddockliveapp'],
      ['youtube', 'YouTube', '@paddockliveapp', 'https://www.youtube.com/@paddockliveapp'],
      ['x', 'X', '@paddockliveapp', 'https://x.com/paddockliveapp'],
      ['threads', 'Threads', '@paddockliveapp', 'https://www.threads.com/@paddockliveapp'],
      ['bluesky', 'Bluesky', '@paddocklive.app', 'https://bsky.app/profile/paddocklive.app'],
    ],
    other: ['Les récaps de chaque Grand Prix', 'Benjy Paddock', 'Podium, classement et faits marquants', '/benjy/', 'BP'],
  },
  benjy: {
    name: 'Benjy Paddock',
    avatar: '<span class="mono">BP</span>',
    bio: 'Les récaps de chaque Grand Prix dès le drapeau à damier : podium, classement, faits marquants et course au titre.',
    main: [],
    nets: [
      ['instagram', 'Instagram', '@benjypaddock', 'https://www.instagram.com/benjypaddock/'],
      ['facebook', 'Facebook', 'benjypaddock', 'https://www.facebook.com/benjypaddock'],
      ['tiktok', 'TikTok', '@benjypaddock', 'https://www.tiktok.com/@benjypaddock'],
      ['youtube', 'YouTube', '@benjypaddock', 'https://www.youtube.com/@benjypaddock'],
      ['x', 'X', '@benjypaddock', 'https://x.com/benjypaddock'],
      ['threads', 'Threads', '@benjypaddock', 'https://www.threads.com/@benjypaddock'],
      ['bluesky', 'Bluesky', '@benjy.paddocklive.app', 'https://bsky.app/profile/benjy.paddocklive.app'],
    ],
    other: ['Récaps faits avec l\'appli', 'Paddock Live', 'La F1 en direct, sans spoiler', '/liens/', 'PL'],
  },
};

// Lien sortant d'une page : [titre, adresse], ou null (clics comptés par /go/<page>/<pictogramme>)
export function bioTarget(page, key) {
  const p = PAGES[page];
  const hit = p && [...p.main, ...p.nets].find(([k, , , href]) => k === key && !href.startsWith('/'));
  return hit ? [hit[1], hit[3]] : null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Liens sortants : par /go/<page>/<pictogramme> (clic compté, puis l'adresse d'origine)
const link = ([icon, title, sub, href], cls = '', mono = '', page = '') => `<a class="lk ${cls}" href="${esc(href.startsWith('/') || !page ? href : `/go/${page}/${icon}`)}"${href.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>
      <span class="ic ic-${icon}">${mono ? `<span class="mono">${esc(mono)}</span>` : svg(icon)}</span><span class="tx"><b>${esc(title)}</b><small>${esc(sub)}</small></span>${svg('arrow')}</a>`;

export function linksPage(id) {
  const p = PAGES[id];
  const url = `https://paddocklive.app/${id}/`;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.name)} · tous les liens</title>
<meta name="description" content="${esc(p.bio)}">
<meta name="theme-color" content="#0b0c0f">
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(p.name)}">
<meta property="og:description" content="${esc(p.bio)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="https://paddocklive.app/site/img/apercu.png">
<meta property="og:site_name" content="Paddock Live">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="${url}">
<link rel="icon" href="/site/img/logo.png">
<link rel="apple-touch-icon" href="/site/img/apple-touch-icon.png">
<style>
@font-face { font-family: 'Titillium Web'; font-weight: 400; font-display: swap; src: url('/fonts/titillium-400.woff2') format('woff2'); }
@font-face { font-family: 'Titillium Web'; font-weight: 700; font-display: swap; src: url('/fonts/titillium-700.woff2') format('woff2'); }
@font-face { font-family: 'Saira Condensed'; font-weight: 800; font-display: swap; src: url('/fonts/sairacondensed-800.woff2') format('woff2'); }
:root { color-scheme: dark; --bg: #0b0c0f; --card: #15171c; --card-2: #1c1f26; --line: rgba(255, 255, 255, .08); --line-2: rgba(255, 255, 255, .16);
  --text: #f2f1ee; --muted: #8f8d87; --red: #e10600; --red-2: #ff3b30; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(120% 60% at 50% -10%, rgba(225, 6, 0, .28), transparent 60%), var(--bg); color: var(--text);
  font: 16px/1.45 'Titillium Web', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
main { width: 100%; max-width: 480px; margin: 0 auto; padding: max(40px, env(safe-area-inset-top)) 16px 40px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.av { width: 96px; height: 96px; border-radius: 26px; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #e10600, #8a0400);
  box-shadow: 0 10px 30px rgba(225, 6, 0, .35); margin-bottom: 6px; }
.av img { width: 100%; height: 100%; object-fit: cover; }
.mono { font: 800 44px/1 'Saira Condensed', 'Arial Narrow', sans-serif; letter-spacing: -.5px; color: #fff; }
h1 { margin: 0; font: 800 34px/1.05 'Saira Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: .3px; }
.bio { margin: 0 0 12px; text-align: center; color: #c8c7c1; max-width: 400px; }
.list { width: 100%; display: flex; flex-direction: column; gap: 10px; }
.lk { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 16px; background: var(--card); border: 1px solid var(--line);
  color: var(--text); text-decoration: none; transition: transform .15s, border-color .15s, background-color .15s; }
.lk:hover { border-color: var(--line-2); background: var(--card-2); transform: translateY(-1px); }
.lk:focus-visible { outline: 2px solid var(--red-2); outline-offset: 2px; }
.lk.main { background: var(--red); border-color: var(--red); }
.lk.main:hover { background: var(--red-2); border-color: var(--red-2); }
.lk.main .ic { background: rgba(0, 0, 0, .22); color: #fff; }
.lk.main small { color: rgba(255, 255, 255, .85); }
.ic { width: 40px; height: 40px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--card-2); color: var(--text); }
.ic svg, .lk > svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.lk > svg { width: 18px; height: 18px; margin-left: auto; opacity: .55; }
.tx { display: flex; flex-direction: column; min-width: 0; }
.tx b { font-weight: 700; }
.tx small { color: var(--muted); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ic-other { background: linear-gradient(135deg, #e10600, #8a0400); } .ic-other .mono { font-size: 19px; }
.ic-instagram { color: #ff4f8b; } .ic-facebook { color: #4f8cff; } .ic-tiktok { color: #25f4ee; } .ic-youtube { color: #ff3b30; } .ic-threads, .ic-x { color: #f2f1ee; } .ic-bluesky { color: #4f9bff; }
.sep { width: 100%; margin: 14px 0 4px; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
footer { margin-top: 22px; font-size: 13px; color: var(--muted); text-align: center; }
footer a { color: var(--muted); }
@media (prefers-reduced-motion: reduce) { .lk { transition: none; } .lk:hover { transform: none; } }
</style>
</head>
<body>
<main>
  <div class="av">${p.avatar}</div>
  <h1>${esc(p.name)}</h1>
  <p class="bio">${esc(p.bio)}</p>
  ${p.main.length ? `<div class="list">${p.main.map((m, i) => link(m, i ? '' : 'main', '', id)).join('')}</div>` : ''}
  <div class="sep">Réseaux</div>
  <div class="list">${p.nets.map((n) => link(n, '', '', id)).join('')}</div>
  <div class="sep">${esc(p.other[0])}</div>
  <div class="list">${link(['other', p.other[1], p.other[2], p.other[3]], '', p.other[4])}</div>
  <footer><a href="https://paddocklive.app/">paddocklive.app</a> · <a href="/legal/privacy">Confidentialité</a> · © 2026 Paddock Live</footer>
</main>
</body>
</html>
`;
}
