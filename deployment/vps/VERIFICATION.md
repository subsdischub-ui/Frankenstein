# Vérification du paquet VPS

## Vérifié dans cet environnement

- Backend et frontend autonomes compilés.
- Bundle serveur déplacé hors du dossier de build et démarré avec PostgreSQL.
- Tous les fichiers serveur passent la vérification syntaxique Node.
- Absence de chemin absolu workspace, sidecar Replit et clé Clerk dans les bundles contrôlés.
- Six tests : connexion/déconnexion, cookies, origine, limitation des tentatives, rotation/expiration, stockage privé.
- Parcours navigateur réel : mauvais mot de passe, connexion, identité opérateur, 10 000 USDT virtuels, maintien de session au rechargement, démarrage puis pause persistée, téléchargement JSON privé, déconnexion et refus 401 des commandes/exports.
- Typecheck du projet existant réussi après ajout des liens de téléchargement.

Le test navigateur utilise un compte temporaire isolé, HTTP uniquement en NODE_ENV=test et un worker désactivé. L'installation normale impose HTTPS, crée son accès sur le VPS et active le worker. Aucun identifiant temporaire ne figure dans le paquet.

## À vérifier sur le VPS

- Installation des paquets Ubuntu/Debian, identité Unix et accès PostgreSQL peer.
- Configuration Caddy, DNS et émission du certificat TLS.
- Services systemd, redémarrage machine et timer de sauvegarde.
- Dump et restauration réelle sur une base de test.
- Disponibilité des endpoints Binance et fraîcheur sous Node depuis le VPS.
- Compte local créé par l'utilisateur, reprise du portefeuille et modèles après redémarrage.

Ces opérations n'ont pas été exécutées sur le VPS de l'utilisateur. La livraison n'affirme pas que le déploiement est déjà installé.

## Binance et performances

Les tests fournis par l'utilisateur montrent HTTP 200 sur le VPS pour l'heure Futures, OI, funding historique, premiumIndex et les bougies Spot. La disponibilité de tous les endpoints est contrôlée par le script de diagnostic livré.

Cela ne valide pas une stratégie, des permissions d'ordre réel ou une simulation de levier. Le compte initial n'inclut aucun résultat de marché inventé.
