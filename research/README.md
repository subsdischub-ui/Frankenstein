# Utilisation locale sur Mac

Le [protocole de validation](PROTOCOLE_VALIDATION.md) décrit les critères de recherche, le diagnostic Windows/Mac et les préconditions non implémentées du passage au réel.

Copiez ce dossier sur votre Mac avec un export JSON obtenu dans Évolution.
Le moteur web ne dépend pas de Python. XGBoost est nécessaire uniquement pour entraîner un candidat local.

## 1. Collecter un historique public

Python 3.11 ou plus récent :

```sh
python3 download_binance.py --symbol SOLUSDT --bars 6000 --output history.json
# Facultatif et seulement si Binance Futures est légalement accessible depuis votre réseau :
python3 download_binance.py --symbol SOLUSDT --bars 6000 --with-derivatives --output history.json
```

Importez `history.json` dans Laboratoire. Si les dérivés sont refusés, le script écrit des notes explicites et aucune observation artificielle. Les données BTC/Spot sont publiques. Il n'utilise aucune clé.

Pour tester un candidat, ajoutez au bundle :

```json
"parameters": {"volumeRatio": 2.5, "rsiMax": 38, "expiryBars": 24}
```

Comparez sur la même période puis collectez une **nouvelle** période forward. Ne changez pas des paramètres après avoir lu les résultats du test final.

## 2. Entraîner

Installez les dépendances dans votre Python local habituel :

```sh
python3 -m pip install -r requirements.txt
python3 train_model.py export-frankenstein.json --output candidate
```

Le script refuse moins de 500 labels réels complets, les données synthétiques, doublons, valeurs absentes, labels non temporels et fenêtres après purge trop petites/monoclasses. Il peut donc refuser les premiers exports ; c'est attendu. Les rejets doivent également avoir un label shadow. L'indisponibilité OI/funding empêchera les features complètes : ne pas combler par zéro.

Features identiques au scoring shadow serveur :
`volumeRatio, relativeStrength, compression, rsi, vwapGap, deltaOi, fundingRate, cvd, btcShock`.

Split par timestamps uniques : 55 % train, 15 % calibration Platt, 15 % validation, 15 % test, labels chevauchants purgés et embargo 24 h. Hyperparamètres fixes, graine fixe, pas de recherche sur holdout. Le hash du holdout est marqué consommé **avant** son évaluation ; répéter ce même test est refusé tant que `consumed_holdouts.json` reste intact. Ce fichier local n'est pas un contrôle d'accès inviolable : le supprimer contournerait le protocole scientifique.

Sorties : `candidate/candidate_xgboost.json` natif et `candidate/manifest.json` avec hash, features, calibration, mesures Brier/log-loss/AUC et R shadow, tentative et limites. Aucun pickle ; aucun modèle promu.

Importez les deux fichiers dans Évolution. Le serveur valide et stocke le modèle privé, affiche `SHADOW_UNVERIFIED`, et ne permet que le score d'observation. Le manifest externe n'est pas une certification. La baseline seule garde le pouvoir de décision.

## 3. Claude Code

Claude Code peut lire les scripts, le protocole et les rapports sur le Mac. Ne lui donnez pas de clé d'ordre ni d'accès écriture à un moteur actif. Une revue ne valide pas une stratégie ; exigez comparaison économique nette, incertitude, absence de fuite et forward neuf.

## 4. OpenClaw (non connecté)

```sh
python3 openclaw_adapter.py export-frankenstein.json --output openclaw_report.json
```

Ce pont produit un rapport JSON lecture seule. Il ne contacte aucune instance, aucun webhook et aucun LLM. Il est conçu pour être pris en entrée par une tâche OpenClaw que vous configurez sur votre propre instance ; les détails réseau dépendent de cette instance, ne sont pas simulés ici.

Réponse attendue d'un agent externe :

```json
{
  "parameters": {"volumeRatio":2.5,"rsiMax":38,"expiryBars":24},
  "justification":"Hypothèse à tester, pas conclusion causale"
}
```

Reportez une proposition dans Évolution, puis testez le bundle en Laboratoire. Aucun script n'exécute du code retourné, ne modifie les stops, ne promeut un candidat ou ne connecte Binance en mode réel.

## 5. Tests locaux sans XGBoost

```sh
python3 -m unittest -v test_validation.py
```

Les quatre tests du protocole ne nécessitent aucune dépendance ML. Entraîner/tester réellement XGBoost exige les packages et un dataset réel admissible ; aucune performance d'apprentissage synthétique n'est présentée comme validation.