const _registry = [];

export function addListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  _registry.push({ target, type, handler, options });
}

export function removeAllListeners() {
  for (const { target, type, handler, options } of _registry) {
    target.removeEventListener(type, handler, options);
  }
  _registry.length = 0;
}
