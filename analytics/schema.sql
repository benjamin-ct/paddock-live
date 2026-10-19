-- Base D1 des statistiques d'utilisation (une ligne par jour, fonction, appareil, version et système)
CREATE TABLE IF NOT EXISTS counts (
  day TEXT NOT NULL,
  event TEXT NOT NULL,
  device TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, event, device, version, os)
);
CREATE INDEX IF NOT EXISTS counts_event ON counts (event, day);

-- Traductions partagées entre tous les utilisateurs (clé = empreinte de « langue source|langue cible|texte »)
CREATE TABLE IF NOT EXISTS translations (
  k TEXT PRIMARY KEY,
  out TEXT NOT NULL,
  at INTEGER NOT NULL
);

-- Nombre de traductions (jour) et de radios transcrites (« radio:jour ») faites par l'IA (plafond contre les abus)
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);

-- Transcriptions partagées des radios d'équipe (clé = modèle + empreinte du fichier son ; d = durée en s)
CREATE TABLE IF NOT EXISTS radio_texts (
  k TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  d REAL,
  at INTEGER NOT NULL
);

-- Détail des erreurs (par jour, version, système, appareil) : endroit (fichier:ligne), type
-- (js, promise, server), message technique nettoyé et chemin d'appel
CREATE TABLE IF NOT EXISTS error_details (
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  os TEXT NOT NULL,
  device TEXT NOT NULL,
  kind TEXT NOT NULL,
  place TEXT NOT NULL,
  msg TEXT NOT NULL,
  stack TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, version, os, device, kind, place, msg, stack)
);

-- Page web du créateur : vérificateur de la clé et coffre chiffré des jetons (k = 'verifier' | 'vault')
CREATE TABLE IF NOT EXISTS studio (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL);
-- Essais de clé ratés, par adresse et par jour
CREATE TABLE IF NOT EXISTS studio_fail (ip TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, day));

-- Pronostics entre amis en ligne : groupes (lien /p/<id> à partager), pronostics de chaque joueur
-- (tok : jeton du navigateur ou de l'appli qui a pris le pseudo), jeton du créateur (suppression du
-- groupe) et groupes créés par adresse et par jour
CREATE TABLE IF NOT EXISTS pronos_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pronos (grp TEXT NOT NULL, year INTEGER NOT NULL, round INTEGER NOT NULL, pkey TEXT NOT NULL, name TEXT NOT NULL,
  pole TEXT, p1 TEXT, p2 TEXT, p3 TEXT, tok TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (grp, year, round, pkey));
CREATE TABLE IF NOT EXISTS pronos_admins (grp TEXT PRIMARY KEY, tok TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pronos_new (ip TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, day));

-- Questions et suggestions des utilisateurs (appli, site), lues dans le Studio ; envois par adresse et par jour
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
  contact TEXT NOT NULL, src TEXT NOT NULL, version TEXT NOT NULL, os TEXT NOT NULL, lang TEXT NOT NULL, seen INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS feedback_new (ip TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (ip, day));
-- Pièces jointes (captures, vidéos) en morceaux de 1 Mo, et jeton d'envoi de chaque message qui en annonce
CREATE TABLE IF NOT EXISTS feedback_files (msg INTEGER NOT NULL, n INTEGER NOT NULL, part INTEGER NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL,
  data BLOB NOT NULL, PRIMARY KEY (msg, n, part));
CREATE TABLE IF NOT EXISTS feedback_up (msg INTEGER PRIMARY KEY, tok TEXT NOT NULL, files INTEGER NOT NULL, at INTEGER NOT NULL);

-- Liens suivis des posts (/go/<id><réseau>) : adresse d'origine, et clics par jour, lien, réseau, pays et
-- appareil (ni cookie ni adresse IP) ; id « download » : téléchargements de l'appli par système
CREATE TABLE IF NOT EXISTS links (id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS link_clicks (day TEXT NOT NULL, id TEXT NOT NULL, net TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, id, net, country, device));
