// Délai TV du direct : constantes communes au serveur local de l'appli (server/hub.js) et à la version web
// (relais analytics/live-relay.js, navigateur analytics/live-page/web-hub.js)
export const LOOKAHEAD_MS = 6000;   // GPS et télémétrie envoyés en avance (ils arrivent ~2-3 s après les chronos)
export const WEB_HIST_MS = 60e3;    // version web : GPS et télémétrie gardés avant le délai (traînées, vitesses)
