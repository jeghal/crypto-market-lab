# Crepto Project Structure

## Current tree

```text
crepto/
  index.html
  css/
    style.css
  js/
    chart/
      data.js
      formatters.js
      indicators.js
      interactions.js
    core/
      shared.js
    assistant.js
    chart.js
    script.js
  assets/
    icons/
      icon-32.png
      icon-180.png
      icon-192.png
      icon-512.png
  manifest.webmanifest
  service-worker.js
```

## Folder responsibilities

- `index.html`: only page structure and script/style loading order.
- `css/`: visual styles only.
- `js/core/`: shared helpers used by multiple features.
- `js/chart/`: extracted chart domain logic (data/ws + formatting + indicators/calculations + interaction helpers).
- `js/chart.js`: chart rendering, data fetch, chart interactions (uses `js/chart/*` with fallback logic).
- `js/assistant.js`: assistant analysis and checklist logic.
- `js/script.js`: tabs, header/watchlist, and app bootstrap.
- `assets/`: images/icons/static files.
- `manifest.webmanifest` + `service-worker.js`: installation mobile (PWA) et cache du shell statique.

## Rules for next changes

- Put reusable helpers in `js/core/shared.js` first.
- Keep business logic out of `index.html`.
- Keep DOM rendering separated from calculations when possible.
- Avoid duplicating symbol/interval/storage helper functions.
