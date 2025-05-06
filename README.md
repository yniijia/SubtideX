# SubtideX - YouTube Subtitle Extractor

<div align="center">
  <img src="icons/icon128.png" alt="SubtideX Logo" width="128" height="128">
  <h3>Extract YouTube subtitles with one click</h3>
</div>

## 🌊 Overview

SubtideX is a Chrome extension that lets you extract subtitles from YouTube videos and download them as CSV files. Perfect for researchers, content creators, language learners, or anyone who needs to analyze video transcripts.

### ✨ Key Features

- 🎯 **One-Click Extraction**: Extract subtitles from any YouTube video with a single click
- 🔄 **Auto-Reload**: Reloads the page before extraction for improved reliability
- 📊 **CSV Download**: Get well-formatted subtitles with timestamps in CSV format
- 📝 **Original Title Preservation**: Downloads use the exact YouTube video title as the filename
- ⚡ **Fast & Lightweight**: Minimal impact on browser performance
- 🔒 **Privacy Focused**: Works locally in your browser with no data sent to external servers
- 🎨 **Modern UI**: Clean, intuitive interface with visual feedback
- 🌐 **Works with most YouTube videos**: Compatible with auto-generated and manual captions

## 📥 Installation

### From Chrome Web Store

1. Visit the [SubtideX page on Chrome Web Store](https://chrome.google.com/webstore/detail/subtidex/extension-id)
2. Click "Add to Chrome"
3. Confirm the installation

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/yniijia/subtidex/releases)
2. Unzip the downloaded file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" by toggling the switch in the top right
5. Click "Load unpacked" and select the unzipped folder
6. The extension is now installed and ready to use

## 🚀 How to Use

1. Navigate to any YouTube video
2. Click the SubtideX icon in your Chrome toolbar
3. Press the "Extract Subtitles" button
4. Choose where to save the CSV file
5. That's it! You now have the video's subtitles in CSV format

## 📊 CSV Format

The downloaded CSV file includes four columns:

- **Start Time**: When the subtitle begins (HH:MM:SS.mmm)
- **End Time**: When the subtitle ends (HH:MM:SS.mmm)
- **Duration**: Length of the subtitle in seconds
- **Text**: The actual subtitle text

Example:
```csv
Start Time,End Time,Duration,Text
00:00:00.000,00:00:04.160,4.16,"Welcome to this tutorial on machine learning"
00:00:04.160,00:00:08.240,4.08,"Today we'll cover the basics of neural networks"
```

## 🛠️ For Developers

### Project Structure

```
subtidex/
├── icons/               # Extension icons
│   ├── icon.svg         # Source SVG icon
│   ├── icon16.png       # 16x16 icon
│   ├── icon48.png       # 48x48 icon
│   └── icon128.png      # 128x128 icon
├── manifest.json        # Extension manifest
├── popup.html           # Popup UI
├── popup.js             # Popup logic
├── content.js           # Content script for YouTube pages
├── background.js        # Background service worker
├── error.html           # Error page
├── build-icons.js       # Script to generate icons from SVG
├── build-zip.js         # Script to package the extension
├── package.json         # Node.js dependencies and scripts
└── LICENSE              # MIT License
```

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yniijia/subtidex.git
   cd subtidex
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the icons (requires Node.js):
   ```bash
   npm run build-icons
   ```

4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project folder

5. Build a package for distribution:
   ```bash
   npm run build
   ```
   This will create a ZIP file in the `dist/` directory.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Created by [Tony Fiston](https://github.com/yniijia)
- Icon design using modern UI principles
- Special thanks to all contributors and users who provided feedback

## 🔄 Limitations

- Works only with YouTube videos that have subtitles/captions
- May not work with some live streams or premium content
- Requires Chrome or Chromium-based browsers (Edge, Brave, etc.)

---

<div align="center">
  <p>If you find this useful, consider <a href="https://github.com/yniijia/subtidex">starring the repo</a> or <a href="https://github.com/yniijia/subtidex/issues">reporting issues</a>.</p>
</div> 