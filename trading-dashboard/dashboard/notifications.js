let _toastEl = null;
let _toastTimer = null;

export function showToast(msg, type = 'info') {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.className = 'toast';
    document.body.appendChild(_toastEl);
  }
  clearTimeout(_toastTimer);
  _toastEl.textContent = msg;
  _toastEl.className = `toast${type === 'error' ? ' error' : ''}`;
  void _toastEl.offsetWidth;
  _toastEl.classList.add('show');
  _toastTimer = setTimeout(() => {
    _toastEl.classList.remove('show');
  }, 3500);
}
