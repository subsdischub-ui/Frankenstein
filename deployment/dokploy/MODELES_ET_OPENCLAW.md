# Décisions mesurées, pas préférence pour un nom de modèle

## Choix initial

L'utilisateur accepte XGBoost si cette option convient mieux ; son critère est l'efficacité. Cela fixe une évaluation comparative, pas une promesse de résultat.

XGBoost est le premier candidat : variables numériques disponibles, entraînement sur les labels du laboratoire, exécution locale peu coûteuse, manifeste de caractéristiques/calibration et import sécurisé déjà présents.

JEV System One est une API de décisions typées (choix, score, probabilité), pas un générateur de texte classique. Laya est présenté par son éditeur comme un modèle de décisions à poids ouverts. Leur aptitude à classer des textes ou des états ne prouve aucun edge sur les trades de Frankenstein.

Les résultats génériques consultés ne permettent pas de choisir un gagnant financier. Ne pas comparer une accuracy sur corpus de textes avec une espérance nette de trading.

## Comparaison future préenregistrée

1. Même état marché point-in-time pour tous les candidats, avec version et hash du schéma.
2. Question identique : probabilité d'un outcome défini par les mêmes barrières et horizon.
3. Archives de chaque décision, réponse, délai, coût, version du modèle et erreur.
4. Brier/log-loss et calibration, puis effet économique net face à la baseline, à risque comparable.
5. Holdout indépendant consommé une fois ; nombre de tentatives documenté.
6. Nouveau forward paper shadow, jamais décisions actives tant qu'aucune homologation n'existe.

Seuil d'acceptation à préenregistrer avant résultats. Un score absent, non fini, obsolète ou incompatible ne devient jamais un score arbitraire de secours.

Pour JEV, le tag latest peut évoluer : enregistrer le modèle effectivement résolu et détecter ses changements. Ne pas réinterroger le passé pour fabriquer des décisions point-in-time. Les coûts et pannes réseau font partie de la comparaison.

Les données de préentraînement d'un modèle externe peuvent contenir des faits postérieurs à un replay historique. Sans provenance vérifiable, ces replays ne prouvent pas sa capacité prédictive ; le forward prospectif reste indispensable pour JEV/Laya.

Pour Laya, vérifier licence, checkpoint exact, ressources RAM/CPU, qualité de calibration et adaptation au domaine avant toute installation. Éviter de saturer le VPS du moteur ; un service distinct peut être nécessaire.

Les intégrations AI gérées par Replit ne sont pas supposées transférables sur le VPS. Un futur adaptateur serveur doit utiliser un accès fournisseur compatible avec cet hébergement, configuré de façon sûre. Pas de clé dans Git ni de données privées envoyées sans autorisation.

## OpenClaw : extension prévue, non activée

Le CLI actuel produit seulement un rapport local. Le connecteur réseau et ses autorisations restent à construire.

Contrat proposé :

- Lire uniquement les rapports et données dont le partage est autorisé.
- Proposer des paramètres dans une allowlist, jamais modifier directement la stratégie active.
- Demander des replays/runs identifiés avec quotas, journal et permissions machine dédiées.
- Produire une comparaison explicable des candidats.

Interdictions : clé d'ordre, modification libre du risque ou des stops, exécution de code arbitraire, auto-promotion, accès Docker/root, push direct sur la branche de livraison active.

Une réponse d'agent n'est ni un résultat de marché ni une homologation. La décision humaine garde le contrôle des versions et de la promotion.

## Sources consultées

- Jev : https://docs.typesafe.ai/api
- Laya, présentation éditeur : https://laya-model.com/
- Protocole du laboratoire : `research/PROTOCOLE_VALIDATION.md`

Les affirmations des éditeurs ne sont pas assimilées à des résultats indépendants sur ce projet.
