# IDE Projects

Search and open recent projects from multiple IDEs.

## Supported IDEs

- VS Code
- Cursor
- Windsurf
- Trae / Trae CN
- Antigravity
- Zed

## Usage

In Spotlight, type `| ` (pipe + space) followed by your search query.

Supports local projects and WSL/remote projects (VS Code forks).

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Spotlight Prefix | Prefix to trigger this mode | `\|` |
| Default IDE | Preferred IDE for opening projects | VS Code |
| Show WSL/Remote Projects | Include WSL and remote projects in results | On |

## How It Works

The plugin reads recent project history from each IDE's local database:
- **VS Code forks**: Reads `state.vscdb` SQLite database in the IDE's config directory
- **Zed**: Reads `db.sqlite` in Zed's data directory

Project icons are extracted from the system application list.
