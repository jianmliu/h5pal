import { fileURLToPath } from 'url';
import fs from 'fs';

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (err) {
    if (
      err.code === 'ERR_MODULE_NOT_FOUND' &&
      context.parentURL &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.js')
    ) {
      const candidate = new URL(`${specifier}.js`, context.parentURL);
      try {
        const diskPath = fileURLToPath(candidate);
        if (fs.existsSync(diskPath)) {
          return { url: candidate.href };
        }
      } catch {
        // Ignore and rethrow original error
      }
    }
    throw err;
  }
}
