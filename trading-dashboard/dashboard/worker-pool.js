const SUPPORTED = typeof Worker !== 'undefined';
const POOL_SIZE  = Math.min(4, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4);

class IndicatorWorkerPool {
  constructor(size = POOL_SIZE) {
    this._size          = size;
    this._workers       = [];        // Worker[]
    this._workerPending = [];        // Set<id>[] — ids en cours par worker
    this._pending       = new Map(); // id → { resolve, reject }
    this._nextId        = 0;
  }

  _createWorker(index) {
    const w = new Worker(
      new URL('./indicators.worker.js', import.meta.url),
      { type: 'module' },
    );
    this._workerPending[index] = new Set();

    w.onmessage = ({ data }) => {
      const p = this._pending.get(data.id);
      if (!p) return;
      this._pending.delete(data.id);
      this._workerPending[index]?.delete(data.id);
      data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
    };

    w.onerror = () => {
      // Rejeter les tâches en attente de CE worker, puis le remplacer
      for (const id of (this._workerPending[index] ?? [])) {
        const p = this._pending.get(id);
        if (p) { p.reject(new Error('Worker error')); this._pending.delete(id); }
      }
      this._workerPending[index] = new Set();
      this._workers[index] = this._createWorker(index);
    };

    return w;
  }

  _init() {
    while (this._workers.length < this._size) {
      const i = this._workers.length;
      this._workers.push(this._createWorker(i));
    }
  }

  /** Returns the index of the worker with the fewest in-flight tasks. */
  _pickWorker() {
    let best = 0;
    for (let i = 1; i < this._size; i++) {
      if (this._workerPending[i].size < this._workerPending[best].size) best = i;
    }
    return best;
  }

  /** Sends a message to the least-loaded worker. */
  run(message) {
    this._init();
    const id          = this._nextId++;
    const workerIndex = this._pickWorker();

    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._workerPending[workerIndex].add(id);
      this._workers[workerIndex].postMessage({ ...message, id });
    });
  }

  terminate() {
    for (const w of this._workers) w.terminate();
    this._workers       = [];
    this._workerPending = [];
    for (const [, p] of this._pending) p.reject(new Error('Worker terminated'));
    this._pending.clear();
  }
}

export const workerPool = SUPPORTED ? new IndicatorWorkerPool() : null;
