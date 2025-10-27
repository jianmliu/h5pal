import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const projectRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');

const allowedGlobalMutationFiles = new Set([
  'src/services/battle-service.js'
]);

const allowedBattleMutationFiles = new Set([]);

const allowedGameDataMutationFiles = new Set([]);

const jsFilePattern = /\.js$/;

function collectSourceFiles(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (jsFilePattern.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseModule(code, file) {
  const parserOptions = {
    sourceType: 'module',
    sourceFilename: file,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    errorRecovery: true,
    plugins: ['dynamicImport']
  };
  try {
    return parse(code, parserOptions);
  } catch (err) {
    return parse(code, { ...parserOptions, sourceType: 'script' });
  }
}

function traverse(node, visitor) {
  if (!node || typeof node.type !== 'string') {
    return;
  }
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const value = node[key];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const child of value) {
        traverse(child, visitor);
      }
    } else if (value && typeof value.type === 'string') {
      traverse(value, visitor);
    }
  }
}

function getAssignmentBase(expression) {
  let current = expression;
  while (current && current.type === 'MemberExpression') {
    current = current.object;
  }
  return current;
}

const mutationAllowlists = {
  Global: allowedGlobalMutationFiles,
  GameData: allowedGameDataMutationFiles,
  BATTLE: allowedBattleMutationFiles
};

function detectMutationTarget(base) {
  if (!base) return null;
  if (base.type === 'Identifier') {
    if (base.name === 'Global') return 'Global';
    if (base.name === 'GameData') return 'GameData';
  }
  if (
    base.type === 'CallExpression' &&
    base.callee &&
    base.callee.type === 'Identifier' &&
    base.callee.name === 'BATTLE'
  ) {
    return 'BATTLE';
  }
  return null;
}

function formatLocation(file, loc) {
  if (!loc) {
    return file;
  }
  return `${file}:${loc.start.line}:${loc.start.column + 1}`;
}

describe('direct global mutations', () => {
  it('should not introduce new direct writes to Global or BATTLE()', () => {
    const files = collectSourceFiles(srcRoot);
    const violations = [];

    for (const filePath of files) {
      const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
      const source = readFileSync(filePath, 'utf8');
      const ast = parseModule(source, relPath);

      traverse(ast, (node) => {
        if (node.type === 'AssignmentExpression') {
          const base = getAssignmentBase(node.left);
          const target = detectMutationTarget(base);
          if (target && !mutationAllowlists[target]?.has(relPath)) {
            violations.push({
              type: target,
              location: formatLocation(relPath, node.loc),
              snippet: source.slice(node.start, node.end)
            });
          }
        } else if (node.type === 'UpdateExpression') {
          const base = getAssignmentBase(node.argument);
          const target = detectMutationTarget(base);
          if (target && !mutationAllowlists[target]?.has(relPath)) {
            violations.push({
              type: target,
              location: formatLocation(relPath, node.loc),
              snippet: source.slice(node.start, node.end)
            });
          }
        }
      });
    }

    if (violations.length > 0) {
      const details = violations
        .map((entry) => `[${entry.type}] ${entry.location}\n${entry.snippet}`)
        .join('\n\n');
      throw new Error(
        'Detected direct writes to Global/BATTLE outside the approved allowlist:\n\n' +
          details +
          '\n\nUpdate the allowlist or refactor the code to use services.'
      );
    }
  });
});
