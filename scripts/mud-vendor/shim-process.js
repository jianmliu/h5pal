const root =
  (typeof globalThis !== 'undefined' && globalThis) ||
  (typeof self !== 'undefined' && self) ||
  (typeof window !== 'undefined' && window) ||
  (typeof global !== 'undefined' && global) ||
  {};

if (!root.process) {
  root.process = { env: { NODE_ENV: 'production' } };
} else if (!root.process.env) {
  root.process.env = { NODE_ENV: 'production' };
} else if (!root.process.env.NODE_ENV) {
  root.process.env.NODE_ENV = 'production';
}
