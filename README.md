# NotchCue

Cue cards in your MacBook notch — at camera level, invisible to everyone else.

[NotchPrompter](https://notchprompter.com) displays text in the notch at the top of your MacBook screen, which sits right at eye level with your webcam. NotchCue is a local web UI that lets you prepare and instantly load scripts into it — so you can read prepared answers during interviews, calls, or presentations while appearing to look directly at the camera.

Click a button → script loads → you're reading, they think you're making eye contact.

---

## Requirements

- macOS (uses `defaults` and `osascript`)
- Node.js 18+ (no npm dependencies)
- Python 3 (ships with macOS)
- [NotchPrompter](https://notchprompter.com) installed

---

## Quick Start

```bash
git clone https://github.com/damirkasimov2211/notchcue.git
cd notch-launcher
cp -r examples/* scripts/        # seed with sample files, or skip and add your own
node launcher.mjs                 # opens http://localhost:7474 automatically
```

That's it. No `npm install`, no build step.

---

## Adding Your Own Scripts

Drop `.txt` files into `scripts/` (or a subdirectory for a new tab). The launcher picks them up on every page load — no restart needed.

### File format

```
# title: Card display name
# labels: Tag One · Tag Two · Tag Three
# role: Group heading

Everything after the header lines is injected into NotchPrompter verbatim.
Markdown and line breaks are preserved.
```

All three header lines are optional:

| Header | Purpose | Fallback |
|--------|---------|---------|
| `# title:` | Card heading in the UI | Filename with hyphens/underscores replaced by spaces |
| `# labels:` | Colour-coded filter chips (middle-dot `·` separated) | No chips |
| `# role:` | Section heading in `grouped` layout tabs | Last label value, or "Other" |

### Starter template

```
# title: My Script
# labels: Category · Subcategory

Your script text here.
```

### File naming

Files are sorted alphabetically, so prefix with `00-`, `01-`, etc. to control order.

---

## Configuration (`config.json`)

```json
{
  "port": 7474,
  "bundleId": "io.simplelocalize.notch-prompter",
  "scriptsDir": "./scripts",
  "tabs": [
    { "id": "stories",  "label": "Story Bank",       "dir": "",   "layout": "cards"   },
    { "id": "cv",       "label": "CV Bullet Points",  "dir": "cv", "layout": "grouped" }
  ]
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `7474` | Port for the local server |
| `bundleId` | `io.simplelocalize.notch-prompter` | macOS bundle ID of NotchPrompter |
| `scriptsDir` | `./scripts` | Root directory for your `.txt` files |
| `tabs` | see above | Array of tab definitions |

### Tab object

| Key | Description |
|-----|-------------|
| `id` | Unique identifier used internally |
| `label` | Display name shown on the tab button |
| `dir` | Subdirectory inside `scriptsDir` (`""` = root) |
| `layout` | `"cards"` — filterable grid · `"grouped"` — rows grouped by `# role:` |

### Adding a new tab

1. Add an entry to `tabs` in `config.json`
2. Create the corresponding subdirectory under `scripts/`
3. Add `.txt` files
4. Restart `launcher.mjs`

No code changes required.

---

## Layouts

**`cards`** — a filterable grid. Good for stories, scripts, or anything browsed by topic.

**`grouped`** — horizontal rows grouped by `# role:` header. Good for CV bullets organised by job/role.

---

## Running on Login (optional)

Create a launchd plist at `~/Library/LaunchAgents/com.yourname.notchlauncher.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.yourname.notchlauncher</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/path/to/notch-launcher/launcher.mjs</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/com.yourname.notchlauncher.plist`

---

## Project Structure

```
notch-launcher/
├── launcher.mjs          # HTTP server + UI (the tool)
├── config.json           # Your configuration
├── config.example.json   # Reference copy — never modify
├── scripts/              # Your personal scripts (gitignored)
│   ├── 00-my-story.txt
│   └── cv/
│       └── 01-my-cv-bullet.txt
├── examples/             # Sample files showing the format
│   ├── 00-sample-story.txt
│   └── cv/
│       └── 00-sample-cv-bullet.txt
└── README.md
```

`scripts/` is gitignored so your personal content never gets committed. To share the tool without sharing your scripts, just push — only `launcher.mjs`, `config.json`, `examples/`, and this README are tracked.

---

## Contributing

PRs welcome for `launcher.mjs`, `examples/`, and `README.md`.  
`scripts/` is gitignored intentionally — please don't commit personal scripts.
