// A tiny ZIP writer — enough to hand someone a folder of photos plus a manifest.
//
// Entries are stored, not deflated: WebP and JPEG are already compressed, so
// deflate would spend time to save almost nothing. That keeps this to a few
// dozen lines instead of a dependency.

const LOCAL  = 0x04034b50;
const CENTR  = 0x02014b50;
const EOCD   = 0x06054b50;
const UTF8   = 0x0800;        // flag bit 11: names are UTF-8

// Fixed DOS timestamp (2020-01-01 00:00) so the same input zips identically.
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

/**
 * @param {Array<{name: string, data: Uint8Array}>} files
 * @returns {Blob}
 */
export function zip(files) {
    const chunks  = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
        const name = new TextEncoder().encode(file.name);
        const crc  = crc32(file.data);
        const size = file.data.length;

        const header = new DataView(new ArrayBuffer(30));
        header.setUint32(0, LOCAL, true);
        header.setUint16(4, 20, true);        // version needed
        header.setUint16(6, UTF8, true);
        header.setUint16(8, 0, true);         // method: stored
        header.setUint16(10, DOS_TIME, true);
        header.setUint16(12, DOS_DATE, true);
        header.setUint32(14, crc, true);
        header.setUint32(18, size, true);     // compressed
        header.setUint32(22, size, true);     // uncompressed
        header.setUint16(26, name.length, true);
        header.setUint16(28, 0, true);        // extra

        chunks.push(new Uint8Array(header.buffer), name, file.data);

        const dir = new DataView(new ArrayBuffer(46));
        dir.setUint32(0, CENTR, true);
        dir.setUint16(4, 20, true);           // version made by
        dir.setUint16(6, 20, true);           // version needed
        dir.setUint16(8, UTF8, true);
        dir.setUint16(10, 0, true);
        dir.setUint16(12, DOS_TIME, true);
        dir.setUint16(14, DOS_DATE, true);
        dir.setUint32(16, crc, true);
        dir.setUint32(20, size, true);
        dir.setUint32(24, size, true);
        dir.setUint16(28, name.length, true);
        dir.setUint16(30, 0, true);           // extra
        dir.setUint16(32, 0, true);           // comment
        dir.setUint16(34, 0, true);           // disk
        dir.setUint16(36, 0, true);           // internal attrs
        dir.setUint32(38, 0, true);           // external attrs
        dir.setUint32(42, offset, true);      // local header offset

        central.push(new Uint8Array(dir.buffer), name);
        offset += 30 + name.length + size;
    }

    const centralSize = central.reduce((n, part) => n + part.length, 0);

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, EOCD, true);
    end.setUint16(4, 0, true);                // this disk
    end.setUint16(6, 0, true);                // disk with central dir
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);               // comment length

    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)],
                    { type: 'application/zip' });
}

const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[i] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
