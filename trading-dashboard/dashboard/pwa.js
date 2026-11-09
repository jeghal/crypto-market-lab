import { addListener } from './listener-registry.js';

export function initPwa(showToast) {
  if (!('serviceWorker' in navigator)) return;

  addListener(window, 'load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((reg) => {
      addListener(reg, 'updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        addListener(worker, 'statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast?.('تحديث متاح — أعد تحميل الصفحة', 'info');
          }
        });
      });
    }).catch((err) => console.warn('SW registration failed:', err));
  });
}
