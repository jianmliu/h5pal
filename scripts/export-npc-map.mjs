#!/usr/bin/env node
import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_DIR = path.resolve(ROOT, 'pal-assets/exported-storygraphs');
const DEFAULT_OUTPUT_PATH = path.resolve(ROOT, 'pal-assets/npc-event-map.json');
const DEFAULT_MAX_DIALOGUES = 5;

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) {
      continue;
    }
    const trimmed = token.slice(2);
    const [key, value] = trimmed.includes('=') ? trimmed.split(/=(.+)/, 2) : [trimmed, undefined];
    if (typeof value === 'undefined') {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i += 1;
      } else {
        result[key] = true;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

function printHelp() {
  console.log(`Usage: npm run export:npc-map -- [options]

Options:
  --source <dir>         StoryGraph directory (default: pal-assets/exported-storygraphs)
  --output <path>        Output JSON path (default: pal-assets/npc-event-map.json)
  --scenes <ids>         Comma-separated scene ids (default: all available)
  --max-dialogues <n>    Max dialogues stored per event (default: 5)
  --quiet                Suppress progress logs
  --help                 Show this help text
`);
}

function normalizeSpeaker(rawSpeaker, text) {
  if (typeof rawSpeaker === 'string' && rawSpeaker.trim()) {
    return rawSpeaker.trim();
  }
  if (typeof text === 'string') {
    const separators = ['：', ':', '﹕'];
    for (let i = 0; i < separators.length; i++) {
      const idx = text.indexOf(separators[i]);
      if (idx > 0 && idx < 12) {
        return text.slice(0, idx).trim();
      }
    }
  }
  return null;
}

function parseSceneList(value) {
  if (!value) {
    return null;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => Number(entry))
      .filter((num) => Number.isFinite(num) && num > 0);
  }
  return String(value)
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((num) => Number.isFinite(num) && num > 0);
}

async function loadManifestEntries(sourceDir) {
  const manifestPath = path.join(sourceDir, 'manifest.json');
  try {
    const manifestContent = await readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    if (Array.isArray(manifest?.entries) && manifest.entries.length) {
      return manifest.entries
        .map((entry) => ({
          sceneId: Number(entry.sceneId),
          filename: entry.filename || `scene-${entry.sceneId}.json`
        }))
        .filter((entry) => Number.isFinite(entry.sceneId) && entry.sceneId > 0);
    }
  } catch {
    // ignore, fallback to directory scan
  }
  return null;
}

async function discoverSceneEntries(sourceDir) {
  const manifestEntries = await loadManifestEntries(sourceDir);
  if (manifestEntries && manifestEntries.length) {
    return manifestEntries;
  }
  const files = await readdir(sourceDir);
  return files
    .filter((name) => /^scene-\d+\.json$/i.test(name))
    .map((filename) => {
      const match = filename.match(/scene-(\d+)\.json/i);
      return {
        sceneId: match ? Number(match[1]) : null,
        filename
      };
    })
    .filter((entry) => Number.isFinite(entry.sceneId) && entry.sceneId > 0);
}

function ensureSpeakerBucket(map, speaker) {
  if (!map.has(speaker)) {
    map.set(speaker, new Map());
  }
  return map.get(speaker);
}

function ensureEventEntry(bucket, baseMeta) {
  const key = `${baseMeta.sceneId}:${baseMeta.eventId}`;
  if (!bucket.has(key)) {
    bucket.set(key, {
      sceneId: baseMeta.sceneId,
      eventId: baseMeta.eventId,
      mapId: baseMeta.mapId,
      spriteId: baseMeta.spriteId,
      position: baseMeta.position,
      offsets: baseMeta.offsets,
      scripts: baseMeta.scripts,
      dialogues: []
    });
  }
  return bucket.get(key);
}

function extractEventIdFromNode(nodeId) {
  if (typeof nodeId !== 'string') {
    return null;
  }
  const match = nodeId.match(/event-(\d+)/i);
  return match ? Number(match[1]) : null;
}

function extractEventMeta(graph, node) {
  const sceneId = graph?.sceneId ?? null;
  const metadata = node?.metadata || {};
  const context = metadata.context || {};
  const eventContext = context.event || {};
  const eventId = eventContext.id ?? extractEventIdFromNode(node?.id);
  if (!eventId) {
    return null;
  }
  const mapId = context.mapId ?? graph?.metadata?.context?.mapId ?? metadata.mapNum ?? null;
  const spriteId = eventContext.spriteId ?? metadata.spriteId ?? null;
  const position = eventContext.position || null;
  const offsets = eventContext.offsets || null;
  const scripts = {
    trigger: metadata.triggerScript ?? eventContext.triggerScript ?? null,
    auto: metadata.autoScript ?? eventContext.autoScript ?? null
  };
  return {
    sceneId,
    eventId,
    mapId,
    spriteId,
    position,
    offsets,
    scripts
  };
}

function processGraph(graph, speakerMap, options) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const maxDialogues = options.maxDialoguesPerEvent ?? DEFAULT_MAX_DIALOGUES;
  nodes.forEach((node) => {
    if (!node || node.type !== 'event') {
      return;
    }
    const baseMeta = extractEventMeta(graph, node);
    if (!baseMeta) {
      return;
    }
    const dialogues = node.metadata?.narrative?.dialogues;
    if (!Array.isArray(dialogues) || !dialogues.length) {
      return;
    }
    dialogues.forEach((dialogue) => {
      if (!dialogue || !dialogue.text) {
        return;
      }
      const speaker = normalizeSpeaker(dialogue.speaker, dialogue.text);
      if (!speaker) {
        return;
      }
      const bucket = ensureSpeakerBucket(speakerMap, speaker);
      const entry = ensureEventEntry(bucket, baseMeta);
      if (entry.dialogues.length >= maxDialogues) {
        return;
      }
      entry.dialogues.push({
        text: dialogue.text,
        speaker,
        msgId: dialogue.msgId ?? null,
        pointer: dialogue.pointer ?? null,
        path: dialogue.path ?? null
      });
    });
  });
}

function serializeResult(map, stats, options) {
  const entries = {};
  const speakers = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'zh-Hans', { sensitivity: 'base' }));
  let totalEvents = 0;
  speakers.forEach((speaker) => {
    const bucket = map.get(speaker);
    const events = Array.from(bucket.values());
    totalEvents += events.length;
    entries[speaker] = {
      occurrences: events.length,
      events
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    sourceDir: path.resolve(options.sourceDir),
    outputPath: path.resolve(options.outputPath),
    totalSpeakers: speakers.length,
    totalEvents,
    processedScenes: stats.processedScenes,
    requestedScenes: stats.requestedScenes,
    totalSceneCount: stats.totalSceneCount,
    entries
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const sourceDir = path.resolve(args.source || args.sourceDir || DEFAULT_SOURCE_DIR);
  const outputPath = path.resolve(args.output || args.outputPath || DEFAULT_OUTPUT_PATH);
  const sceneFilter = parseSceneList(args.scenes || args.sceneIds || args.scene);
  const maxDialoguesPerEvent = Number.isFinite(Number(args['max-dialogues'] || args.maxDialogues))
    ? Math.max(1, Number(args['max-dialogues'] || args.maxDialogues))
    : DEFAULT_MAX_DIALOGUES;
  const quiet = args.quiet === true || args.quiet === 'true';

  const entries = await discoverSceneEntries(sourceDir);
  if (!entries.length) {
    throw new Error(`[npc-map] no scene files found under ${sourceDir}`);
  }
  const filteredEntries = sceneFilter && sceneFilter.length
    ? entries.filter((entry) => sceneFilter.includes(entry.sceneId))
    : entries;
  if (!filteredEntries.length) {
    throw new Error('[npc-map] no scene entries matched the provided filters');
  }
  filteredEntries.sort((a, b) => a.sceneId - b.sceneId);

  const speakerMap = new Map();
  let processedScenes = 0;
  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const filePath = path.join(sourceDir, entry.filename);
    try {
      const content = await readFile(filePath, 'utf-8');
      const graph = JSON.parse(content);
      if (!graph.sceneId) {
        graph.sceneId = entry.sceneId;
      }
      processGraph(graph, speakerMap, { maxDialoguesPerEvent });
      processedScenes += 1;
      if (!quiet) {
        console.info(`[npc-map] processed scene ${entry.sceneId} (${processedScenes}/${filteredEntries.length})`);
      }
    } catch (err) {
      console.warn(`[npc-map] skipped scene ${entry.sceneId}: ${err.message || err}`);
    }
  }

  const stats = {
    processedScenes,
    requestedScenes: filteredEntries.length,
    totalSceneCount: entries.length
  };
  const payload = serializeResult(speakerMap, stats, { sourceDir, outputPath });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.info(`[npc-map] wrote ${payload.totalSpeakers} speakers / ${payload.totalEvents} events -> ${outputPath}`);
}

main().catch((err) => {
  console.error('[npc-map] failed', err);
  process.exitCode = 1;
});
