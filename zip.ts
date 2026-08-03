/**
 * Minimal ZIP writer (STORE method, no compression).
 *
 * Zero dependencies — works on Obsidian desktop and mobile.
 * Produces standard archives readable by any unzip tool.
 */

export interface ZipEntry {
	/** Path inside the archive, e.g. "text.md" or "assets/photo.png". */
	name: string;
	data: Uint8Array;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i++) {
		crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

/** Create a ZIP archive (STORE method) from the given entries. */
export function createZip(entries: ZipEntry[], date: Date = new Date()): ArrayBuffer {
	const encoder = new TextEncoder();

	// MS-DOS date/time fields
	const dosTime =
		(date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
	const dosDate =
		(((date.getFullYear() - 1980) & 0x7f) << 9) |
		((date.getMonth() + 1) << 5) |
		date.getDate();

	interface Prepared {
		nameBytes: Uint8Array;
		data: Uint8Array;
		crc: number;
		isDir: boolean;
		offset: number;
	}

	const prepared: Prepared[] = entries.map((e) => {
		const nameBytes = encoder.encode(e.name);
		return {
			nameBytes,
			data: e.data,
			crc: crc32(e.data),
			isDir: e.name.endsWith("/"),
			offset: 0,
		};
	});

	// total size = local headers + central directory + end record
	let localSize = 0;
	for (const p of prepared) localSize += 30 + p.nameBytes.length + p.data.length;
	let centralSize = 0;
	for (const p of prepared) centralSize += 46 + p.nameBytes.length;
	const total = localSize + centralSize + 22;

	const out = new Uint8Array(total);
	const view = new DataView(out.buffer);
	let pos = 0;

	// --- local file headers + data ---
	for (const p of prepared) {
		p.offset = pos;
		view.setUint32(pos, 0x04034b50, true); // local header signature
		view.setUint16(pos + 4, 20, true); // version needed
		view.setUint16(pos + 6, 0x0800, true); // flag: UTF-8 names
		view.setUint16(pos + 8, 0, true); // method: STORE
		view.setUint16(pos + 10, dosTime, true);
		view.setUint16(pos + 12, dosDate, true);
		view.setUint32(pos + 14, p.crc, true);
		view.setUint32(pos + 18, p.data.length, true); // compressed size
		view.setUint32(pos + 22, p.data.length, true); // uncompressed size
		view.setUint16(pos + 26, p.nameBytes.length, true);
		view.setUint16(pos + 28, 0, true); // extra field length
		out.set(p.nameBytes, pos + 30);
		out.set(p.data, pos + 30 + p.nameBytes.length);
		pos += 30 + p.nameBytes.length + p.data.length;
	}

	// --- central directory ---
	const centralStart = pos;
	for (const p of prepared) {
		view.setUint32(pos, 0x02014b50, true); // central header signature
		view.setUint16(pos + 4, 20, true); // version made by
		view.setUint16(pos + 6, 20, true); // version needed
		view.setUint16(pos + 8, 0x0800, true); // flag: UTF-8 names
		view.setUint16(pos + 10, 0, true); // method: STORE
		view.setUint16(pos + 12, dosTime, true);
		view.setUint16(pos + 14, dosDate, true);
		view.setUint32(pos + 16, p.crc, true);
		view.setUint32(pos + 20, p.data.length, true);
		view.setUint32(pos + 24, p.data.length, true);
		view.setUint16(pos + 28, p.nameBytes.length, true);
		view.setUint16(pos + 30, 0, true); // extra
		view.setUint16(pos + 32, 0, true); // comment
		view.setUint16(pos + 34, 0, true); // disk number
		view.setUint16(pos + 36, 0, true); // internal attrs
		view.setUint32(pos + 38, p.isDir ? 0x10 : 0, true); // external attrs
		view.setUint32(pos + 42, p.offset, true); // local header offset
		out.set(p.nameBytes, pos + 46);
		pos += 46 + p.nameBytes.length;
	}

	// --- end of central directory ---
	view.setUint32(pos, 0x06054b50, true); // EOCD signature
	view.setUint16(pos + 4, 0, true); // disk
	view.setUint16(pos + 6, 0, true); // central dir disk
	view.setUint16(pos + 8, prepared.length, true);
	view.setUint16(pos + 10, prepared.length, true);
	view.setUint32(pos + 12, pos - centralStart, true); // central dir size
	view.setUint32(pos + 16, centralStart, true); // central dir offset
	view.setUint16(pos + 20, 0, true); // comment length

	return out.buffer;
}
