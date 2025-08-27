# LeetFetch - LeetCode + Obsidian Integration

Transform your LeetCode journey into a comprehensive knowledge base with smart note-taking, automatic syncing, and intelligent backlinking.

## Features

### **Automatic Sync**
- Fetch your recently solved LeetCode problems
- Continuous updates to your Problem Log
- Auto-sync at configurable intervals
- Duplicate detection and prevention

### **Smart Note Generation**
- Auto-create individual notes for each problem
- Customizable note templates
- Include problem description, difficulty, and topics
- Link to original LeetCode problem

### **Intelligent Backlinking**
- Automatic topic tags like `[[Arrays]]`, `[[Dynamic Programming]]`
- Create topic-based note networks
- Cross-reference related problems
- Build your DSA knowledge graph

### **Progress Tracking**
- Beautiful problem log table in markdown
- Difficulty-based categorization
- Streak tracking and statistics
- Export to CSV for external analysis

### **Customization**
- Configurable file paths and templates
- Topic tag preferences
- Auto-sync settings
- Session token support for private data

## 🛠️ Installation

### Method 1: Manual Installation (Recommended)

1. **Download the Plugin Files**
   - Download `main.js`, `manifest.json`, and `styles.css`
   - Place them in your vault's `.obsidian/plugins/leetfetch/` directory

2. **Enable the Plugin**
   - Open Obsidian Settings → Community Plugins
   - Enable "LeetFetch"

### Method 2: Development Setup

```bash
# Clone the repository
git clone https://github.com/your-username/leetfetch-obsidian.git
cd leetfetch-obsidian

# Install dependencies
npm install

# Build the plugin
npm run build

# Link to your vault (replace with your vault path)
ln -s $(pwd) /path/to/your/vault/.obsidian/plugins/leetfetch
```

## 🚀 Quick Start

### 1. **Configure Settings**
- Go to Settings → Community Plugins → LeetFetch
- Enter your LeetCode username
- Set your preferred file paths
- Configure note templates

### 2. **First Sync**
- Click the LeetFetch ribbon icon (download symbol)
- Or use Command Palette: "Sync LeetCode Problems"
- Watch as your problems populate the log!

### 3. **Customize Your Workflow**
- Edit the note template to match your style
- Enable/disable topic tags
- Set up auto-sync intervals

## 📋 Configuration Options

### **Basic Settings**
- **Username**: Your LeetCode username
- **Problem Log Path**: Where to store your main problem log (default: `DSA/Problem Log.md`)
- **Create Individual Notes**: Generate separate files for each problem
- **Session Token**: Optional - for accessing private submissions

### **Advanced Settings**
- **Auto Sync**: Enable automatic syncing
- **Sync Interval**: How often to sync (in minutes)
- **Topic Tags**: Enable `[[tag]]` style linking
- **Note Template**: Customize the format of generated notes

## 📝 Default Note Template

```markdown
# {{title}}

**Difficulty:** {{difficulty}}  
**Topics:** {{topics}}  
**Link:** [LeetCode]({{url}})  
**Date Solved:** {{date}}

## Problem Description
{{description}}

## My Solution
```{{language}}
// Your solution here
``

## Notes
- 

## Related Problems
- 

## Tags
{{tags}}
```

## Commands

- **Sync LeetCode Problems**: Fetch and update your problem log
- **Create Problem Note from Current Line**: Generate a detailed note for the problem on the current line
- **Generate Stats Report**: Create a comprehensive progress report

## 📊 Sample Output

### Problem Log
```markdown
# 📒 DSA Problem Log

| Date       | Problem                               | Topics          | Difficulty | Status | Notes |
|------------|---------------------------------------|-----------------|------------|--------|-------|
| 2025-07-13 | [Two Sum](https://leetcode.com/...)   | [[Arrays]]      | Easy       | ✅     | Hash map approach |
| 2025-07-13 | [Longest Substring](https://...)      | [[Sliding Window]] | Medium   | ✅     | Sliding window |
| 2025-07-14 | [Merge Intervals](https://...)        | [[Intervals]]   | Medium     | ✅     | Sort first |
```

### Topic Pages
Each topic gets its own page with backlinks:

```markdown
# Arrays

## Problems
- [[two-sum]] - Easy
- [[three-sum]] - Medium
- [[maximum-subarray]] - Easy

## Notes
- Common patterns: two pointers, sliding window
- Time complexity considerations

## Patterns
- Hash maps for O(1) lookups
- Two pointers for sorted arrays

## Related Topics
- [[Hash Tables]]
- [[Two Pointers]]
```

## 🎯 Advanced Usage

### **Custom Templates**
You can use these variables in your note templates:
- `{{title}}` - Problem title
- `{{difficulty}}` - Easy/Medium/Hard
- `{{topics}}` - Comma-separated topics
- `{{url}}` - LeetCode problem URL
- `{{date}}` - Date solved
- `{{description}}` - Problem description
- `{{tags}}` - Topic tags for backlinking

### **Batch Processing**
- Run sync to process multiple problems at once
- Automatic deduplication prevents duplicates
- Progress tracking shows what's new

### **Integration with Other Plugins**
- Works great with **Dataview** for dynamic queries
- **Graph View** shows your knowledge connections
- **Calendar** integration for tracking daily progress

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. **Report Issues**: Found a bug? Open an issue
2. **Suggest Features**: Have an idea? We'd love to hear it
3. **Submit PRs**: Code contributions are always welcome

### Development Setup
```bash
# Fork and clone
git clone https://github.com/your-username/leetfetch-obsidian.git
cd leetfetch-obsidian

# Install dependencies
npm install

# Start development
npm run dev

# Build for production
npm run build
```

## 📚 FAQ

**Q: Do I need a LeetCode Premium account?**
A: No! The plugin works with free LeetCode accounts. Premium features may require a session token.

**Q: How often should I sync?**
A: It depends on your solving frequency. Daily active users might sync every hour, while occasional users might sync manually.

**Q: Can I customize the problem log format?**
A: Yes! Edit the table format in the writer.ts file or request this as a configurable feature.

**Q: Does this work with other coding platforms?**
A: Currently LeetCode only, but we're planning support for HackerRank, Codeforces, and others.

**Q: Is my data secure?**
A: Yes! All data is stored locally in your vault. Session tokens are only used for API calls.

## 🛣️ Roadmap

- [ ] **Multi-platform Support**: HackerRank, Codeforces, AtCoder
- [ ] **Enhanced Analytics**: Detailed progress tracking and insights
- [ ] **Template Library**: Pre-made templates for different use cases
- [ ] **Contest Integration**: Track contest participation and rankings
- [ ] **Collaboration Features**: Share progress with study groups
- [ ] **Mobile Optimization**: Better mobile experience
- [ ] **AI Integration**: Smart problem recommendations

## 📄 License

MIT License - feel free to use, modify, and distribute!

## 🙏 Acknowledgments

- Thanks to the Obsidian community for their amazing plugin ecosystem
- LeetCode for providing the platform that makes this possible
- All contributors and users who help improve LeetFetch

---

**Happy coding! 🎉**

*If you find LeetFetch useful, please consider starring the repository and sharing it with your coding friends!*