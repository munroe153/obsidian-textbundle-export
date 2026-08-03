/**
 * Rewrite image references in a note's Markdown so they point at the
 * files packed inside the TextBundle's assets/ folder.
 *
 * Pure string transformation applied ONLY to the exported copy
 * (text.md inside the bundle) — the note in the vault is never touched.
 */

/**
 * Given a raw link path (e.g. "folder/photo.png" from `![[...]]` or `![](...)`),
 * return the new link target inside the bundle (e.g. "assets/photo.png"),
 * or null to leave the reference unchanged.
 */
export type LinkResolver = (linkpath: string) => string | null;

/** `![[img.png|300]]`-style size parameters are dropped, real aliases become alt text. */
function isDimension(alias: string): boolean {
	return /^\d+(x\d+)?$/.test(alias);
}

/** Percent-encode a bundle-relative path for use as a Markdown link target. */
export function encodeLinkTarget(path: string): string {
	return encodeURI(path).replace(
		/[()]/g,
		(c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
	);
}

export function rewriteImageLinks(content: string, resolve: LinkResolver): string {
	// wiki embeds: ![[path]] / ![[path|alias]] / ![[path|300]]
	let out = content.replace(/!\[\[([^\]]+)\]\]/g, (match, inner: string) => {
		const pipe = inner.indexOf("|");
		const linkpath = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
		const alias = pipe >= 0 ? inner.slice(pipe + 1).trim() : "";
		const target = resolve(linkpath);
		if (!target) return match; // not a packed image — keep as-is
		const alt = isDimension(alias) ? "" : alias.replace(/[[\]]/g, "");
		return `![${alt}](${target})`;
	});

	// markdown images: ![alt](path) / ![alt](<path>) / with optional title
	out = out.replace(
		/!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))([^)]*)\)/g,
		(
			match,
			alt: string,
			anglePath: string | undefined,
			plainPath: string | undefined
		) => {
			const linkpath = (anglePath ?? plainPath ?? "").trim();
			const target = resolve(linkpath);
			if (!target) return match; // remote / unresolved / non-image — keep as-is
			return `![${alt}](${target})`;
		}
	);

	return out;
}
