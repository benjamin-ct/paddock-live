// Lecture du journal des modifications (CHANGELOG.md) : une section « ## vX.Y.Z — date » par
// version. Utilisé pour la page de chaque version publiée et l'affichage dans l'application.

// [{ version: '1.15.0', date: '2026-10-10' | null, title, body }] dans l'ordre du fichier
export function parseChangelog(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^## v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(.*))?$/.exec(line.trim());
    if (m) {
      cur = { version: m[1], date: /^\d{4}-\d{2}-\d{2}$/.test(m[2] || '') ? m[2] : null, title: (m[2] || '').trim(), lines: [] };
      out.push(cur);
    } else if (cur) cur.lines.push(line);
  }
  return out.map(({ lines, ...v }) => ({ ...v, body: lines.join('\n').trim() }));
}

// Section d'une version (« v1.15.0 » ou « 1.15.0 » ; bêta « v1.28.0-beta.3 » : celle de la 1.28.0), ou null
export function changelogFor(text, tag) {
  const v = String(tag || '').replace(/^v/, '').replace(/-.*$/, '');
  return parseChangelog(text).find((x) => x.version === v) || null;
}

// Nouveautés d'une section (« ### thème » puis « - nouveauté », lignes suivantes comprises)
function items(body) {
  const out = [];
  let theme = '';
  let cur = null;
  for (const line of String(body || '').split(/\r?\n/)) {
    const h = /^###\s+(.*)$/.exec(line);
    if (h) { theme = h[1].trim(); cur = null; } else if (/^[-*]\s+/.test(line)) { cur = { theme, text: line }; out.push(cur); } else if (cur && line.trim()) cur.text += `\n${line}`;
  }
  return out;
}

// Ce qu'une section a de plus qu'avant (bêta : ajouté depuis la bêta précédente), regroupé par thème ; '' si rien
export function newItems(prevBody, body) {
  const key = (x) => `${x.theme}|${x.text.replace(/\s+/g, ' ').trim()}`;
  const seen = new Set(items(prevBody).map(key));
  const fresh = items(body).filter((x) => !seen.has(key(x)));
  return [...new Set(fresh.map((x) => x.theme))]
    .map((t) => `${t ? `### ${t}\n` : ''}${fresh.filter((x) => x.theme === t).map((x) => x.text).join('\n')}`).join('\n\n');
}
