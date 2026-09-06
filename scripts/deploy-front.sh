#!/usr/bin/env bash
#
# Déploiement de la SPA Organigrad en production.
#
# Remplace le `scp -r` qui servait jusqu'au 2026-09-06 : celui-ci ajoute et
# écrase, mais ne retire jamais. Trois déploiements avaient laissé trois bundles
# `index-*.js` dans le répertoire servi, dont un seul référencé — 66 fichiers et
# 5,8 Mo là où le build en produit 37.
#
# Pourquoi une mise en scène en deux temps plutôt qu'un `rsync` direct : `rsync`
# n'existe pas sur le poste Windows (Git Bash ne le fournit pas), mais il est
# présent sur le VPS. On téléverse donc dans un répertoire temporaire, puis on
# synchronise sur place, côté serveur.
#
# Pourquoi PAS un échange de répertoires, qui serait plus atomique : le conteneur
# monte `/opt/organigrad-front/dist` en bind. Remplacer le répertoire changerait
# son inode et le montage continuerait de pointer sur l'ancien — nginx servirait
# indéfiniment l'ancienne version. La synchronisation se fait donc EN PLACE.
#
# Usage :  bash scripts/deploy-front.sh
#
set -euo pipefail

CLE="${CLE_SSH:-$HOME/.ssh/apps2026_vps}"
HOTE="${HOTE_PROD:-root@195.35.2.84}"        # srv1915630 — voir docs/etat-production-2026-09-06.md
CIBLE="/opt/organigrad-front/dist"
DATE="$(date +%Y%m%d)"
STAGING="/opt/organigrad-front/.staging-${DATE}"
ARCHIVE="/opt/organigrad-front/dist-avant-${DATE}"
DOMAINE="https://organigrad.nouvelleeredigital.fr"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

echo "=== 0. Contrôles locaux, avant de toucher au serveur ==="
test -f dist/index.html || { echo "ABANDON : dist/ absent — lance 'npm run build'"; exit 1; }
BUNDLE="$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)"
test -n "$BUNDLE" || { echo "ABANDON : index.html ne référence aucun bundle"; exit 1; }
echo "bundle local  : $BUNDLE"
echo "fichiers      : $(find dist -type f | wc -l)"

# Le marqueur qui distingue un build à jour d'un build d'avant la migration du
# 2026-09-03. Sans lui, la production repart en 5 paramètres face à une base qui
# en attend 6, et l'import casse — c'est arrivé, trois jours durant.
grep -q p_expected_updated_at "dist/${BUNDLE#assets/}" 2>/dev/null \
  || grep -rq p_expected_updated_at dist/assets/ \
  || { echo "ABANDON : le bundle ne contient pas p_expected_updated_at — build périmé ?"; exit 1; }

echo
echo "=== 1. Archivage de ce qui est servi ==="
ssh -i "$CLE" "$HOTE" "test -d '$ARCHIVE' && { echo 'archive du jour déjà présente, conservée'; exit 0; }; cp -a '$CIBLE' '$ARCHIVE' && echo \"archive : \$(find '$ARCHIVE' -type f | wc -l) fichiers\""

echo
echo "=== 2. Téléversement dans un répertoire de transit ==="
ssh -i "$CLE" "$HOTE" "rm -rf '$STAGING' && mkdir -p '$STAGING'"
scp -q -r -i "$CLE" dist/. "$HOTE:$STAGING/"
echo "transféré : $(find dist -type f | wc -l) fichiers"

echo
echo "=== 3. Synchronisation EN PLACE, avec suppression des fichiers obsolètes ==="
# --delete-after : les anciens fichiers ne disparaissent qu'une fois les
# nouveaux en place, pour ne pas servir un répertoire à moitié vide.
ssh -i "$CLE" "$HOTE" "rsync -a --delete-after '$STAGING/' '$CIBLE/' && chown -R root:root '$CIBLE' && rm -rf '$STAGING' && echo \"servi : \$(find '$CIBLE' -type f | wc -l) fichiers, \$(du -sh '$CIBLE' | cut -f1)\""

echo
echo "=== 4. Vérification — depuis l'extérieur, pas depuis la machine ==="
sleep 2
SERVI="$(curl -s --max-time 20 "$DOMAINE/" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
echo "bundle servi  : $SERVI"
if [ "$SERVI" != "$BUNDLE" ]; then
    echo "ÉCHEC : le domaine sert '$SERVI' au lieu de '$BUNDLE'."
    echo "Vérifie que la SPA est bien servie par cette machine — elle a déjà changé de VPS."
    exit 1
fi
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$DOMAINE/$BUNDLE")"
echo "bundle HTTP   : $CODE"
[ "$CODE" = "200" ] || { echo "ÉCHEC : le bundle référencé n'est pas servi."; exit 1; }

echo
echo "================================================================"
echo "DÉPLOIEMENT VÉRIFIÉ — $DOMAINE sert $BUNDLE"
echo
echo "Retour arrière :"
echo "  ssh -i \"$CLE\" $HOTE \"rsync -a --delete-after '$ARCHIVE/' '$CIBLE/'\""
echo "⚠️ Le retour arrière du bundle seul peut recréer un écart avec la base."
echo "================================================================"
