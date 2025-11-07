const DEFAULT_MODEL = 'qwen:7b';
const DEFAULT_ENDPOINT = 'http://localhost:11434/api/generate';

function getFetchImpl() {
  if (typeof fetch === 'function') {
    return fetch;
  }
  throw new Error('[qwen-client] fetch is not available in this environment');
}

export async function runQwen({ prompt, model = DEFAULT_MODEL, endpoint = DEFAULT_ENDPOINT, options = {} } = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new TypeError('[qwen-client] prompt must be a non-empty string');
  }
  const fetchImpl = getFetchImpl();
  const body = {
    model,
    prompt,
    stream: false,
    options
  };
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => {
    if (controller) {
      controller.abort();
    }
  }, 30_000);
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      throw new Error(`[qwen-client] request failed ${response.status}: ${text}`);
    }
    const payload = await response.json();
    if (!payload || typeof payload.response !== 'string') {
      throw new Error('[qwen-client] unexpected response format');
    }
    return payload.response.trim();
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default {
  runQwen
};
