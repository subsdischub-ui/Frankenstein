# Complément Spot — collecteur VPS autonome

Python **3.10 ou plus récent**, bibliothèque standard uniquement. Aucune installation
de package, aucune clé, aucun appel de trading, aucune connexion au laboratoire ou
à PostgreSQL/Docker. Les sources locales déjà transmises restent inchangées.

## Périmètre préconfiguré

- Pilote : **24 mai 2026 10:00 UTC → 24 juin 2026 09:00 UTC**, fin exclusive,
  correspondant à la couverture OI reçue.
- Spot M15 avec volumes base/quote et taker base/quote pour
  BTC, ETH, SOL, AVAX, SUI, ARB, WIF en USDT.
- 35 jours supplémentaires de Spot M15 avant le pilote pour initialiser les
  H4 et les journées UTC complètes nécessaires aux filtres.
- BTC Spot 1 minute pendant le pilote, avec deux heures préalables.
- **89 024 bougies attendues**, 531 requêtes minimum réparties en fichiers
  journaliers. Le plan affiché par `--dry-run` fait foi.

Le warmup n'est pas une période de mesure. L'univers de sept actifs est fixé
aujourd'hui : ce n'est pas la reconstitution historique du classement liquide
des 30 paires du moteur. Le collecteur ne transforme pas ce pilote en dataset
d'apprentissage admissible et ne garantit pas 500 labels ni un gain économique.

## Installation et exécution

Télécharger `collect_spot_pilot.py` depuis la branche GitHub fournie, puis copier
**ce fichier seul** sur le VPS, par exemple depuis le Mac :

```sh
scp ~/Downloads/collect_spot_pilot.py root@168.231.85.214:/root/collect_spot_pilot.py
```

Sur le VPS Ubuntu, hors des conteneurs et sans arrêter Dokploy :

```sh
python3 --version
python3 /root/collect_spot_pilot.py --dry-run

umask 077
mkdir -p /root/frankenstein-research
nohup python3 /root/collect_spot_pilot.py \
  --output /root/frankenstein-research/spot-pilot \
  > /root/frankenstein-research/collecte-spot.log 2>&1 &
```

Le script doit être lancé une seule fois. Le verrou empêche deux collecteurs
d'écrire dans le même dossier. `nohup` permet de fermer la session SSH.
Prévoir environ 100 Mo libres et une connexion stable ; la durée dépend du
réseau, généralement de plusieurs minutes à quelques dizaines de minutes.
La temporisation par défaut est d'une seconde par requête, sans parallélisme.
Les limites Binance portent sur l'IP et peuvent donc aussi concerner les
autres applications du VPS.

Suivre la progression :

```sh
tail -n 15 /root/frankenstein-research/collecte-spot.log
```

**Succès uniquement si le journal affiche `TERMINÉ` et si `manifest.json`
contient `"status": "COMPLETE"`.** Sinon, consulter l'erreur : ne pas supposer
que l'existence de fichiers signifie que tout le pilote est disponible.

### Reprise et vérification

Après une interruption, relancer exactement la même commande Python avec le
même dossier. Les journées terminées sont relues, leurs empreintes et leur
couverture sont vérifiées, puis ignorées côté réseau. La journée interrompue
est recollectée.

Le script refuse d'écraser un dossier non reconnu ou de réutiliser un dossier
pour d'autres dates. Un fichier seul sans reçu, ou un fichier corrompu, provoque
un arrêt explicite : mettre manuellement la paire CSV/reçu concernée à l'écart
avant une reprise, sans toucher aux autres journées.

Vérification hors réseau et reconstruction du ZIP :

```sh
python3 /root/collect_spot_pilot.py --verify-only \
  --output /root/frankenstein-research/spot-pilot
```

Un HTTP 403/418/429/451 arrête la collecte sans changer de région ni d'hôte.
Respecter le `Retry-After` affiché et vérifier l'accès autorisé avant de reprendre.
Seules les erreurs réseau/5xx sont réessayées, au maximum quatre tentatives.

## Fichiers à transmettre

Lorsque la collecte est complète, récupérer depuis le Mac :

```sh
scp root@168.231.85.214:/root/frankenstein-research/spot-pilot/spot-pilot.zip ~/Downloads/
scp root@168.231.85.214:/root/frankenstein-research/spot-pilot/spot-pilot.zip.sha256 ~/Downloads/
```

Joindre le ZIP et son empreinte dans la conversation. Il contient les CSV,
leurs reçus d'intégrité, le plan et le manifeste. Ne pas transmettre les
fichiers d'accès au laboratoire, des clés, des cookies ou une sauvegarde privée.

## Interprétation et limites

- `ts` : ouverture UTC en millisecondes ; `close_time_ms` : dernière milliseconde
  de la bougie. Ce n'est **pas** l'heure de publication/réception historique.
- Prix et volumes sont conservés comme chaînes décimales du fournisseur.
  Les volumes quote/taker ne sont jamais estimés à partir des seuls prix.
- Les trous, doublons, bougies non clôturées, OHLC impossibles et volumes taker
  supérieurs aux volumes totaux provoquent un échec, sans remplissage artificiel.
  Les volumes nuls légitimes restent présents et sont comptés dans le manifeste.
- SHA-256 garantit la cohérence des copies reçues, pas une certification Binance.
- Aucun OI/funding n'est téléchargé ou réparé. L'origine et l'ancienneté
  inconnues de certaines valeurs OI reçues demeurent une limite scientifique.
- Aucun carnet d'ordres historique ni preuve d'exécution réelle n'est fourni.
- Le ZIP est destiné à la préparation de recherche ; ce n'est pas un import
  directement exécutable dans le cockpit ni une autorisation de trading réel.

Référence API :
https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#klines
