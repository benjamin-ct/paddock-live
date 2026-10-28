three.js 0.186.1 (https://github.com/mrdoob/three.js, paquet npm « three ») — licence MIT (LICENSE)

Vue 3D de la carte (public/js/ui/map3d.js), chargé seulement à l'ouverture de cette vue.
build/three.module.js et build/three.core.js réunis en un seul fichier minifié :
  npm pack three@0.186.1 && tar xzf three-0.186.1.tgz
  npx esbuild@0.25.10 package/build/three.module.js --bundle --format=esm --minify --legal-comments=none --outfile=three.module.min.js
