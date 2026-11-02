MapLibre GL JS 5.24.0 (https://github.com/maplibre/maplibre-gl-js, paquet npm « maplibre-gl ») — licence BSD-3 (LICENSE)

Globe du Calendrier de la Saison (public/js/ui/cal-globe.js), chargé seulement à l'ouverture du Calendrier.
Fonds de carte : OpenFreeMap (tiles.openfreemap.org, gratuit et sans clé), données © OpenMapTiles © contributeurs
OpenStreetMap. Fichiers dist/maplibre-gl.js (un seul fichier, son worker compris) et dist/maplibre-gl.css du paquet,
sans la ligne sourceMappingURL :
  npm pack maplibre-gl@5.24.0 && tar xzf maplibre-gl-5.24.0.tgz
  sed '/sourceMappingURL/d' package/dist/maplibre-gl.js > maplibre-gl.js
  sed '/sourceMappingURL/d' package/dist/maplibre-gl.css > maplibre-gl.css
