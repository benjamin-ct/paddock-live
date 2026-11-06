// Qualifs, trafic : une voiture en tour lancé qui arrive sur une voiture lente (tour de lancement ou de retour) devant
// elle sur la piste. Avec le GPS seulement. Constat de trafic, pas de jugement : la décision revient aux commissaires.
//   cars : [{ num, p, rate, hot }] ; p : progression sur la piste (secondes du tour de référence, shared/track.js) ;
//   rate : allure des dernières secondes (1 = rythme du tour de référence) ; hot : en tour lancé
//   L : durée du tour de référence
// -> [{ hot, slow, gap }] triés par écart : pour chaque voiture en tour lancé, la voiture lente la plus proche devant
// elle, si elle y arrive en moins de max secondes à son allure (gap, en s)
export function trafficAlerts(cars, L, max = 5, slowRate = 0.85) {
  const slow = cars.filter((c) => !c.hot && c.rate < slowRate);
  const out = [];
  for (const h of cars) {
    if (!h.hot || !(h.rate > 0.5)) continue;
    let best = null;
    for (const s of slow) {
      const d = (((s.p - h.p) % L) + L) % L;
      if (d > 0 && (!best || d < best.d)) best = { s, d };
    }
    const gap = best && best.d / h.rate;
    if (gap !== null && gap < max) out.push({ hot: h.num, slow: best.s.num, gap });
  }
  return out.sort((a, b) => a.gap - b.gap);
}
