// Dispositions enregistrées liées à un type de séance, sans page (ui/layout.js ; testées dans test/layout-calc.test.js).
// kind (types de util.js sessionKind) : 'quali' (qualifications, sprint qualif), 'race' (course, sprint),
// 'practice' (essais libres) ; absent : aucune marque (dispositions enregistrées avant)

// Marque la disposition name pour un type de séance (une seule par type : la précédente perd sa marque) ; kind vide : sans marque
export function markSetup(list, name, kind) {
  return list.map(({ kind: k, ...s }) => {
    const mine = s.name === name ? kind : k === kind ? null : k;
    return mine ? { ...s, kind: mine } : s;
  });
}

// Disposition à remettre toute seule au début d'une séance (id : la séance ; done : dernière séance déjà vue) :
// une seule fois par séance, null sinon
export function setupToApply(list, kind, id, done) {
  return id && id !== done ? list.find((s) => s.kind === kind) || null : null;
}
