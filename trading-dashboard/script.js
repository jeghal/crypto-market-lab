import { startApp } from './dashboard/app.js';

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const message = String(reason?.message ?? reason ?? '').toLowerCase();
  if (reason?.name === 'AbortError' || message.includes('aborted')) {
    event.preventDefault();
  }
});

startApp().catch((error) => {
  console.error('Init failed:', error);
});
