# Frankenstein sur Dokploy — Git, paper et données persistantes

## Statut

Configuration préparée pour le dépôt `https://github.com/subsdischub-ui/Frankenstein`.

Cette livraison n'installe rien sur le VPS et ne déclenche aucun déploiement. Ne pas lancer l'ancien `deployment/vps/install.sh` : vos ports 80, 443 et 3000 sont déjà utilisés par Docker. Aucun second Caddy, aucune suppression d'application existante.

Le Dockerfile est destiné à Dokploy sur le VPS. Le runtime Replit ne construit ni n'exécute de conteneurs : les builds Node, les tests et la validation statique sont exécutés ici ; l'image complète doit être construite et vérifiée par Dokploy.

La variante conserve le même moteur paper et l'accès opérateur autonome. Aucun ordre réel, aucun levier, aucune clé Binance. L'application Replit reste inchangée.

## 1. Source Git et déploiement initial

Créer un projet/service **Docker Compose** Frankenstein dans Dokploy :

- Source : dépôt Git ci-dessus.
- Branche : branche de livraison validée ; ne pas activer les déploiements d'expériences non approuvées.
- Compose Path : `deployment/dokploy/compose.yaml`.
- Contexte de build : racine du dépôt ; défini dans Compose.
- Dockerfile : `deployment/dokploy/Dockerfile`.

La configuration compile le backend et le frontend autonomes, sans les services locaux Replit. Node 24.13.0 et pnpm 10.26.1 sont fixés pour reproductibilité. PostgreSQL reste sur la famille 16 ; contrôler et appliquer ses correctifs avec sauvegarde, sans changer sa version majeure implicitement.

Le workflow GitHub `validate-dokploy.yml` exécute les tests, vérifie Compose et construit l'image sans publication. Il ne déclenche pas lui-même Dokploy. Sa présence n'implique pas qu'il ait déjà été exécuté ; consulter son résultat sur le commit à déployer.

Le schéma initial crée seulement les quatre tables du laboratoire. Il est monté en lecture seule dans l'initialisation PostgreSQL. Il ne s'applique qu'à une base neuve ; les futurs changements de schéma nécessitent une migration explicite, pas une réinitialisation de volume.

## 2. Variables Dokploy

Configurer dans l'onglet **Environment**, jamais dans Git :

- `PUBLIC_ORIGIN=https://frankenstein.betterlifewithmk.com`
- `STACK_NAMESPACE=frankenstein-paper`
- `VPS_OPERATOR_USERNAME=operateur` ou autre identifiant autorisé.
- `VPS_OPERATOR_PASSWORD` : secret unique de 16 à 256 caractères.
- `FRANKENSTEIN_DB_PASSWORD` : autre secret unique, long et différent.

Les variables sont explicitement transmises aux conteneurs par Compose. Les champs vides d'env.example font échouer une configuration incomplète ; ne pas traiter ce fichier comme des identifiants utilisables.

Le compte opérateur est créé au premier démarrage uniquement, dans le volume privé. Un redeploiement ne remplace pas son mot de passe, son identifiant ou son portefeuille.

Changer la variable de mot de passe opérateur après le premier démarrage ne change pas le compte existant. Pour rotation, utiliser le script interactif dans le conteneur app :

```sh
docker exec -it -u node CONTENEUR_APP node /app/tools/create-access.mjs /var/lib/frankenstein/access.json
docker restart CONTENEUR_APP
```

Le script garde l'identité du portefeuille. Ne jamais supprimer access.json pour une rotation. PostgreSQL conserve lui aussi son mot de passe initial : une rotation DB nécessite une procédure coordonnée dans la base et la configuration, pas un simple changement d'environnement.

## 3. Domaine et réseau

Dans **Domains** de ce service Compose :

- Service cible : `app`.
- Domaine : `frankenstein.betterlifewithmk.com`.
- Port interne : `3000`.
- HTTPS : activé, certificat valide requis.

Dokploy utilise son proxy existant. Le port 3000 est exposé uniquement dans le réseau de conteneurs, pas publié sur le VPS ; sa collision avec le port hôte 3000 disparaît. PostgreSQL n'a aucun port publié.

Le réseau privé explicitement déclaré relie app à db. L'ajout du réseau proxy par Dokploy ne doit pas retirer ce lien ; contrôler le Compose final dans l'interface. La base ne doit pas rejoindre le réseau proxy partagé.

L'application écoute sur 0.0.0.0 seulement dans cette variante. Elle fait confiance à un saut proxy, conserve les contrôles d'origine exacte et les cookies Secure/HttpOnly/SameSite Strict.

## 4. Persistance et instances

Deux volumes nommés, stables à chaque redeploiement :

- `${STACK_NAMESPACE}-postgres-data` : portefeuille, événements et expériences.
- `${STACK_NAMESPACE}-private-data` : hash du compte opérateur et modèles privés.

Ne jamais utiliser `down -v`, supprimer les volumes ou changer STACK_NAMESPACE pour une simple mise à jour. Changer ce nom sélectionne de nouveaux volumes et peut donner l'impression que les données ont disparu.

Une seconde installation de test doit utiliser un autre STACK_NAMESPACE et un autre domaine. Ne pas partager les volumes ni la base entre environnement de test et production.

Maintenir une seule instance app. Le moteur et le serveur tournent ensemble ; ne pas multiplier les réplicas ni faire tourner simultanément l'ancienne et la nouvelle version pendant une expérience gelée.

La base n'est pas remplacée avec l'image applicative. L'état paper commence à 10 000 USDT en pause sur une installation neuve, mais reste conservé lors des mises à jour.

## 5. Contrôles après déploiement

Dans Dokploy, attendre le statut sain de `db` puis de `app`. Consulter les logs sans afficher les secrets.

Endpoint technique : `/api/vps-health` vérifie aussi une requête PostgreSQL. Ce healthcheck ne remplace pas la supervision des données Binance et du worker.

Dans le terminal de `app` :

```sh
node /app/tools/check-binance.mjs
```

Vérifier ensuite :

1. HTTPS valide, connexion locale puis maintien de session au rechargement.
2. Capital, journal et pause initiale corrects.
3. Scanner, dernier cycle, fraîcheur et messages OI/funding.
4. Démo replay isolée, jamais utilisée comme preuve financière.
5. Export personnel et modèle shadow si vous en importez un.
6. Démarrage explicite du paper après contrôles.

Un conteneur sain peut avoir des données de marché indisponibles : le moteur refuse alors les entrées requérant ces données. Ne pas inventer de fallback.

## 6. Circuit de mise à jour

Les changements dans Replit ne se synchronisent pas automatiquement avec GitHub.

La distribution des sources est sélective : ni pièces jointes, ni mémoire d'agent, ni secrets, ni données ou modèles utilisateur. Le script `node deployment/dokploy/export.mjs` produit une archive de sources inspectable. Elle n'est pas une synchronisation Git ; l'accès au dépôt et un push vérifié restent nécessaires.

Pour publier cette archive avec GitHub CLI déjà autorisé :

```sh
python3 deployment/dokploy/publish-branch.py --branch dokploy-paper
```

Ce script utilise l'API Git de GitHub via `gh`, sans lire ni afficher le token. Il crée uniquement une nouvelle branche `dokploy-paper` ou `dokploy-paper-SUFFIXE`, préserve les fichiers distants non remplacés et vérifie chaque hash avant création. Il refuse une branche existante, ne modifie pas main et ne fusionne rien. Pour une livraison suivante, utiliser un nouveau suffixe puis une demande de fusion contrôlée.

Circuit : modification → tests → revue de version → commit/push vers une branche de livraison → déploiement Dokploy approuvé → contrôle après déploiement.

Configurer l'auto-deploy seulement sur la branche approuvée, pas sur toutes les branches. Pour les premières versions, préférer le bouton Deploy après vérification du commit ciblé.

Avant chaque remplacement :

1. Exporter le journal et mettre les nouvelles entrées en pause.
2. Effectuer et vérifier une sauvegarde.
3. Noter les positions et la version ; une interruption de service coupe aussi la surveillance des sorties.
4. Déployer une seule instance de la version approuvée.
5. Vérifier la base, les modèles, le compte, le scanner et les logs.
6. Reprendre explicitement après validation.

Une mise à jour des règles de stratégie crée une nouvelle expérience ; ne pas fusionner les résultats avant/après pour présenter un edge artificiel.

Un rollback applicatif ne restaure pas une migration DB. Contrôler la compatibilité du schéma ; ne jamais effectuer une migration destructive sans sauvegarde et confirmation.

## 7. Sauvegarde et restauration

Depuis une session SSH autorisée sur le VPS, identifier les conteneurs dans Dokploy. Leurs noms ne sont pas les ports ni les noms de vos autres applications.

Les scripts contrôlent les labels Frankenstein avant toute opération.

```sh
bash deployment/dokploy/backup.sh CONTENEUR_APP CONTENEUR_DB
```

Le dump utilise le client PostgreSQL de la même famille que la base. Les modèles et access.json sont copiés séparément. La sauvegarde reste privée sous `/var/backups/frankenstein-dokploy` ; son hash d'accès est sensible.

Programmer une sauvegarde quotidienne avec les noms de conteneurs réellement en cours, ou configurer les sauvegardes adaptées dans Dokploy. Ce paquet ne prétend pas qu'un job automatique est déjà configuré. Vérifier la restauration et conserver une copie chiffrée hors du VPS.

```sh
bash deployment/dokploy/restore.sh CONTENEUR_APP CONTENEUR_DB CHEMIN_SAUVEGARDE
```

La restauration exige confirmation, arrête uniquement l'app Frankenstein, sauvegarde l'état précédent puis remplace ses données. Elle bloque les nouvelles entrées après restauration. En cas d'erreur, le service reste arrêté pour inspection. Ne restaurer que vos propres archives fiables.

## 8. OpenClaw, XGBoost, JEV et Laya

Voir `MODELES_ET_OPENCLAW.md`. Les rôles sont séparés :

- OpenClaw orchestre l'analyse et les expériences autorisées.
- Le modèle calcule un score/versionné à évaluer.
- Le moteur reste responsable de l'exécution paper et des contraintes de risque.

Aucune connexion OpenClaw ni API JEV/Laya n'est activée par Compose. Aucun fournisseur payant n'est appelé et aucune donnée privée n'est envoyée automatiquement.

XGBoost reste le premier candidat local à mesurer, pas une supériorité prouvée. Les modèles importés sont toujours SHADOW_UNVERIFIED ; aucun modèle ne déclenche un trade. Toute promotion exige une implémentation et un forward distincts.

## Documentation Dokploy

- Git et déploiements : https://docs.dokploy.com/docs/core/github
- Compose et volumes : https://docs.dokploy.com/docs/core/docker-compose
- Domaine Compose : https://docs.dokploy.com/docs/core/docker-compose/domains
