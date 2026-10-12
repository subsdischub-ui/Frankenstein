# Frankenstein — laboratoire crypto paper-only

Application de recherche, pas conseil financier ni stratégie rentable démontrée.
Les six revues adversariales du concept ont précédé sa construction. Elles ont été effectuées par le même agent, **pas par six auditeurs indépendants**.

## Ce qui fonctionne

- Cockpit français, scanner Binance Spot public, journal personnel, décisions explicables, laboratoire replay et comparaisons d'ablation, registre de recherche et six revues.
- Aucun compte ni clé Binance. **Aucun endpoint d'ordre réel**, aucun levier, aucun chemin live.
- Paper long-only, compte personnel protégé par Clerk. Les visiteurs peuvent observer le scanner et exécuter une démonstration technique isolée.
- PostgreSQL : états transactionnels, verrou par compte, worker unique, événements append-only, expériences persistées. Pause et arrêt bloquent les entrées, pas la surveillance des sorties.
- Cockpit → « Parcours des scans » : compteurs privés 24 h/72 h et motifs par actif/cycle, export JSON des cycles des 72 dernières heures. Les observations commencent **après** le déploiement de cette fonction ; elles ne reconstituent pas les scans antérieurs.
- Modèles XGBoost natifs importés en stockage privé, JSON validé, hash et schéma vérifiés, score shadow distinct. **Un candidat importé ne décide jamais d'un trade.** Retrait réversible au niveau de la stratégie : la baseline n'a jamais été remplacée, les fichiers/audits restent conservés.
- Outils locaux Mac : collecte publique, entraînement XGBoost CPU `hist`, séparation temporelle purgée, calibration Platt et rapport OpenClaw lecture seule.

## Exécution

Le projet utilise pnpm et les workflows existants :

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/frankenstein run dev
```

Les workflows injectent `PORT`, la base de routage et les secrets gérés. Ne pas écrire ni copier les valeurs des secrets. Le backend requiert PostgreSQL, Clerk et App Storage gérés ; l'application démarre sans dépendances Python/ML.

## Vérification

```sh
pnpm run typecheck
PORT=22699 BASE_PATH=/ pnpm --filter @workspace/frankenstein run build
pnpm --filter @workspace/scripts run test:lab
cd research && python3 -m unittest -v test_validation.py
```

Tests déterministes : données/indicateurs, machine à états, absence de fuite H4, filtres absents, frais cash/PnL, risque agrégé, doublons, gap/double-touche, profondeur, replay isolé, bootstrap, compatibilité modèle et transactions concurrentes. Les tests DB créent puis nettoient uniquement leurs propres comptes de test.

## Paramètres préenregistrés

| Invariant | Valeur de recherche |
|---|---|
| Capital initial | 10 000 USDT virtuels |
| Risque cible / position | 0,5 % |
| Risque ouvert agrégé | 1,5 % de l'equity, frais estimés inclus |
| Positions maximum | 3 |
| Exposition par actif / globale | 20 % / 60 % |
| Perte quotidienne / drawdown | coupe-circuits 2 % / 8 % |
| Frais / slippage modélisés | 0,1 % / 0,05 % par côté |
| Sortie | objectif net 3R, stop ou 24 h maximum |
| Baseline entrée | volume 3×, RSI repli ≤40, expiration 32 M15 |

Ce sont des cibles et hypothèses. Un gap peut dépasser le risque cible ; les stops ne garantissent pas une perte maximale.

## Données et état

Le scanner prend au plus 30 paires USDT Spot actuellement liquides (20 M USDT de volume rolling minimum), hors BTC, principaux stablecoins et produits à levier. Volume de signal : dernière journée UTC **clôturée**, comparée aux 20 précédentes. Force relative : rendement des clôtures 7 jours moins Bitcoin. La page affiche séparément prix/variation rolling 24 h.

Tendance H4 EMA50/EMA200 ; compression numérique des quatre barres précédentes et Donchian20 excluant la barre de cassure. États : WATCH → ARMED → PULLBACK VWAP/RSI → CONFIRMED reprise M15, expiration/invalidation. Proxy CVD = `2*takerBuy-baseVolume`, sans prétendre identifier des baleines.

Le portier exige OI/funding disponibles et contexte BTC frais. OI delta deux heures et funding >0,05 %/intervalle déclenchent un refus de surchauffe lorsque les deux seuils sont dépassés. Le live BTC détecte un range baissier 1 min >3×ATR, verrou de 30 min. Le replay n'a que du M15 : son proxy de choc BTC est **moins fidèle**, pas une preuve du portier 1 min.

Le diagnostic compte des **observations** (un actif par cycle), pas des actifs distincts. Un refus « compression H4 » avant signal n'est pas une décision de trading : consulter les étapes et raisons du cockpit pour l'expliquer. Le rapport des 72 dernières heures est téléchargeable après connexion ; seules les 20 dernières fiches de cycle sont affichées à l'écran. La date du dernier enregistrement permet de détecter un diagnostic bloqué. L'enregistrement des observations est séparé de la transaction paper : s'il échoue, l'entrée virtuelle déjà traitée n'est pas annulée et le serveur émet une erreur. Aucun paramètre de la stratégie, aucun ordre réel et aucun accès OpenClaw n'en résultent.

**Restriction observée sur cet hébergement : Binance Futures HTTP 451.** Spot fonctionne ; les filtres dérivés absents bloquent les entrées. Aucune donnée de remplacement inventée, aucun contournement régional. L'import permet la recherche si l'utilisateur dispose légalement d'un historique.

Collecte REST environ une fois par minute, pas tick. Sortie paper à profondeur bid disponible, estimation adverse au stop. Le scanner en panne ne doit pas suspendre les tentatives de surveillance des positions. Panne du carnet = sortie indisponible affichée, pas fill fictif.

## Replay

Démo : série synthétique + un ordre **injecté explicitement pour tester la comptabilité**. Aucun effet sur le portefeuille marché, aucune homologation possible.

Import : fichier JSON OHLCV M15 UTC, 250–20 000 bougies consécutives clôturées, idéalement ≥3 216 pour initialiser 201 H4. Format :

```json
{
  "symbol": "SOLUSDT",
  "candles": [{"time":1735689600000,"open":100,"high":101,"low":99,"close":100,"volume":1000,"quoteVolume":100000,"takerBuy":550}],
  "btcCandles": [],
  "derivativeObservations": [{"time":1735689600000,"deltaOi":0.02,"fundingRate":0.0001}],
  "parameters": {"volumeRatio":3,"rsiMax":40,"expiryBars":32}
}
```

L'exemple ci-dessus illustre un objet, pas un dataset valide. Omettre les champs optionnels absents, ne pas envoyer `btcCandles:[]`. BTC doit être exactement aligné. Les dérivés sont horodatés disponibles point-in-time, fraîcheur 2 h. Le funding est une fraction, pas un pourcentage.

Sans BTC, hybrid/filtered n'entrent pas. Sans dérivés, filtered n'entre pas. Momentum = breakout mono-actif M15 ; trend = breakout H4, ablations descriptives et non reproduction d'un scanner historique complet. Volume replay rolling fermé comparé aux 20 fenêtres antérieures, pas exactement la journée UTC du scanner. Entrée ouverture suivante, stop d'abord si double touche, gap adverse, frais deux côtés ; fermeture de fin d'historique. Imports utilisateur marqués non vérifiés, jamais entraînement automatiquement. Bootstrap bloc descriptif, null si moins de 20 trades.

## Mac, Claude Code et OpenClaw

Voir [research/README.md](research/README.md). Le paquet téléchargeable dans Évolution contient les scripts sans secret.

## Paquet VPS autonome

**VPS déjà géré par Dokploy :** utiliser [deployment/dokploy/README.md](deployment/dokploy/README.md), pas l'installateur Caddy/systemd. La configuration Compose ne publie aucun port hôte et réutilise le proxy de l'infrastructure existante.

Voir [deployment/vps/README.md](deployment/vps/README.md) : Linux x86_64 Ubuntu 24.04 / Debian 12–13, compte opérateur local, stockage privé sur disque, PostgreSQL et services systemd. L'application Replit conserve Clerk et App Storage.

```sh
node deployment/vps/build.mjs
node --test deployment/vps/tests/auth.test.mjs
node deployment/vps/package.mjs
```

Le paquet précompilé et son hash sont téléchargeables dans Évolution. Il ne contient aucun compte, modèle utilisateur, mot de passe ni clé API. Installer sur le VPS est une action distincte réalisée par l'utilisateur après vérification du DNS, des prérequis et de l'archive.

## Limites et suite de recherche

- Ni edge, ni forward de durée suffisante, ni modèle homologué à ce jour. Zéro trades initialement est normal.
- Imports ML **shadow non vérifié**, score null si modèle/features absents ; aucune promotion, auto-réécriture ou modification du risque.
- Propositions bornées enregistrées puis testables en replay via `parameters`. Leur simple enregistrement ne les teste pas, ne les exécute pas en shadow et ne les valide pas.
- OpenClaw/Claude Code : contrat local livré, **pas connectés à ce projet**, aucune exécution sur le Mac de l'utilisateur.
- Pas d'univers délisté historique ni carnet historique : biais de survivance / liquidité.
- Preview ≠ service permanent 24/7. Aucun déploiement public effectué.
- La vraie homologation nécessitera un nouveau forward indépendant, protocole économique préenregistré et décision humaine explicite. La promotion active n'est volontairement pas disponible en v1.