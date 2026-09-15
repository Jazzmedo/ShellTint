#!/usr/bin/env node
// Compiles every Catppuccin userstyle with the palette the ShellTint helper
// resolved from the desktop shell, and publishes the per-site CSS blocks the
// extension injects into matching pages.
//
//   node build.mjs [--force] [--only youtube,github] [--jobs 6] [--mode dark|light]
//                  [--palette ~/.cache/shelltint/palette.json]
//
// Output: <out>/gen-<hash>-<time>/{index.json,blocks/<sha256>.css}, with
// <out>/current pointing at the newest generation. The pointer is swapped
// atomically, so the helper never reads a half-written generation.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

import { SLOTS, buildSlots } from './palette.mjs';
import { solveFilter } from './filter-solver.mjs';
import { splitCompiled } from './split.mjs';

const BUILDER_VERSION = 2;
const KEEP_GENERATIONS = 3;
const PRIORITY = ['youtube', 'github', 'twitter'];
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const CACHE = process.env.SHELLTINT_CACHE || path.join(process.env.XDG_CACHE_HOME || path.join(HOME, '.cache'), 'shelltint');
const CONFIG = path.join(process.env.XDG_CONFIG_HOME || path.join(HOME, '.config'), 'shelltint');

const HEADER = /\/\*\s*==UserStyle==[\s\S]*?==\/UserStyle==\s*\*\//;
const STD_IMPORT = /@import\s+(?:url\(\s*)?["']https:\/\/userstyles\.catppuccin\.com\/lib\/std\/v1\.less["']\s*\)?\s*;/;
const HEX = /^#[0-9a-f]{6}$/i;

const sha256 = text => createHash('sha256').update(text).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const log = msg => console.log(`[${new Date().toISOString()}] ${msg}`);

function writeFileAtomic(file, content) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function parseArgs(argv) {
  const args = {
    force: false,
    only: null,
    mode: null,
    // A quarter of the cores: a theme change should not saturate the desktop.
    jobs: Math.max(1, Number(process.env.SHELLTINT_BUILD_JOBS) || Math.min(4, Math.floor(os.cpus().length / 4))),
    out: path.join(CACHE, 'userstyles'),
    bundle: process.env.SHELLTINT_BUNDLE || path.join(CACHE, 'catppuccin'),
    palette: path.join(CACHE, 'palette.json'),
    vars: path.join(CONFIG, 'userstyle-vars.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${flag} needs a value`);
      return argv[++i];
    };
    switch (flag) {
      case '--force': args.force = true; break;
      case '--only': args.only = new Set(value().split(',').filter(Boolean)); break;
      case '--jobs': args.jobs = Math.max(1, Number(value()) || 1); break;
      case '--mode': args.mode = value(); break;
      case '--out': args.out = value(); break;
      case '--bundle': args.bundle = value(); break;
      case '--palette': args.palette = value(); break;
      case '--vars': args.vars = value(); break;
      default: throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (args.mode !== null && args.mode !== 'dark' && args.mode !== 'light') {
    throw new Error(`--mode must be dark or light, not ${args.mode}`);
  }
  return args;
}

// The palette file is written by the helper (host/shelltint/palette.py), which
// has already normalised the shell's colours to Material 3 role names.
export function loadPalette(file) {
  let palette;
  try {
    palette = readJson(file);
  } catch (err) {
    throw new Error(`cannot read the palette at ${file}: ${err.message}`);
  }
  if (palette?.format !== 1) throw new Error(`${file} is not a format 1 ShellTint palette`);
  if (palette.mode !== 'dark' && palette.mode !== 'light') throw new Error(`${file} has no dark or light mode`);
  const roles = {};
  for (const [role, value] of Object.entries(palette.roles ?? {})) {
    if (typeof value === 'string' && HEX.test(value)) roles[role] = value.toLowerCase();
  }
  if (!roles.primary || !(roles.surface || roles.background)) {
    throw new Error(`${file} lacks the primary and surface colours`);
  }
  const dank16 = {};
  for (const [key, value] of Object.entries(palette.extras?.dank16 ?? {})) {
    if (typeof value === 'string' && HEX.test(value)) dank16[key] = value.toLowerCase();
  }
  return { ...palette, roles, dank16 };
}

function solveFilters(outDir, slots) {
  const cacheFile = path.join(outDir, 'filter-cache.json');
  let cache = {};
  try { cache = readJson(cacheFile); } catch { /* cold cache */ }
  let changed = false;
  const filters = {};
  for (const slot of SLOTS) {
    const hex = slots[slot];
    if (!cache[hex]) {
      cache[hex] = solveFilter(hex).filter;
      changed = true;
    }
    filters[slot] = cache[hex];
  }
  if (changed) writeFileAtomic(cacheFile, JSON.stringify(cache));
  return filters;
}

// The vendored std library holds one palette line per flavour in each of its two
// maps (colours, then filters). The active flavour's lines get the shell's
// values; the other flavours keep Catppuccin's, so every lookup stays valid.
function makeStdLib(stdText, flavor, slots, filters) {
  const colours = SLOTS.map(slot => `@${slot}: ${slots[slot]};`).join(' ');
  const filterValues = SLOTS.map(slot => `@${slot}: ${filters[slot]};`).join(' ');
  const line = new RegExp(`^(\\s*@${flavor}:\\s*)\\{.*\\};[ \\t]*$`, 'gm');
  let seen = 0;
  const text = stdText.replace(line, (_, lead) => (++seen === 1 ? `${lead}{ ${colours} };` : `${lead}{ ${filterValues} };`));
  if (seen !== 2) throw new Error(`Catppuccin std library layout changed: found ${seen} "@${flavor}" palette lines, expected 2`);
  return text;
}

// Serialises a UserCSS variable the way Stylus hands it to Less.
function serializeVar(v) {
  const raw = v.value ?? v.default;
  switch (v.type) {
    case 'select':
    case 'dropdown':
    case 'image': {
      const options = v.options ?? [];
      const option = options.find(o => o.name === raw) ?? options.find(o => o.value === raw);
      return option ? option.value : raw;
    }
    case 'checkbox':
      return String(raw) === '1' || raw === true ? '1' : '0';
    case 'range':
    case 'number':
      return `${raw}${v.units ?? ''}`;
    default:
      return raw;
  }
}

function prepareSource(entry, stdPath, flavor, overrides) {
  const values = {};
  for (const [name, v] of Object.entries(entry.usercssData?.vars ?? {})) values[name] = serializeVar(v);
  Object.assign(values, overrides);
  values.lightFlavor = flavor;
  values.darkFlavor = flavor;
  values.accentColor = 'mauve';

  const body = entry.sourceCode.replace(HEADER, '');
  if (!STD_IMPORT.test(body)) return { error: 'does not import the Catppuccin std v1 library' };
  const header = Object.entries(values).map(([name, value]) => `@${name}: ${value};`).join('\n');
  return { source: `${header}\n${body.replace(STD_IMPORT, `@import "${stdPath}";`)}` };
}

const slugify = name =>
  name.replace(/\s*Catppuccin\s*$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';

function compileAll(jobs, tasks) {
  return new Promise(resolve => {
    const results = new Map();
    if (!tasks.length) return resolve(results);
    let next = 0;
    let live = 0;

    const spawn = () => {
      const worker = new Worker(new URL('./compile-worker.mjs', import.meta.url));
      let current = null;
      live++;
      const feed = () => {
        if (next >= tasks.length) {
          worker.terminate();
          return;
        }
        current = tasks[next++];
        worker.postMessage(current);
      };
      worker.on('message', msg => {
        results.set(msg.id, msg);
        feed();
      });
      worker.on('error', err => {
        if (current) results.set(current.id, { id: current.id, error: `compiler crashed: ${err.message}` });
        current = null;
      });
      worker.on('exit', () => {
        live--;
        if (next < tasks.length) spawn();
        else if (live === 0) resolve(results);
      });
      feed();
    };
    for (let i = 0; i < Math.min(jobs, tasks.length); i++) spawn();
  });
}

function prune(outDir, keep) {
  const generations = fs.readdirSync(outDir)
    .filter(name => name.startsWith('gen-'))
    .map(name => ({ name, mtime: fs.statSync(path.join(outDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const { name } of generations.slice(KEEP_GENERATIONS)) {
    if (name !== `gen-${keep}`) fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
  }
  const stale = Date.now() - 10 * 60 * 1000;
  for (const name of fs.readdirSync(outDir)) {
    const full = path.join(outDir, name);
    if (name.startsWith('.tmp-gen-') && fs.statSync(full).mtimeMs < stale) fs.rmSync(full, { recursive: true, force: true });
  }
}

async function main() {
  const started = performance.now();
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.out, { recursive: true });

  const palette = loadPalette(args.palette);
  const mode = args.mode ?? palette.mode;
  const flavor = mode === 'light' ? 'latte' : 'mocha';
  const slots = buildSlots(palette.roles, palette.dank16, mode);
  const filters = solveFilters(args.out, slots);
  const sourceId = typeof palette.source?.id === 'string' ? palette.source.id : null;

  const bundleText = fs.readFileSync(path.join(args.bundle, 'import.json'), 'utf8');
  const stdText = fs.readFileSync(path.join(args.bundle, 'std-v1.less'), 'utf8');
  const lessVersion = readJson(path.join(HERE, 'node_modules/less/package.json')).version;
  let overrides = {};
  try { overrides = readJson(args.vars); } catch { /* optional */ }

  const paletteHash = sha256(JSON.stringify({
    slots, filters, mode, overrides,
    bundle: sha256(bundleText), std: sha256(stdText), less: lessVersion, builder: BUILDER_VERSION,
    only: args.only ? [...args.only].sort() : null,
  }));
  if (!args.force) {
    try {
      if (readJson(path.join(args.out, 'current/index.json')).paletteHash === paletteHash) {
        log(`palette unchanged (${mode}, accent ${slots.mauve}); nothing to build`);
        return 0;
      }
    } catch { /* no current generation */ }
  }

  const gen = `${paletteHash.slice(0, 12)}-${Math.floor(Date.now() / 1000)}`;
  const tmpDir = path.join(args.out, `.tmp-gen-${gen}-${process.pid}`);
  const blocksDir = path.join(tmpDir, 'blocks');
  fs.mkdirSync(blocksDir, { recursive: true });
  const stdPath = path.join(tmpDir, 'palette-std.less');
  fs.writeFileSync(stdPath, makeStdLib(stdText, flavor, slots, filters));

  const entries = JSON.parse(bundleText).filter(entry => entry && typeof entry.sourceCode === 'string');
  const styles = [];
  const failed = [];
  const tasks = [];
  const ids = new Map();
  for (const entry of entries) {
    const name = entry.usercssData?.name ?? entry.name ?? 'Unnamed';
    let id = slugify(name);
    const count = (ids.get(id) ?? 0) + 1;
    ids.set(id, count);
    if (count > 1) id = `${id}-${count}`;
    if (args.only && !args.only.has(id)) continue;

    const prepared = prepareSource(entry, stdPath, flavor, overrides[id] ?? {});
    if (prepared.error) {
      failed.push({ id, name, error: prepared.error });
      continue;
    }
    styles.push({ id, name });
    tasks.push({ id, source: prepared.source, filename: path.join(tmpDir, `${id}.user.less`) });
  }
  const rank = id => (PRIORITY.includes(id) ? PRIORITY.indexOf(id) : PRIORITY.length);
  tasks.sort((a, b) => rank(a.id) - rank(b.id));

  const results = await compileAll(args.jobs, tasks);

  const published = [];
  const written = new Set();
  const warnings = [];
  let bytes = 0;
  // Bundle order, not compile order: it decides injection order when several
  // styles match one page.
  for (const style of styles) {
    const result = results.get(style.id);
    if (!result || result.error) {
      failed.push({ ...style, error: result?.error ?? 'no result from the compiler' });
      continue;
    }
    let split;
    try {
      split = splitCompiled(result.css);
    } catch (err) {
      failed.push({ ...style, error: `split: ${err.message}` });
      continue;
    }
    if (!split.blocks.length) {
      failed.push({ ...style, error: 'no site blocks after compiling' });
      continue;
    }
    for (const warning of split.warnings) warnings.push(`${style.id}: ${warning}`);
    for (const block of split.blocks) {
      if (written.has(block.hash)) continue;
      fs.writeFileSync(path.join(blocksDir, `${block.hash}.css`), block.css);
      written.add(block.hash);
      bytes += block.bytes;
    }
    published.push({
      id: style.id,
      name: style.name,
      blocks: split.blocks.map(({ hash, bytes: size, matchers }) => ({ hash, bytes: size, matchers })),
    });
  }

  if (!published.length) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    log(`no style compiled; keeping the previous generation. First failure: ${failed[0]?.id}: ${failed[0]?.error}`);
    return 1;
  }

  const index = {
    format: 1,
    gen,
    paletteHash,
    createdAt: Date.now() / 1000,
    mode,
    flavor,
    sourceId,
    palette: slots,
    source: { bundleSha256: sha256(bundleText), less: lessVersion, builder: BUILDER_VERSION },
    stats: {
      total: entries.length,
      ok: published.length,
      failed,
      warnings,
      bytes,
      ms: Math.round(performance.now() - started),
    },
    styles: published,
  };
  writeFileAtomic(path.join(tmpDir, 'index.json'), JSON.stringify(index));

  fs.renameSync(tmpDir, path.join(args.out, `gen-${gen}`));
  const link = path.join(args.out, 'current');
  const tmpLink = `${link}.tmp-${process.pid}`;
  fs.rmSync(tmpLink, { force: true });
  fs.symlinkSync(`gen-${gen}`, tmpLink);
  fs.renameSync(tmpLink, link);
  prune(args.out, gen);

  log(`published gen-${gen}: ${published.length}/${entries.length} styles, ${failed.length} failed, ` +
    `${(bytes / 1048576).toFixed(1)} MiB, ${index.stats.ms} ms (${sourceId ?? 'palette'}, ${mode}, accent ${slots.mauve})`);
  for (const f of failed) log(`  failed ${f.id}: ${f.error}`);
  return 0;
}

// Run only as a program, so tests can import loadPalette.
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    code => process.exit(code),
    err => {
      log(`build failed: ${err.stack ?? err.message}`);
      process.exit(1);
    },
  );
}
