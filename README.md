# LeetFetch

> Transform your LeetCode journey into a structured knowledge base with automatic syncing and intelligent organization.

LeetFetch automatically syncs your solved LeetCode problems into Obsidian, creating individual notes and building a comprehensive DSA knowledge base with backlinking and topic organization.

## Features

### Core Functionality
- **Automatic Problem Sync**: Fetch your recently solved problems or complete submission history
- **Individual Problem Notes**: Generate detailed notes for each problem with customizable templates
- **Obsidian Bases Integration**: Store problems in structured database format with multiple views
- **Smart Topic Organization**: Automatic topic tags and cross-referenced knowledge graphs

### Data Management
- **Duplicate Prevention**: Intelligent filtering to avoid re-importing existing problems
- **Customizable Paths**: Configure where your problems, topics, and templates are stored
- **Batch Processing**: Efficient handling of large problem sets

### Productivity Features
- **Auto-sync Scheduling**: Configurable automatic syncing at set intervals
- **Topic Backlinking**: Automatic `[[Topic]]` links for building connected notes
- **Progress Tracking**: Overview of solving patterns and difficulty progression
- **Template System**: Fully customizable note templates for different workflows

## Installation

### Prerequisites
- Obsidian v1.9.10 or higher
- A LeetCode account

### Manual Installation
1. Download the latest release files (`main.js`, `manifest.json`, `styles.css`)
2. Create a folder: `VaultName/.obsidian/plugins/leetfetch/`
3. Copy the files into this folder
4. Restart Obsidian
5. Enable "LeetFetch" in Settings → Community Plugins

### Development Installation
```bash
git clone https://github.com/yash4agr/leetfetch.git
cd leetfetch
npm install
npm run build

# Link to your vault
ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/leetfetch
```

## Quick Start

### 1. Basic Configuration
1. Open Obsidian Settings → Community Plugins → LeetFetch
2. Enter your LeetCode username
3. Configure file paths (defaults work for most users)
4. Choose your preferred storage format

### 2. Authentication (Optional)
For private submissions and enhanced features:
- **Session Token**: Copy from browser cookies (`LEETCODE_SESSION`)
- **CSRF Token**: Copy from browser cookies (`csrftoken`)

**Security Note**: Tokens are stored locally in your vault and only used for LeetCode API access. See [Security](#security) section for details.

### 3. First Sync
- Click the LeetFetch ribbon icon, or
- Use Command Palette: "Sync LeetCode Problems"
- For complete history: "Sync All LeetCode Problems"

## Configuration

### File Paths
- **Base File**: `DSA/leetcode-problems.base` - Main structured database
- **Individual Notes**: `DSA/Problems/` - Individual problem notes
- **Topic Notes**: `DSA/Topics/` - Topic-based organization
- **Templates**: Optional custom note template path

### Sync Options
- **Auto Sync**: Enable automatic syncing at configurable intervals
- **Fetch All on Empty**: Import complete history when starting fresh
- **Recent Submissions Limit**: Number of recent problems to fetch (1-100)

### Customization
- **Topic Tags**: Enable `[[Arrays]]`, `[[Dynamic Programming]]` style linking
- **Topic Backlinks**: Create dedicated topic pages with problem lists
- **Individual Notes**: Toggle creation of separate files per problem
- **Custom Templates**: Use your own note template format

## Usage

### Syncing Problems
- **Recent Sync**: Fetches problems solved since last sync
- **Full Sync**: Imports your entire submission history
- **Auto Sync**: Runs automatically based on your interval setting

### Working with Data
- **Base View**: Browse problems in structured table format
- **Individual Notes**: Detailed problem breakdowns with solution space
- **Topic Pages**: See all problems by category (Arrays, DP, etc.)
- **Graph View**: Visualize connections between topics and problems

### Commands
- `Sync LeetCode Problems` - Fetch recent submissions
- `Sync All LeetCode Problems` - Import complete history
- `Create Problem Note from Current Line` - Generate note from problem link
- `Initialize Obsidian Bases Format` - Set up structured database
- `Validate Bases Data Integrity` - Check data consistency

## Templates

### Default Note Template
```markdown
# {{title}}

[View on LeetCode]({{url}})

**Difficulty:** {{difficulty}}  
**Topics:** {{topics}}  
**Date Solved:** {{date}}

## Solution

```{{language}}
// Your solution here```

## Approach

## Complexity Analysis
- **Time**: O(?)
- **Space**: O(?)

## Notes

{{tags}}
```

### Template Variables
- `{{title}}` - Problem title
- `{{difficulty}}` - Easy/Medium/Hard
- `{{topics}}` - Comma-separated topic list
- `{{url}}` - LeetCode problem URL
- `{{date}}` - Date solved
- `{{language}}` - Programming language used
- `{{tags}}` - Topic tags for backlinking
- `{{id}}` - Problem ID number
- `{{status}}` - Solved/Attempted/Todo

## Security

### Data Storage
- **Local Only**: All data stored in your Obsidian vault
- **No External Servers**: Tokens only used for direct LeetCode API calls
- **Plain Text Storage**: Authentication tokens stored unencrypted in plugin settings

### Token Security
- Use tokens only on trusted devices
- Create separate tokens for Obsidian vs browser use
- Regenerate tokens periodically
- Consider excluding plugin settings from cloud sync

### Recommendations
- Minimize token permissions to required scope only
- Monitor token usage in LeetCode account settings
- Remove tokens when uninstalling plugin

## Troubleshooting

### Common Issues

**"User not found" error**
- Verify your username is correct
- Check that your LeetCode profile is public

**"Authentication failed"**
- Ensure session token is current and valid
- Try regenerating CSRF token
- Check token format (no extra spaces/characters)

**"No new problems found"**
- Plugin filters out already imported problems
- Use "Sync All Problems" for complete refresh
- Check that you have recent AC submissions

**Sync hanging or timing out**
- Large submission histories may take time
- Check internet connection stability
- Try reducing recent submissions limit

### Advanced Troubleshooting
1. Check browser console in Developer Tools for detailed error messages
2. Use "Test Connection" in plugin settings to verify API access
3. Try "Clear All Cache" command to reset processed problems tracking
4. Check file permissions in your vault directory

## Limitations

- Requires internet connection for syncing
- LeetCode API rate limits may affect large imports
- Session tokens expire and need periodic renewal
- Mobile sync may be limited by token access methods

## Contributing

Contributions welcome! See areas where help is needed:
- Additional programming language templates
- Integration with other coding platforms
- Enhanced statistics and analytics
- Mobile app token extraction guides

### Development Setup
```bash
git clone https://github.com/yash4agr/leetfetch.git
cd leetfetch
npm install
npm run build
```

## Roadmap

**Planned Features**:
- Support for additional platforms (HackerRank, Codeforces)
- Enhanced analytics and progress visualization  

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: Report bugs on [GitHub Issues](https://github.com/yash4agr/leetfetch/issues)
- **Discussions**: Share ideas in [GitHub Discussions](https://github.com/yash4agr/leetfetch/discussions)
- **Documentation**: Check the [Wiki](https://github.com/yash4agr/leetfetch/wiki) for detailed guides

---

If you find LeetFetch helpful, please consider starring the repository and sharing with fellow developers!