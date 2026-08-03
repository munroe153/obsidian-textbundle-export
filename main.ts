import {
	App,
	Menu,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	normalizePath,
} from "obsidian";
import { createZip, ZipEntry } from "./zip";
import { rewriteImageLinks, encodeLinkTarget } from "./rewrite";

interface TextBundleExportSettings {
	/** textpack = single zipped file; textbundle = plain folder */
	outputFormat: "textpack" | "textbundle";
	/** where the bundle is written inside the vault */
	exportLocation: "same" | "root" | "custom";
	customFolder: string;
}

const DEFAULT_SETTINGS: TextBundleExportSettings = {
	outputFormat: "textpack",
	exportLocation: "same",
	customFolder: "",
};

/** Extensions treated as images — only these get packed into assets/. */
const IMAGE_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "bmp", "svg", "webp",
	"avif", "tif", "tiff", "heic", "heif", "ico",
]);

const INFO_JSON = {
	transient: false,
	type: "net.daringfireball.markdown",
	version: 2,
	creatorIdentifier: "md.obsidian.plugin.textbundle-export",
};

export default class TextBundleExportPlugin extends Plugin {
	settings: TextBundleExportSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("package", "Export to TextBundle", () => {
			const file = this.app.workspace.getActiveFile();
			if (file && file.extension === "md") {
				void this.exportNote(file);
			} else {
				new Notice("No active Markdown note.");
			}
		});

		this.addCommand({
			id: "export-current-note-to-textbundle",
			name: "Export current note to TextBundle",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && file.extension === "md") {
					if (!checking) void this.exportNote(file);
					return true;
				}
				return false;
			},
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu: Menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) =>
						item
							.setTitle("Export to TextBundle")
							.setIcon("package")
							.onClick(() => void this.exportNote(file))
					);
				}
			})
		);

		this.addSettingTab(new TextBundleSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/** Resolve a raw link path to an image file in the vault (null if none). */
	private resolveImage(linkpath: string, sourcePath: string): TFile | null {
		// strip heading `#h` / block `^id` references
		let p = linkpath.split("#")[0].split("^")[0].trim();
		if (!p) return null;
		if (/^(https?|data|obsidian):/i.test(p)) return null; // remote/URIs
		try {
			p = decodeURIComponent(p);
		} catch {
			/* keep as-is */
		}
		const dest = this.app.metadataCache.getFirstLinkpathDest(p, sourcePath);
		if (dest && IMAGE_EXTENSIONS.has(dest.extension.toLowerCase())) {
			return dest;
		}
		return null;
	}

	/**
	 * Collect the image files referenced by the note.
	 * Handles wiki embeds `![[img.png]]` and Markdown images `![](img.png)`.
	 */
	private collectImages(file: TFile, content: string): TFile[] {
		const images: TFile[] = [];
		const seen = new Set<string>();
		const add = (rawLink: string) => {
			const img = this.resolveImage(rawLink, file.path);
			if (img && !seen.has(img.path)) {
				seen.add(img.path);
				images.push(img);
			}
		};

		// wiki embeds: ![[image.png]] / ![[image.png|300]]
		const wikiRe = /!\[\[([^\]]+)\]\]/g;
		let m: RegExpExecArray | null;
		while ((m = wikiRe.exec(content)) !== null) add(m[1]);

		// markdown images: ![alt](path) / ![alt](<path with spaces>)
		const mdRe = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))/g;
		while ((m = mdRe.exec(content)) !== null) add(m[1] ?? m[2]);

		return images;
	}

	async exportNote(file: TFile) {
		try {
			const content = await this.app.vault.read(file);
			const images = this.collectImages(file, content);

			const infoJson = JSON.stringify(
				{ ...INFO_JSON, createdAt: new Date().toISOString() },
				null,
				2
			);

			// resolve the destination folder
			const destFolder = await this.resolveDestFolder(file);

			// assign a unique name inside assets/ to every packed image
			// (same filename may come from different vault folders)
			const usedNames = new Set<string>();
			const assetNames = new Map<string, string>(); // vault path → bundle name
			for (const img of images) {
				let name = img.name;
				if (usedNames.has(name.toLowerCase())) {
					let i = 2;
					while (
						usedNames.has(
							`${img.basename}-${i}.${img.extension}`.toLowerCase()
						)
					) {
						i++;
					}
					name = `${img.basename}-${i}.${img.extension}`;
				}
				usedNames.add(name.toLowerCase());
				assetNames.set(img.path, name);
			}

			// Repoint image references in the EXPORTED COPY to the packed
			// files in assets/. The note in the vault is never modified.
			const bundleText = rewriteImageLinks(content, (linkpath) => {
				const img = this.resolveImage(linkpath, file.path);
				const name = img ? assetNames.get(img.path) : undefined;
				return name ? encodeLinkTarget(`assets/${name}`) : null;
			});

			const bundleBase = sanitizeName(file.basename);

			if (this.settings.outputFormat === "textpack") {
				const encoder = new TextEncoder();
				const entries: ZipEntry[] = [
					{ name: "text.md", data: encoder.encode(bundleText) },
					{ name: "info.json", data: encoder.encode(infoJson) },
					{ name: "assets/", data: new Uint8Array(0) },
				];
				for (const img of images) {
					const data = await this.app.vault.readBinary(img);
					entries.push({
						name: `assets/${assetNames.get(img.path) ?? img.name}`,
						data: new Uint8Array(data),
					});
				}
				const bundle = createZip(entries);
				const outPath = this.availablePath(
					destFolder,
					`${bundleBase}.textpack`
				);
				await this.app.vault.createBinary(outPath, bundle);
				new Notice(
					`Exported ${images.length} image(s) → ${outPath}`
				);
			} else {
				const folderPath = this.availablePath(
					destFolder,
					`${bundleBase}.textbundle`
				);
				await this.ensureFolder(folderPath);
				await this.app.vault.create(`${folderPath}/text.md`, bundleText);
				await this.app.vault.create(
					`${folderPath}/info.json`,
					infoJson
				);
				await this.app.vault.createFolder(`${folderPath}/assets`);
				for (const img of images) {
					const data = await this.app.vault.readBinary(img);
					await this.app.vault.createBinary(
						`${folderPath}/assets/${
							assetNames.get(img.path) ?? img.name
						}`,
						data
					);
				}
				new Notice(
					`Exported ${images.length} image(s) → ${folderPath}`
				);
			}
		} catch (e) {
			console.error("TextBundle export failed", e);
			new Notice(
				`TextBundle export failed: ${
					e instanceof Error ? e.message : String(e)
				}`
			);
		}
	}

	private async resolveDestFolder(file: TFile): Promise<string> {
		const loc = this.settings.exportLocation;
		if (loc === "root") return "";
		if (loc === "custom") {
			const folder = normalizePath(this.settings.customFolder.trim());
			await this.ensureFolder(folder);
			return folder;
		}
		// "same" — the note's own folder ("" means vault root)
		return file.parent?.path === "/" ? "" : file.parent?.path ?? "";
	}

	private async ensureFolder(path: string): Promise<void> {
		const parts = normalizePath(path).split("/").filter(Boolean);
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	/** Return a collision-free path inside `folder` for a file/folder name. */
	private availablePath(folder: string, name: string): string {
		const dot = name.lastIndexOf(".");
		const base = dot > 0 ? name.slice(0, dot) : name;
		const ext = dot > 0 ? name.slice(dot) : "";
		const join = (n: string) =>
			normalizePath(folder ? `${folder}/${n}` : n);
		let candidate = join(name);
		let i = 1;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = join(`${base} ${i}${ext}`);
			i++;
		}
		return candidate;
	}
}

function sanitizeName(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|]/g, "-").trim();
	return cleaned.length > 0 ? cleaned : "note";
}

class TextBundleSettingTab extends PluginSettingTab {
	plugin: TextBundleExportPlugin;

	constructor(app: App, plugin: TextBundleExportPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Output format")
			.setDesc(
				"TextPack (.textpack) is a single zipped file; TextBundle (.textbundle) is a plain folder. In the exported copy, image references are repointed to the packed assets/ files; your original note is never modified."
			)
			.addDropdown((drop) =>
				drop
					.addOption("textpack", "TextPack (.textpack, zipped)")
					.addOption("textbundle", "TextBundle (.textbundle, folder)")
					.setValue(this.plugin.settings.outputFormat)
					.onChange(async (value) => {
						this.plugin.settings.outputFormat = value as
							| "textpack"
							| "textbundle";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Export location")
			.setDesc("Where the exported bundle is saved in your vault.")
			.addDropdown((drop) =>
				drop
					.addOption("same", "Same folder as the note")
					.addOption("root", "Vault root")
					.addOption("custom", "Custom folder")
					.setValue(this.plugin.settings.exportLocation)
					.onChange(async (value) => {
						this.plugin.settings.exportLocation = value as
							| "same"
							| "root"
							| "custom";
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.exportLocation === "custom") {
			new Setting(containerEl)
				.setName("Custom export folder")
				.setDesc("Folder inside the vault, created if missing.")
				.addText((text) =>
					text
						.setPlaceholder("e.g. exports")
						.setValue(this.plugin.settings.customFolder)
						.onChange(async (value) => {
							this.plugin.settings.customFolder = value;
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
