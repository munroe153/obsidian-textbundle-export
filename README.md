# TextBundle Export — Obsidian Plugin

Export any Obsidian note to the [TextBundle](http://textbundle.org/) format: the note's referenced images are copied into an `assets/` folder and packed together with the Markdown file. Inside the exported copy, image references are repointed to the packed files in `assets/` — **your original note in the vault is never modified**.

Works on **desktop and mobile** (`isDesktopOnly: false`, pure JavaScript, no Node.js APIs, zero runtime dependencies).

## What gets exported

```
MyNote.textpack            (a zip archive, per the TextPack spec)
├── text.md                ← exported copy, image links repointed to assets/
├── info.json              ← TextBundle metadata (v2, net.daringfireball.markdown)
└── assets/
    ├── photo.png          ← every image referenced by the note
    └── diagram.svg
```

You can also export to an uncompressed `MyNote.textbundle/` folder instead of a `.textpack` zip (configurable in settings).

Referenced images are detected in both Obsidian link styles, and rewritten to standard Markdown links pointing into `assets/`:

| In your note | In the exported `text.md` |
| --- | --- |
| `![[photo.png]]` | `![](assets/photo.png)` |
| `![[photo.png\|300]]` | `![](assets/photo.png)` (size params dropped) |
| `![[photo.png\|封面]]` | `![封面](assets/photo.png)` (alias kept as alt) |
| `![alt](folder/photo.png)` | `![alt](assets/photo.png)` |

Remote URLs (`http(s)://`, `data:`) and non-image attachments are left untouched — only vault images are packed. Duplicate filenames coming from different vault folders are de-duplicated (`image.png`, `image-2.png`, …) and the rewritten links follow the de-duplicated names. Filenames with spaces are percent-encoded in the links.

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
