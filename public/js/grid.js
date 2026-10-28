// Grille de départ de la vue 3D (ui/map3d.js) : place des cases et moment où les voitures y sont posées

// Case de la place k (0 : pole) : distance du nez derrière la ligne (m) et décalage sur le côté (m, du côté où tourne
// le premier virage si turn = 1). En quinconce comme en vrai : 8 m entre deux places, 16 m entre deux cases d'un même
// côté ; la pole à 6 m de la ligne, du côté de l'intérieur du premier virage
export function gridSlot(k, turn) {
  return [6 + 8 * k, (k % 2 ? -1 : 1) * turn * 3.2];
}

// Voiture num posée sur la grille : course ou sprint pas encore parti pour elle (premier tour, aucun tour fini, pas
// abandonné), et sa place connue (GridPos, à partir de 1) -> indice de sa case, sinon -1
export function gridIndex(state, num) {
  const k = Number(state.TimingAppData?.Lines?.[num]?.GridPos) - 1, line = state.TimingData?.Lines?.[num] || {};
  const pre = state.SessionInfo?.Type === 'Race' && !line.Retired && (Number(state.LapCount?.CurrentLap) || 1) <= 1 && !(Number(line.NumberOfLaps) > 0);
  return pre && k >= 0 ? k : -1;
}

// Part de la case dans la position affichée (0 : position réelle, 1 : la case) : vers 1 quand la voiture doit y être
// (avant le départ, arrêtée ou sans position), vers 0 sinon, en une seconde (dt : secondes écoulées)
export const gridWeight = (prev, there, dt) => Math.min(1, Math.max(0, (prev || 0) + (there ? dt : -dt)));
