# LeetFetch

> Transform your LeetCode journey into a structured knowledge base with automatic syncing and intelligent organization.

LeetFetch automatically syncs your solved LeetCode problems into Obsidian, creating individual notes and building a comprehensive DSA knowledge base with backlinking and topic organization.

## Features

- **Automatic sync**: Fetch recent or complete submission history
- **Individual notes**: Customizable templates for each problem
- **Topic organization**: Automatic `[[Topic]]` links and dedicated topic pages
- **Obsidian Bases**: Structured database format with multiple views
- **Smart filtering**: Prevents duplicate imports

## Installation

### Requirements
- Obsidian v1.9.10+
- LeetCode account

### Steps
1. Download `main.js`, `manifest.json`, `styles.css` from releases
2. Create folder: `YourVault/.obsidian/plugins/leetfetch/`
3. Copy files into the folder
4. Restart Obsidian and enable the plugin

## Quick start

1. Open Settings > Community Plugins > LeetFetch
2. Enter your LeetCode username
3. Click the ribbon icon or run "Sync LeetCode problems"

### Authentication (optional)

For private submissions, add tokens from browser cookies:
- `LEETCODE_SESSION` (session token)
- `csrftoken` (CSRF token)

Tokens are stored locally and used only for LeetCode API calls.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Base file | `DSA/leetcode-problems.base` | Main database file |
| Individual notes | `DSA/Problems/` | Problem note directory |
| Topic notes | `DSA/Topics/` | Topic page directory |
| Auto sync | Off | Sync at set intervals |
| Recent limit | 20 | Problems per sync (1-100) |

## Commands

- **Sync LeetCode problems**: Fetch recent submissions
- **Sync all LeetCode problems**: Import complete history
- **Create problem note from current line**: Generate note from link
- **Initialize Obsidian Bases format**: Set up database
- **Validate Bases data integrity**: Check consistency
- **Clear all cache**: Reset tracking data

## Template variables

Use these in custom templates:

`{{title}}`, `{{difficulty}}`, `{{topics}}`, `{{url}}`, `{{date}}`, `{{language}}`, `{{tags}}`, `{{id}}`, `{{status}}`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| User not found | Check username and profile visibility |
| Auth failed | Regenerate tokens, check for extra spaces |
| No new problems | Use "Sync all" or clear cache |
| Sync timeout | Reduce recent submissions limit |

## Contributing

```bash
git clone https://github.com/yash4agr/leetfetch.git
cd leetfetch
npm install
npm run build
```

## License

MIT License. See LICENSE file.

## Links

- [Issues](https://github.com/yash4agr/leetfetch/issues)
- [Discussions](https://github.com/yash4agr/leetfetch/discussions)