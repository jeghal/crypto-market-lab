# trading-dashboard

Dashboard crypto en mode PWA avec watchlist, indicateurs EMA `7/21/50`, service worker et interface temps reel cote frontend.

## Lancement

Projet static/PWA :

- ouvrir `index.html`
- ou utiliser un serveur local pour profiter correctement du service worker

Exemple :

```bash
python -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

## Fonctionnalites

- dashboard multi-symboles
- watchlist dynamique
- indicateurs techniques avec structure EMA `7/21/50`
- installation PWA
- cache offline via service worker

## Structure utile

- `index.html` : shell principal
- `script.js` : bootstrap du dashboard modulaire
- `style.css` : styles
- `dashboard/` : modules metier frontend
- `icons/` : icones PWA
- `manifest.json` : manifeste PWA
- `service-worker.js` : cache offline
- `scripts/` : tests Node et controles de build

## Tests

Checks obligatoires avant chaque release :

- `node scripts/run_unit_tests.mjs`
- `node scripts/check_precache.mjs`
- `python scripts/run_ui_e2e_tests.py`

Unit + regression (deterministes, offline) :

```bash
node scripts/run_unit_tests.mjs
```

Precache/service worker :

```bash
node scripts/check_precache.mjs
```

UI E2E (Playwright, serveur local et donnees de marche simulees, sans connexion Binance) :

```bash
python scripts/run_ui_e2e_tests.py
```

Live smoke (Binance, non deterministes) :

```bash
node scripts/run_live_smoke_tests.mjs
```

Pour les tests UI avec le reseau reel, definir `LIVE_BINANCE=1`.

Les regressions couvrent ATR, expiration du cache, annulation des requetes, fallback de timeframe, valeur minimale des ordres et HTTP 429 dans le pipeline et le radar integre. Le dossier parent doit contenir `ATLASFLOW` et `data_pipeline` pour ces controles communs.

## Etat

Projet actif.

## Source partage

Les fichiers `dashboard/market-core.js` et `radar/assets/js/{market-core,api,collectors,transforms}.js` sont generes depuis `../shared/`. Modifier le source puis executer `node ../scripts/sync_shared.mjs`. La copie locale permet toujours de servir ce projet independamment.

Le bandeau affiche l age des donnees et le timeframe effectif.
