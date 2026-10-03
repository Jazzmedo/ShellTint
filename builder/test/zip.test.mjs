import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const Z = require('../../extension/shared/zip.js');

test('crc32 matches the reference value', () => {
  assert.equal(Z.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('zip round-trips and is readable by unzip(1)', async () => {
  const css = 'body {\n  color: var(--shelltint-primary);\n}\n'.repeat(200);
  const blob = await Z.zip([
    { name: 'shelltint-backup.json', data: '{"format":1}' },
    { name: 'styles/s1-émoji.css', data: css },
    { name: 'empty.css', data: '' },
  ]);
  const files = await Z.unzip(blob);
  const dec = new TextDecoder();
  assert.equal(dec.decode(files.get('shelltint-backup.json')), '{"format":1}');
  assert.equal(dec.decode(files.get('styles/s1-émoji.css')), css);
  assert.equal(files.get('empty.css').length, 0);

  const dir = mkdtempSync(join(tmpdir(), 'st-zip-'));
  const path = join(dir, 'b.zip');
  writeFileSync(path, Buffer.from(await blob.arrayBuffer()));
  try {
    execFileSync('unzip', ['-tq', path]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error; // unzip(1) not installed
  }
});

// A hand-built single-entry zip, so stored entries and bad headers can be tested.
function rawZip(name, data, { method = 0, crc = Z.crc32(data), size = data.length } = {}) {
  const packed = method === 8 ? deflateRawSync(data) : data;
  const n = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(size, 22);
  local.writeUInt16LE(n.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(size, 24);
  central.writeUInt16LE(n.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + n.length, 12); end.writeUInt32LE(30 + n.length + packed.length, 16);
  return new Blob([local, n, packed, central, n, end]);
}

test('reads stored entries and rejects damage, lies and junk', async () => {
  const data = Buffer.from('a { color: red }');
  assert.equal(new TextDecoder().decode((await Z.unzip(rawZip('a.css', data))).get('a.css')), 'a { color: red }');
  await assert.rejects(Z.unzip(rawZip('a.css', data, { crc: 1 })), /Damaged/);
  await assert.rejects(Z.unzip(rawZip('a.css', Buffer.alloc(100000), { method: 8, size: 10 })), /larger than it claims/);
  await assert.rejects(Z.unzip(new Blob(['not a zip at all, just some text'])), /Not a zip/);
});

test('backups written by Info-ZIP are read too', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'st-zip-'));
  writeFileSync(join(dir, 'x.css'), 'x { y: z }\n'.repeat(50));
  try {
    execFileSync('zip', ['-q', 'out.zip', 'x.css'], { cwd: dir });
  } catch (error) {
    if (error.code === 'ENOENT') return; // zip(1) not installed
    throw error;
  }
  const files = await Z.unzip(new Blob([readFileSync(join(dir, 'out.zip'))]));
  assert.equal(new TextDecoder().decode(files.get('x.css')), 'x { y: z }\n'.repeat(50));
});
