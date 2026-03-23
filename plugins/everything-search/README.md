# Everything Search

Search files globally using [Everything](https://www.voidtools.com/) by voidtools.

## Prerequisites

- [Everything](https://www.voidtools.com/) must be installed and running

The plugin bundles `Everything64.dll` (SDK). If auto-detection fails, you can set the DLL path manually in settings.

## Usage

In Spotlight, type `f ` (f + space) followed by your search query.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Open file/folder |
| Ctrl+Enter | Show in Explorer |
| Shift+Enter | Copy path to clipboard |

Each result also has clickable action buttons for "Show in Explorer" and "Copy Path".

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Spotlight Prefix | Prefix to trigger this mode | `f` |
| Max Results | Maximum number of search results | 20 |
| Everything64.dll Path | Custom path to DLL (leave empty for auto-detect) | Auto |

## DLL Auto-Detection

The plugin searches for `Everything64.dll` in this order:

1. User-configured custom path (settings)
2. Plugin's own `backend/` directory (bundled)
3. Running Everything.exe process directory
4. Common install paths on all drive letters
5. Windows registry
6. System PATH

## File Type Icons

Results display context-appropriate icons for images, videos, audio, documents, code files, archives, and executables.
