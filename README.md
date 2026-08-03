# TextBundle Export — Obsidian Plugin

Export any Obsidian note to the [TextBundle](http://textbundle.org/) format: the note's referenced images are copied into an `assets/` folder and packed together with the Markdown file — **the Markdown text itself is never modified** (no link rewriting, no format conversion, byte-for-byte identical).

Works on **desktop and mobile** (`isDesktopOnly: false`, pure JavaScript, no Node.js APIs, zero runtime dependencies).

## What gets exported

```
MyNote.textpack            (a zip archive, per the TextPack spec)
├── text.md                ← your note, unchanged
├── info.json              ← TextBundle metadata (v2, net.daringfireball.markdown)
└── assets/
    ├── photo.png          ← every image referenced by the note
    └── diagram.svg
```

You can also export to an uncompressed `MyNote.textbundle/` folder instead of a `.textpack` zip (configurable in settings).

Referenced images are detected in both Obsidian link styles:

- Wiki embeds: `![[image.png]]`, `![[image.png|300]]`
- Markdown images: `![alt](image.png)`, `![alt](<image with spaces.png>)`

Remote URLs (`http(s)://`, `data:`) are skipped. Non-image attachments are skipped — only image files are packed. Duplicate filenames coming from different vault folders are de-duplicated automatically (`image.png`, `image-2.png`, …).

## Usage

Three ways to export the current note:

1. **Ribbon icon** (package icon in the left ribbon)
2. **Command palette** → `TextBundle Export: Export current note to TextBundle`
3. **File explorer** → right-click any `.md` file → `Export to TextBundle`

The bundle is written next to the note (or to the vault root / a custom folder — see settings). If a bundle with the same name already exists, a suffix is added instead of overwriting.

### Moving the bundle out of the vault

- **Desktop:** the `.textpack` / `.textbundle` appears directly in your vault folder in the file manager.
- **Mobile:** long-press the exported `.textpack` in the file explorer → share, or open your vault folder with the system Files app.

## Settings

| Setting | Options | Default |
| --- | --- | --- |
| Output format | `.textpack` (zipped) / `.textbundle` (folder) | `.textpack` |
| Export location | Same folder as note / Vault root / Custom folder | Same folder as note |

## Installation

### From this repository (manual)

1. Download `main.js` and `manifest.json` (they are committed to this repo, or grab them from a [release](../../releases)).
2. Create a folder `<your-vault>/.obsidian/plugins/textbundle-export/` and copy the two files into it.
3. Restart Obsidian (or reload plugins) and enable **TextBundle Export** in *Settings → Community plugins*.

### Via BRAT (recommended for updates)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. In BRAT, choose *Add Beta plugin* and enter `munroe153/obsidian-textbundle-export`.
3. Enable **TextBundle Export**.

## Development

```bash
npm install
npm run dev      # watch mode
npm run build    # type-check + production build → main.js
```

To release, bump the version and push a tag — the included GitHub Action builds the plugin and attaches `main.js` + `manifest.json` to a new release:

```bash
npm version patch   # or minor / major
git push && git push --tags
```

## License

MIT
