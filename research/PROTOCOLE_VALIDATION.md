# Frankenstein — protocole de validation

## 1. Objet et statut

Ce document fixe un protocole prospectif de recherche. Il ne certifie aucune rentabilité, ne donne aucune autorisation d'ordre réel et n'ajoute aucune fonctionnalité à l'application.

Les seuils ci-dessous sont des critères de recherche proposés à figer avant toute consultation de la période finale. Ce ne sont ni des garanties financières ni des seuils universels. Les franchir autorise seulement une revue humaine de l'étape suivante.

Statut initial : NON VALIDÉ. Démonstration synthétique exclue de toute preuve de marché. Baseline seule décisionnaire ; XGBoost shadow uniquement. Aucun trading réel ni levier en v1.

Décisions possibles :

- POURSUIVRE LA COLLECTE : données ou nombre de transactions insuffisants.
- REJETER CETTE VERSION : échec d'un critère préenregistré, anomalie invalidante ou coût supérieur au bénéfice.
- ADMISSIBLE À LA REVUE SUIVANTE : critères satisfaits, sans promotion automatique.

Ces décisions sont consignées manuellement : il ne s'agit pas de statuts ni de verrous supplémentaires déjà implémentés.

## 2. Préenregistrement obligatoire

Avant le test final, créer un dossier d'expérience et y conserver :

- Identifiant stable de l'expérience, date UTC de gel, version du code, hash des fichiers.
- Hypothèse : « La baseline hybride filtrée apporte une espérance nette positive, avec risque maîtrisé, sur données futures non utilisées pour régler les paramètres. »
- Actifs, dates exactes, source et disponibilité point-in-time des données ; règle de sélection des actifs fixée sans choisir les gagnants après coup.
- Frais, slippage, règles de taille, sorties et traitements des trous de données.
- Liste des expériences précédentes, y compris les échecs.
- Paramètres et critères de décision ci-dessous, approuvés avant les résultats finaux.

Référence baseline : volume minimal 3×, RSI de repli ≤40, expiration 32 M15, objectif net 3R, détention maximale 24 h.

Risque paper : 10 000 USDT virtuels, cible 0,5 % par trade, agrégé 1,5 %, trois positions maximum, exposition 20 % par actif / 60 % globale, coupe-circuits 2 % quotidien / 8 % drawdown.

Coûts actuels : frais 0,1 % et slippage 0,05 % par côté. Les confronter aux coûts effectivement applicables ; ne jamais réduire les coûts supposés pour rendre un résultat positif.

Maximum trois versions de paramètres pour la phase exploratoire, choisies et décrites avant comparaison. Le holdout n'est consulté qu'une fois pour la version retenue. Toute modification après sa consultation exige une période finale nouvelle. Garder les résultats négatifs.

## 3. Phase zéro — admissibilité des données

### Diagnostic Windows ou Mac

Tester la connexion habituelle, sans VPN, sans clé et sans ordre :

```powershell
curl.exe -sS -w "\nHTTP %{http_code}\n" "https://fapi.binance.com/fapi/v1/time"
curl.exe -sS -w "\nHTTP %{http_code}\n" "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=3"
curl.exe -sS -w "\nHTTP %{http_code}\n" "https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=2"
```

Sur Mac, remplacer `curl.exe` par `curl`.

200 avec JSON valide : accessibilité technique de ces endpoints à cet instant seulement. Cela ne constitue pas une confirmation des droits de trading API.

451 : arrêt du test sur ce réseau ; faire clarifier l'accès par Binance. Ne pas ajouter une clé ou changer artificiellement la localisation pour contourner le refus.

401/403/429 ou autres erreurs : conserver le code et le message, masquer toute information privée, diagnostiquer séparément. Respecter les limites et ne pas multiplier les requêtes.

### Collecte actuelle

Sur Windows, installer Python 3.11 ou plus récent depuis python.org, extraire le ZIP Évolution puis ouvrir un terminal dans son dossier :

```powershell
py -3 download_binance.py --symbol SOLUSDT --bars 6000 --with-derivatives --output history-SOLUSDT.json
```

Si `py` n'est pas disponible, utiliser `python` après avoir vérifié sa version. Sur Mac, utiliser `python3`.

Importer ce JSON dans Laboratoire. BTC doit être aligné exactement avec l'actif. OI et funding doivent être réellement observés, horodatés et disponibles avant la décision ; aucune valeur manquante remplacée par zéro.

6000 M15 représentent environ 62,5 jours. La tendance exige environ 33,5 jours de chauffe. Le plafond de 20 000 M15 représente environ 208 jours, chauffe comprise.

Le collecteur actuel récupère au maximum 500 observations OI horaires, soit environ 21 jours récents, moins les premières observations nécessaires au delta deux heures. Il ne reconstitue donc pas un long historique dérivé. Vérifier les dates de couverture ; un historique Spot long n'est pas un historique filtré long.

Critères d'admissibilité :

- Zéro duplication, bougie ouverte, désordre temporel ou valeur non finie.
- 100 % des données requises disponibles et valides au moment des décisions évaluées.
- Absences et refus conservés, sans sélectionner seulement les segments gagnants.
- Couverture OI/funding, convention de funding, profondeur disponible et fraîcheur documentées.
- Périodes sans dérivés exclues des conclusions sur la stratégie filtrée, mais conservées comme interruptions de couverture.

Un import réussi ne certifie pas la provenance du fichier.

## 4. Phase un — recherche historique

Objectif de couverture : au moins douze mois et trois actifs choisis avant les résultats, incluant des périodes haussières, baissières et latérales. Ce sont des objectifs : sans données admissibles, décision POURSUIVRE LA COLLECTE.

Ce programme complet dépasse la v1 : celle-ci rejoue un actif par fichier et ne reconstruit ni portefeuille historique multi-actifs, ni univers délisté, ni carnet historique. Des replays séparés ne prouvent pas le respect historique du risque agrégé.

Un long historique filtré nécessitera des archives admissibles obtenues légalement ou une collecte prospective continue à ajouter. Relancer le téléchargeur ne crée pas un archivage automatique.

Organisation des périodes :

1. 60 % chronologiques pour exploration.
2. 20 % pour validation et sélection parmi les versions préenregistrées.
3. 20 % finaux, jamais consultés pour le choix des règles.

Préciser les dates avant les résultats. Purger les trades chevauchant les frontières et laisser 24 h d'embargo. Les données de chauffe antérieures peuvent initialiser les indicateurs, mais leurs trades ne comptent pas dans le segment évalué. Ce découpage économique est distinct du découpage ML.

Comparer momentum, tendance, hybride et hybride filtré sur la même couverture admissible. Comparateurs à documenter : rester en cash, exposition Spot passive ; préciser que leur profil de risque diffère. Les variantes replay sont descriptives et ne reproduisent pas entièrement le scanner marché.

Mesures : nombre de trades clôturés, PnL net, gain net moyen/trade, profit factor net, drawdown maximal, exposition, coût moyen, résultat par actif/période et part du meilleur trade dans le PnL.

Critères proposés pour le segment final :

- Au moins 100 trades clôturés ; sinon échantillon insuffisant.
- Espérance nette >0 et profit factor net ≥1,20.
- Borne basse d'un intervalle à 95 % de l'espérance nette >0, avec méthode fixée avant le test.
- Drawdown maximal ≤8 % ; toute violation du budget de risque examinée et documentée.
- Espérance encore positive lorsque frais et slippage sont chacun doublés.
- Résultat net encore positif après retrait du meilleur trade.

Pour les données multi-actifs, le rééchantillonnage doit regrouper les événements simultanés afin de ne pas les traiter comme indépendants. Le bootstrap affiché par la v1 est descriptif et mono-replay : il ne suffit pas à calculer cette preuve de portefeuille. Le stress de coûts et les analyses supplémentaires exigent un calcul externe ou une évolution du laboratoire ; ils ne sont pas des boutons existants.

Les filtres complexes doivent apporter un bénéfice économique ou de risque documenté par rapport aux variantes simples. Sinon, ne pas prétendre qu'ils améliorent la stratégie.

## 5. Phase deux — forward paper indépendant

Préconditions : accès aux données autorisé, collecte continue, serveur actif, règles gelées et capacité de suivi vérifiée.

Objectif minimal : 90 jours calendaires ET 100 trades clôturés. Si le nombre est insuffisant, prolonger à règles inchangées ; ne pas abaisser les filtres pour forcer des transactions.

Chaque jour, conserver :

- Heure du dernier cycle, trous, erreurs et couverture des données requises.
- Signaux acceptés/rejetés et leurs raisons ; entrées/sorties et coûts.
- Capital, drawdown, exposition, limites et événements d'arrêt.

Exporter le Bundle JSON chaque semaine et à chaque incident. Garder séparés les replays et le portefeuille marché.

Critères économiques identiques à la phase historique finale, évalués sans retoucher les règles. Ajouter :

- Aucun doublon de trade, violation inexpliquée de limite ou perte de suivi de position.
- Toutes les interruptions consignées ; aucune période absente remplacée par une performance inventée.
- Reprise après redémarrage et surveillance des sorties vérifiées en paper.

Une panne sans solution de surveillance empêche toute admissibilité au réel. Les résultats de plusieurs versions ne se fusionnent pas pour franchir les critères.

## 6. XGBoost — branche facultative, non décisionnaire

N'envisager cette branche qu'après l'évaluation de la baseline.

Le script exige au moins 500 labels réels complets ; ce ne sont pas forcément 500 trades acceptés. Les candidats rejetés suivis en shadow peuvent contribuer lorsque leurs caractéristiques et outcomes sont complets.

Utiliser le découpage ML prévu : 55 % entraînement, 15 % calibration, 15 % validation, 15 % test, purge et embargo 24 h. Ne pas réutiliser un holdout consommé. Conserver les hashes, tentatives, rapports et fichiers natifs.

Importer le modèle et son manifeste en Évolution. SHADOW_UNVERIFIED n'est pas une homologation. Les mesures AUC/Brier ne prouvent pas un gain financier.

Avant tout pouvoir de décision, il faudrait implémenter une règle de sélection explicite, tester son bénéfice économique face à la baseline puis effectuer un nouveau forward. Cette promotion n'existe pas actuellement.

## 7. Revue avant micro-capital réel — fonctionnalité future

Les étapes précédentes ne déclenchent aucun ordre réel. Décision humaine explicite requise.

Préconditions techniques à développer et tester :

- Éligibilité et permissions API confirmées par l'exchange.
- Compte dédié, secrets côté serveur, aucune permission de retrait ; liste d'IP autorisées lorsque possible.
- Ordres idempotents, statuts ambigus, fills partiels, précision et tailles minimales.
- Réconciliation des soldes/positions, reprise après panne, alertes.
- Protections côté exchange adaptées et distinction entre blocage des entrées et liquidation.
- Tests de déconnexion, doublons, redémarrage et arrêt ; environnement de test puis observation réelle.

Premier essai éventuel : Spot sans levier, montant plafond et budget de perte absolu décidés avant activation. Aucun montant recommandé par ce document.

Si le minimum d'ordre rend le risque prévu impossible à respecter, ne pas exécuter le trade. Ne pas augmenter le risque pour rendre l'ordre possible.

Au moins quatre semaines et 50 trades clôturés avant revue d'une éventuelle augmentation ; cela évalue surtout l'exécution et ne prouve pas un edge. Comparer coûts réels, latence, écarts de prix et résultats au paper en parallèle.

Arrêt si budget de perte atteint, position non réconciliée, protection défaillante ou coûts invalidant l'espérance. Augmentation uniquement par décision explicite, jamais après une simple série gagnante.

## 8. Levier — protocole distinct

Aucun levier n'est testé par la v1. OI/funding servent au contexte du portier, pas à une gestion Futures.

Un futur protocole devra modéliser marge isolée/croisée, prix de marque, liquidation, financement réellement payé, paliers de marge, frais, gaps et règles de réduction/fermeture.

Le risque doit se mesurer sur le capital, pas seulement sur la marge engagée. Multiplier un rendement Spot par le levier n'est pas un backtest valide. Une stratégie Spot admissible n'est pas automatiquement admissible aux dérivés.

## 9. Fiche de décision à remplir

- Expérience / version / dates / hashes :
- Source, actifs, couverture et incidents :
- Nombre de trades et coût moyen :
- Espérance nette / intervalle / profit factor :
- Drawdown / violations de risque :
- Stress de coûts / retrait du meilleur trade :
- Résultats par actif et période :
- Différence avec comparateurs :
- Limites non résolues :
- Décision et justification :
- Nom de la phase suivante, sans activation automatique :

## Sources et distinctions

Documentation Binance, sécurité des endpoints : https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/general-info

Conditions Binance auxquelles renvoie le message HTTP 451 : https://www.binance.com/en/terms

Déploiements Replit et workers toujours actifs : https://docs.replit.com/features/publishing/deployment-types

L'accessibilité technique d'une URL, l'éligibilité d'un compte et les permissions API sont trois questions distinctes. L'accès via l'application mobile ne certifie pas les deux autres.
