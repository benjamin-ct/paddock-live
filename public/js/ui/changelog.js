// Journal des modifications (CHANGELOG.md) dans les réglages, et nouveautés d'une version
// en attente d'installation.
import { $, esc, api } from '../util.js';
import { arrows } from '../icons.js';
import { LOCALE } from '../i18n.js';

// Mise en forme du texte du journal : titres « ### », listes « - » (lignes suivantes en retrait :
// suite du même point), gras « **…** »
export function changelogHtml(md) {
  const inline = (s) => arrows(esc(s)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
  let html = '', list = false;
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trim();
    const li = /^[-*] (.*)$/.exec(line);
    if (li) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list && line && /^\s/.test(raw)) { html = `${html.slice(0, -5)} ${inline(line)}</li>`; continue; }
    if (list) { html += '</ul>'; list = false; }
    if (!line) continue;
    const h = /^#{3,4} (.*)$/.exec(line);
    html += h ? `<h5>${inline(h[1])}</h5>` : `<p>${inline(line)}</p>`;
  }
  return list ? `${html}</ul>` : html;
}

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : 'à venir');

export async function initChangelog() {
  const box = $('#changelog');
  if (!box) return;
  try {
    const { versions } = await api('/api/changelog');
    if (!versions?.length) { box.innerHTML = '<p class="muted">Journal indisponible.</p>'; return; }
    box.innerHTML = versions.map((v, i) => `<details class="cl-ver" ${i === 0 ? 'open' : ''}>
      <summary><b>v${esc(v.version)}</b> <span class="muted">${fmtDate(v.date)}</span></summary>
      <div class="cl-body" data-no-i18n>${changelogHtml(v.body)}</div></details>`).join('');
  } catch {
    box.innerHTML = '<p class="muted">Journal indisponible.</p>';
  }
}
