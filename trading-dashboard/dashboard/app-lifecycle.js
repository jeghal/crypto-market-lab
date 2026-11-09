import { addListener } from './listener-registry.js';

export function initAppLifecycle({
  teardownApp,
  onPersistedHide,
  onPersistedShow,
} = {}) {
  if (typeof teardownApp !== 'function') {
    throw new Error('initAppLifecycle: teardownApp is required');
  }

  addListener(window, 'beforeunload', teardownApp);

  addListener(window, 'pagehide', (event) => {
    if (event?.persisted) {
      onPersistedHide?.(event);
      return;
    }
    teardownApp();
  });

  addListener(window, 'pageshow', (event) => {
    if (!event?.persisted) return;
    onPersistedShow?.(event);
  });
}

