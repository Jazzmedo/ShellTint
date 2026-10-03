/* ShellTint — minimal zip reader and writer for settings backups.
 *
 * Deflate comes from the browser's CompressionStream, so there is no library.
 * Reads stored and deflated entries; no zip64, encryption or multi-disk.
 */

'use strict';

(function (root) {
    const MAX_FILES = 500;
    const MAX_TOTAL = 64 * 1024 * 1024;

    const CRC_TABLE = new Uint32Array(256).map((_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c;
    });

    function crc32(bytes) {
        let c = 0xffffffff;
        for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    // Stops reading past `limit` bytes, so a header that lies about the size
    // can't inflate a bomb into memory.
    async function pipe(bytes, stream, limit = Infinity) {
        const chunks = [];
        let length = 0;
        const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > limit) {
                reader.cancel().catch(() => { });
                throw new Error('A file in the zip is larger than it claims');
            }
            chunks.push(value);
        }
        const out = new Uint8Array(length);
        let at = 0;
        for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
        return out;
    }

    function dosTime(date) {
        const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
        const day = ((Math.max(date.getFullYear(), 1980) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
        return [time, day];
    }

    // files: [{ name, data: Uint8Array | string }] → Blob
    async function zip(files, date = new Date()) {
        const enc = new TextEncoder();
        const [time, day] = dosTime(date);
        const parts = [];
        const central = [];
        let offset = 0;
        for (const file of files) {
            const name = enc.encode(file.name);
            const data = typeof file.data === 'string' ? enc.encode(file.data) : file.data;
            const packed = await pipe(data, new CompressionStream('deflate-raw'));
            const crc = crc32(data);

            const local = new DataView(new ArrayBuffer(30));
            local.setUint32(0, 0x04034b50, true);
            local.setUint16(4, 20, true);
            local.setUint16(6, 0x0800, true);          // names are UTF-8
            local.setUint16(8, 8, true);
            local.setUint16(10, time, true);
            local.setUint16(12, day, true);
            local.setUint32(14, crc, true);
            local.setUint32(18, packed.length, true);
            local.setUint32(22, data.length, true);
            local.setUint16(26, name.length, true);
            parts.push(local, name, packed);

            const entry = new DataView(new ArrayBuffer(46));
            entry.setUint32(0, 0x02014b50, true);
            entry.setUint16(4, 20, true);
            entry.setUint16(6, 20, true);
            entry.setUint16(8, 0x0800, true);
            entry.setUint16(10, 8, true);
            entry.setUint16(12, time, true);
            entry.setUint16(14, day, true);
            entry.setUint32(16, crc, true);
            entry.setUint32(20, packed.length, true);
            entry.setUint32(24, data.length, true);
            entry.setUint16(28, name.length, true);
            entry.setUint32(42, offset, true);
            central.push(entry, name);
            offset += 30 + name.length + packed.length;
        }
        const size = central.reduce((n, p) => n + p.byteLength, 0);
        const end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true);
        end.setUint16(8, files.length, true);
        end.setUint16(10, files.length, true);
        end.setUint32(12, size, true);
        end.setUint32(16, offset, true);
        return new Blob([...parts, ...central, end], { type: 'application/zip' });
    }

    // Blob → Map(name → Uint8Array). Throws on anything it can't read safely.
    async function unzip(blob) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        const view = new DataView(buf.buffer);
        let eocd = -1;
        for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
            if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        }
        if (eocd < 0) throw new Error('Not a zip file');
        const count = view.getUint16(eocd + 10, true);
        if (count > MAX_FILES) throw new Error('Too many files in the zip');

        const dec = new TextDecoder();
        const out = new Map();
        let total = 0;
        let p = view.getUint32(eocd + 16, true);
        for (let i = 0; i < count; i++) {
            if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged zip file');
            const method = view.getUint16(p + 10, true);
            const crc = view.getUint32(p + 16, true);
            const packedSize = view.getUint32(p + 20, true);
            const size = view.getUint32(p + 24, true);
            const nameLen = view.getUint16(p + 28, true);
            const skip = nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
            const local = view.getUint32(p + 42, true);
            const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
            p += 46 + skip;
            if (name.endsWith('/')) continue;

            total += size;
            if (total > MAX_TOTAL) throw new Error('The zip is too large');
            if (local + 30 > buf.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('Damaged zip file');
            const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
            const packed = buf.subarray(start, start + packedSize);
            let data;
            if (method === 0) data = packed;
            else if (method === 8) data = await pipe(packed, new DecompressionStream('deflate-raw'), size);
            else throw new Error(`Unsupported compression in ${name}`);
            if (data.length !== size || crc32(data) !== crc) throw new Error(`Damaged file in the zip: ${name}`);
            out.set(name, data);
        }
        return out;
    }

    const api = { crc32, zip, unzip, MAX_FILES, MAX_TOTAL };
    root.STZip = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
