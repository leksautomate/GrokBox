# GrokBox

Download AI-generated videos from Grok with one click.

## Features

- **Auto-detect videos** - Automatically finds video elements on Grok pages
- **Hover selection** - Checkbox overlays appear when hovering over videos
- **Batch download** - Download multiple videos at once (1.mp4, 2.mp4, 3.mp4...)
- **Side panel UI** - Manage all detected videos from a convenient side panel
- **Date filtering** - Filter videos by Today, Week, Month, or custom date range
- **Download tracking** - Keep track of already downloaded videos
- **Selection sync** - Selections sync between the page and side panel

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `grok` folder

## Usage

### Quick Start

1. Go to [grok.com](https://grok.com) or [x.com/i/grok](https://x.com/i/grok)
2. Click the GrokBox icon to open the side panel
3. Hover over videos to see selection checkboxes
4. Select videos and click **Download**

### Side Panel

| Feature | Description |
|---------|-------------|
| Start at | Set starting number for files (1.mp4, 2.mp4...) |
| Date filters | Filter by Today, Week, Month, or All |
| Hide downloaded | Toggle to hide already downloaded videos |
| Select all | Quickly select all visible videos |

### On-Page Controls

- Hover over any video to reveal a checkbox
- Click checkbox to select/deselect
- Floating badge shows selected videos
- **Clear** to deselect all
- **Download All** to download directly

## File Structure

```
grok/
├── manifest.json      # Extension manifest (MV3)
├── background.js      # Service worker
├── content.js         # Video detection
├── content.css        # On-page styles
├── sidepanel.html     # Side panel layout
├── sidepanel.js       # Side panel logic
├── icons/
│   ├── icon16.svg
│   ├── icon48.svg
│   └── icon128.svg
└── README.md
```

## Permissions

| Permission | Purpose |
|------------|---------|
| storage | Save download history |
| downloads | Download video files |
| activeTab | Access current tab |
| sidePanel | Display side panel |
| host_permissions | Access grok.com and x.com |

## Troubleshooting

**Videos not appearing?**
- Refresh the page and wait a few seconds
- Make sure you're on grok.com or x.com/i/grok
- Check that videos are loaded on the page

**Downloads not working?**
- Check Chrome download settings
- Ensure extension has permissions
- Try downloading fewer videos at once

**Selection not syncing?**
- Close and reopen the side panel
- Refresh the page

## License

MIT License

---

**GrokBox** - Your videos, one click away.
