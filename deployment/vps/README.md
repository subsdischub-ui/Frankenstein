# Frankenstein — installation VPS paper-only

## Ce que contient le paquet

Application compilée : interface française, moteur identique au laboratoire, API et scripts de recherche. Aucun ordre réel, aucun levier et aucune clé Binance.

Le paquet utilise un compte opérateur local, pas le tenant Clerk géré par Replit. Le mot de passe est créé sur votre VPS, haché avec scrypt et jamais inclus dans l'archive. Sessions HTTP-only/SameSite Strict de huit heures ; tout redémarrage invalide les sessions, pas les données.

Les modèles privés sont stockés sur disque, sous `/var/lib/frankenstein/models`, et leurs métadonnées restent dans PostgreSQL. Le VPS est une installation séparée : nouveau portefeuille paper de 10 000 USDT, initialement en pause. Les comptes et données Replit ne sont ni supprimés ni transférés automatiquement.

L'observatoire public et la démonstration restent consultables comme dans l'application initiale ; les commandes, expériences personnelles, exports et modèles exigent la connexion opérateur. Pas d'inscription publique, pas de MFA intégré. Si vous souhaitez rendre l'ensemble du site privé ou inviter plusieurs opérateurs, une évolution distincte est nécessaire.

## Prérequis

- VPS Linux x86_64, Ubuntu 24.04 ou Debian 12/13.
- Au moins 2 Go de RAM recommandés et de l'espace disque pour PostgreSQL/sauvegardes.
- Accès SSH avec sudo, sans partager les identifiants avec l'assistant.
- Sous-domaine dédié, par exemple `labo.exemple.fr`, pointant vers l'IP du VPS. Ne garder une entrée AAAA que si IPv6 fonctionne réellement.
- Ports 80/443 accessibles pour HTTPS ; SSH conservé. Le port 3000 reste lié au loopback, PostgreSQL utilise le socket Unix.
- Le paquet refuse les ports web déjà utilisés par un serveur autre que Caddy. Ne pas arrêter votre serveur web existant pour forcer l'installation ; intégrer le site au proxy existant séparément.

L'installateur ajoute PostgreSQL, Caddy, un runtime Node.js 24.13.0 dédié et trois unités systemd. Il ne remplace pas votre Node global, ne configure pas de VPN et ne modifie pas votre pare-feu. Il demande confirmation. Ne l'exécuter que sur un VPS compatible après lecture.

## 1. Télécharger et vérifier

Télécharger `frankenstein-vps.zip` depuis Évolution, ainsi que le guide imprimable et le checksum communiqués avec la livraison.

Si l'archive est sur votre Windows :

```powershell
scp .\frankenstein-vps.zip utilisateur@ADRESSE_DU_VPS:~
```

Si elle est sur votre Mac :

```sh
scp ~/Downloads/frankenstein-vps.zip utilisateur@ADRESSE_DU_VPS:~
```

Remplacer les chemins, le nom d'utilisateur et l'adresse. Ne jamais inclure de mot de passe dans la commande ou le chat.

Sur le VPS :

```sh
sha256sum ~/frankenstein-vps.zip
sudo apt-get update
sudo apt-get install -y unzip
mkdir -p ~/frankenstein-vps-install
unzip ~/frankenstein-vps.zip -d ~/frankenstein-vps-install
cd ~/frankenstein-vps-install/frankenstein-vps
sha256sum -c SHA256SUMS
```

Comparer le hash externe de l'archive à celui affiché lors de la livraison. Les hashes internes détectent la corruption, pas à eux seuls l'identité de l'émetteur.

## 2. Installer

Vérifier que le DNS du sous-domaine pointe bien vers le VPS, puis :

```sh
sudo bash install.sh labo.exemple.fr
```

Saisir `INSTALLER` uniquement après vérification du domaine et des conséquences annoncées. Créer l'identifiant et un mot de passe unique d'au moins 16 caractères lorsqu'ils sont demandés. Le mot de passe n'est pas affiché ni envoyé à Replit.

L'authentification PostgreSQL est locale, par identité Unix, sans mot de passe de base dans un fichier. L'installateur ne modifie pas `pg_hba.conf` : si votre PostgreSQL a une configuration non standard, il peut refuser ; faire corriger explicitement l'accès local, jamais ouvrir la base au réseau public.

Le diagnostic teste les endpoints effectivement utilisés. S'il échoue, l'activation du moteur s'arrête et les fichiers sont conservés pour diagnostic. Ne pas contourner un HTTP 451 ni remplacer les valeurs manquantes par zéro.

En cas d'échec partiel, ne pas relancer aveuglément l'installateur : il refuse une installation existante pour protéger les données. Consulter les messages et commandes de diagnostic ci-dessous.

## 3. Vérifier avant de démarrer le paper

```sh
sudo systemctl status frankenstein --no-pager
sudo journalctl -u frankenstein -n 80 --no-pager
curl --fail http://127.0.0.1:3000/api/healthz
sudo /opt/frankenstein/node/bin/node /opt/frankenstein/tools/check-binance.mjs
sudo systemctl list-timers frankenstein-backup.timer --no-pager
timedatectl status
```

Ouvrir `https://labo.exemple.fr/sign-in`. Le certificat doit être valide : ne pas ignorer les avertissements TLS.

L'horloge du VPS doit être synchronisée. Un décalage peut rendre les contrôles de fraîcheur et les clôtures de bougies incorrects.

Se connecter avec le compte local, puis :

1. Cockpit : vérifier capital virtuel 10 000 USDT, mode PAPER ONLY et pause initiale.
2. Vérifier la fraîcheur du dernier scan et le message des données.
3. Scanner : vérifier les raisons des refus et actifs indisponibles.
4. Laboratoire : lancer la démonstration technique, sans la confondre avec un résultat stratégique.
5. Évolution : vérifier que l'export personnel fonctionne.
6. Cockpit : démarrer explicitement seulement après ces contrôles.

Fermer le navigateur ou le portable ne coupe pas le service VPS. Cela ne garantit pas la disponibilité réseau, Binance ou de l'hébergeur : surveiller heartbeat, erreurs et incidents.

## 4. Exploitation

```sh
sudo systemctl restart frankenstein
sudo journalctl -u frankenstein -f
```

Un redémarrage conserve le portefeuille et ses états ; il impose une nouvelle connexion. Si les entrées étaient activées avant le redémarrage, elles restent activées après restauration normale de l'état. Pour un redémarrage de maintenance, utiliser d'abord Pause dans le cockpit.

Pause/Arrêt d'urgence : bloquent les entrées, continuent la surveillance des sorties tant que le service tourne. Ils ne liquident pas immédiatement les positions.

`systemctl stop frankenstein` arrête aussi la surveillance : ne pas le confondre avec Pause. Avant une maintenance, suivre les positions paper et documenter l'interruption.

Le service redémarre après panne, avec limite de dix démarrages en cinq minutes. Après panne répétée :

```sh
sudo journalctl -u frankenstein -n 100 --no-pager
sudo systemctl reset-failed frankenstein
sudo systemctl start frankenstein
```

Ne jamais masquer l'erreur avant reprise.

## 5. Sauvegardes et restauration

Une sauvegarde quotidienne conserve le dump PostgreSQL, les fichiers privés et le hash du mot de passe, dans `/var/backups/frankenstein`. Ces archives sont sensibles et doivent rester privées.

```sh
sudo -u frankenstein /opt/frankenstein/tools/backup.sh
sudo ls /var/backups/frankenstein
```

Il n'y a pas de suppression automatique. Surveiller l'espace disque, définir une rétention après essai de restauration et copier des sauvegardes chiffrées hors du VPS. Une sauvegarde sur le même serveur ne protège pas contre sa perte.

La cohérence des modèles est favorisée par l'écriture du fichier avant sa référence en base et l'absence de suppression des modèles retirés. Pour un point de restauration strict pendant maintenance, mettre en pause puis arrêter brièvement le service avant la sauvegarde, en documentant l'absence de surveillance.

La restauration remplace les données VPS actuelles. Elle crée une sauvegarde préalable et exige une confirmation :

```sh
sudo bash /opt/frankenstein/tools/restore.sh /var/backups/frankenstein/DATE_DE_LA_SAUVEGARDE
```

Ne restaurer que vos propres archives vérifiées. Les entrées sont bloquées après restauration ; contrôler le journal et les positions avant de reprendre. Une erreur de restauration laisse le service arrêté pour éviter une reprise incohérente.

## 6. Changer ou réinitialiser le mot de passe

```sh
sudo -u frankenstein /opt/frankenstein/node/bin/node \
  /opt/frankenstein/tools/create-access.mjs /var/lib/frankenstein/access.json
sudo systemctl restart frankenstein
```

L'identité du portefeuille est conservée. Le redémarrage invalide toutes les sessions. Ne pas supprimer `access.json` pour une rotation : un propriétaire personnalisé pourrait être perdu.

## 7. Mises à jour

Ne pas utiliser l'installateur initial pour une mise à jour.

1. Exporter le journal, mettre le paper en pause et noter les positions.
2. Effectuer et vérifier une sauvegarde.
3. Vérifier les hashes du nouveau paquet, puis arrêter le service.
4. Conserver une copie de `/opt/frankenstein/app`.
5. Remplacer uniquement l'application compilée par la nouvelle version.
6. Ne pas remplacer `/var/lib/frankenstein`, `access.json`, PostgreSQL ou `vps.env`.
7. Ne pas appliquer un nouveau schéma SQL sans vérifier ses changements.
8. Redémarrer, vérifier l'état et les logs avant reprise explicite.

Revenir à l'ancienne application ne suffit pas à annuler une migration de base. Une migration destructive future nécessite sauvegarde, consentement et procédure distincte.

## 8. Dépannage

- 502 : vérifier `systemctl status frankenstein`, le port configuré et les logs Caddy.
- Certificat absent : DNS A/AAAA, accès 80/443 et logs `journalctl -u caddy`. Ne pas contourner le HTTPS.
- Connexion refusée : vérifier l'identifiant local et l'origine exacte `PUBLIC_ORIGIN=https://domaine`, sans slash final ; aucun compte Clerk ne se transfère.
- Trop de tentatives : patienter 15 minutes. Cinq échecs par adresse déclenchent la limitation.
- PostgreSQL inaccessible : état du service et authentification locale peer. Ne jamais imprimer une chaîne contenant un mot de passe.
- Futures absent : diagnostic public, erreurs et fraîcheur. Ne pas créer de clé d'ordre pour cela.
- Zéro trades : possible résultat normal des règles, pas une panne présumée.
- Service non activé après diagnostic : corriger la cause, vérifier Caddy puis `systemctl enable --now frankenstein frankenstein-backup.timer` et `systemctl reload caddy`.

## 9. Validation et limites

Lire `research/PROTOCOLE_VALIDATION.md`. Les imports restent non vérifiés, les modèles sont shadow et la baseline reste seule décisionnaire.

L'archive est une livraison à installer par l'utilisateur : aucun accès SSH, aucune installation ni aucun déploiement sur le VPS n'ont été effectués par l'assistant.

Le compte local unique n'est pas une plateforme multi-utilisateurs et n'inclut pas de récupération email ou MFA. Une restriction réseau privée supplémentaire peut être ajoutée selon vos besoins, sans utiliser un VPN pour contourner l'exchange.

Les données anciennes disponibles doivent être inspectées avant nouvelle collecte. Les résultats de replays mono-actifs ne prouvent pas une performance de portefeuille.
