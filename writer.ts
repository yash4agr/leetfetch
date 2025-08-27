import { App, TFile, Notice } from 'obsidian';
import { LeetCodeProblem } from './leetcode';

const DEFAULT_NOTE_TEMPLATE = `# {{title}}

**Difficulty:** {{difficulty}}  
**Topics:** {{topics}}  
**Link:** [LeetCode]({{url}})  
**Date Solved:** {{date}}

## Problem Description
{{description}}

## My Solution
\`\`\`{{language}}
// Your solution here
\`\`\`

## Notes
- 

## Related Problems
- 

## Tags
{{tags}}
`;

export class ProblemLogWriter {
    private app: App;
    private settings: any;
    private processedProblems: Set<string> = new Set();
    private noteTemplate: string = DEFAULT_NOTE_TEMPLATE;

    constructor(app: App, settings: any) {
        this.app = app;
        this.settings = settings;
        this.loadProcessedProblems();
        this.loadNoteTemplate();
    }

    updateSettings(settings: any) {
        this.settings = settings;
        this.loadNoteTemplate();
    }

    private async loadNoteTemplate(): Promise<void> {
        if (!this.settings.noteTemplatePath) {
            this.noteTemplate = DEFAULT_NOTE_TEMPLATE;
            return;
        }

        try {
            const templateFile = this.app.vault.getAbstractFileByPath(this.settings.noteTemplatePath);
            if (templateFile instanceof TFile) {
                this.noteTemplate = await this.app.vault.read(templateFile);
            } else {
                console.warn(`Template file not found: ${this.settings.noteTemplatePath}. Using default template.`);
                this.noteTemplate = DEFAULT_NOTE_TEMPLATE;
            }
        } catch (error) {
            console.error('Failed to load note template:', error);
            this.noteTemplate = DEFAULT_NOTE_TEMPLATE;
        }
    }

    async updateProblemLog(problems: LeetCodeProblem[]): Promise<LeetCodeProblem[]> {
        const logFile = await this.ensureLogFile();
        const existingContent = await this.app.vault.read(logFile);

        // Extract existing problem IDs from the log (improved method)
        const existingProblemIds = this.extractExistingProblemIds(existingContent);
        
        // Filter out already processed problems using both ID and titleSlug
        const newProblems = problems.filter(p => 
            !existingProblemIds.has(p.id) && 
            !this.processedProblems.has(p.titleSlug)
        );

        console.log(`Found ${newProblems.length} new problems to log.`);
        
        if (newProblems.length === 0) {
            return [];
        }

        // Generate new entries
        const newEntries = newProblems.map(problem => this.formatProblemEntry(problem));
        
        // Update the log file (insert at top)
        const updatedContent = this.insertNewEntriesAtTop(existingContent, newEntries);
        await this.app.vault.modify(logFile, updatedContent);
        
        // Mark as processed
        newProblems.forEach(p => this.processedProblems.add(p.titleSlug));
        this.saveProcessedProblems();
        
        return newProblems;
    }

    private extractExistingProblemIds(content: string): Set<number> {
        const existingIds = new Set<number>();
        const lines = content.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('|') && !line.includes('Date') && !line.includes('---')) {
                const cells = line.split('|').map(cell => cell.trim());
                if (cells.length >= 3) {
                    // Try to extract ID from Problem ID column (index 2)
                    const problemIdCell = cells[2];
                    if (problemIdCell && problemIdCell.match(/^\d+$/)) {
                        existingIds.add(parseInt(problemIdCell));
                    }
                    
                    // Also check Problem column (index 3) for embedded ID
                    if (cells.length >= 4) {
                        const problemCell = cells[3];
                        const idMatch = problemCell.match(/<!-- ID: (\d+) -->/);
                        if (idMatch) {
                            existingIds.add(parseInt(idMatch[1]));
                        }
                    }
                }
            }
        }
        
        return existingIds;
    }

    private insertNewEntriesAtTop(existingContent: string, newEntries: string[]): string {
        const lines = existingContent.split('\n');
        const headerEndIndex = lines.findIndex(line => line.includes('|---'));
        
        if (headerEndIndex === -1) {
            // No table found, create new table
            return existingContent + '\n' + this.getLogFileHeader() + '\n' + newEntries.join('\n');
        }
        
        // Insert new entries right after the header separator
        const beforeTable = lines.slice(0, headerEndIndex + 1);
        const existingEntries = lines.slice(headerEndIndex + 1).filter(line => line.trim());
        
        return [
            ...beforeTable,
            ...newEntries,
            ...existingEntries
        ].join('\n');
    }

    private async ensureLogFile(): Promise<TFile> {
        const filePath = this.settings.logFilePath;
        let file = this.app.vault.getAbstractFileByPath(filePath);
        
        if (!file) {
            // Create directory if it doesn't exist
            const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
            if (dirPath) {
                await this.ensureDirectory(dirPath);
            }
            
            // Create the file with header
            const initialContent = this.getLogFileHeader();
            file = await this.app.vault.create(filePath, initialContent);
        }
        
        return file as TFile;
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        const parts = dirPath.split('/');
        let currentPath = '';
        
        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folder = this.app.vault.getAbstractFileByPath(currentPath);
            
            if (!folder) {
                await this.app.vault.createFolder(currentPath);
            }
        }
    }

    private getLogFileHeader(): string {
        return `# DSA Problem Log

*Last updated: ${new Date().toISOString().split('T')[0]}*

| Date | Problem ID | Problem | Topics | Difficulty | Status | Notes | Additional Notes |
|------|------------|---------|---------|------------|---------|-------|------------------|
`;
    }

    private formatProblemEntry(problem: LeetCodeProblem): string {
        const date = new Date(problem.timestamp * 1000).toISOString().split('T')[0];
        const problemLink = `[${problem.title}](${problem.url})<!-- ID: ${problem.id} -->`;
        const topics = this.formatTopics(problem.topics);
        const statusIcon = this.getStatusIcon(problem.status);
        const notesLink = this.settings.createIndividualNotes ? 
            `[[${this.sanitizeFileName(problem.title)}]]` : '';
        const additionalNotes = this.settings.addAdditionalNotes ? '' : '';

        return `| ${date} | ${problem.id} | ${problemLink} | ${topics} | ${problem.difficulty} | ${statusIcon} | ${notesLink} | ${additionalNotes} |`;
    }

    private formatTopics(topics: string[]): string {
        if (!this.settings.topicTagsEnabled) {
            return topics.join(', ');
        }
        
        return topics.map(topic => `[[${topic}]]`).join(', ');
    }

    private getStatusIcon(status: string): string {
        const statusMap: Record<string, string> = {
            'Solved': 'Solved',
            'Attempted': 'Attempted',
            'Todo': 'Todo',
            'Review': 'Review'
        };
        
        return statusMap[status] || 'Unknown';
    }

    private extractDateFromEntry(entry: string): string {
        const cells = entry.split('|').map(cell => cell.trim());
        return cells.length > 1 ? cells[1] : '';
    }

    async createIndividualNotes(problems: LeetCodeProblem[]): Promise<void> {
        const notesDir = this.settings.individualNotesPath;
        await this.ensureDirectory(notesDir);
        
        for (const problem of problems) {
            await this.createProblemNote(problem);
        }
    }

    async createProblemNote(problem: LeetCodeProblem): Promise<void> {
        const fileName = this.sanitizeFileName(problem.title);
        const filePath = `${this.settings.individualNotesPath}/${fileName}.md`;
        
        // Check if file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile) {
            new Notice(`Note for ${problem.title} already exists`);
            return;
        }
        
        const content = this.generateNoteContent(problem);
        await this.app.vault.create(filePath, content);
        
        // Create backlinks if enabled
        if (this.settings.topicTagsEnabled) {
            await this.createTopicBacklinks(problem);
        }
    }

    private sanitizeFileName(title: string): string {
        return title
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .toLowerCase();
    }

    private generateNoteContent(problem: LeetCodeProblem): string {
        const date = new Date(problem.timestamp * 1000).toISOString().split('T')[0];
        const topics = problem.topics.join(', ');
        const tags = this.settings.topicTagsEnabled ? 
            (this.settings.topicBacklinkEnabled ? 
                problem.topics.map(t => `[[${this.settings.topicNotesPath}/${t}]]`).join(' ') :
                problem.topics.map(t => `[[${t}]]`).join(' ')) : 
            problem.topics.join(', ');
        
        let content = this.noteTemplate
            .replace(/\{\{title\}\}/g, problem.title)
            .replace(/\{\{difficulty\}\}/g, problem.difficulty)
            .replace(/\{\{topics\}\}/g, topics)
            .replace(/\{\{url\}\}/g, problem.url)
            .replace(/\{\{date\}\}/g, date)
            .replace(/\{\{description\}\}/g, problem.description || 'No description available')
            .replace(/\{\{tags\}\}/g, tags)
            .replace(/\{\{language\}\}/g, problem.language || 'python')
            .replace(/\{\{id\}\}/g, problem.id.toString())
            .replace(/\{\{status\}\}/g, problem.status);

        // Add submission details if available
        if (problem.submissionDetails) {
            content = content
                .replace(/\{\{runtime\}\}/g, problem.submissionDetails.runtime || '')
                .replace(/\{\{memory\}\}/g, problem.submissionDetails.memory || '')
                .replace(/\{\{code\}\}/g, problem.submissionDetails.code || '')
                .replace(/\{\{runtimePercentile\}\}/g, problem.submissionDetails.runtimePercentile?.toString() || '')
                .replace(/\{\{memoryPercentile\}\}/g, problem.submissionDetails.memoryPercentile?.toString() || '');
        }

        // Add additional notes section if enabled
        if (this.settings.addAdditionalNotes) {
            content += `\n\n## Additional Notes\n- \n\n## Review Status\n- [ ] Need to review\n- [ ] Understood\n- [ ] Mastered`;
        }

        return content;
    }

    private async createTopicBacklinks(problem: LeetCodeProblem): Promise<void> {
        const topicsDir = this.settings.topicNotesPath;
        await this.ensureDirectory(topicsDir);
        
        for (const topic of problem.topics) {
            const topicFile = `${topicsDir}/${topic}.md`;
            const fileName = this.sanitizeFileName(problem.title);
            const backlink = `- [[${this.settings.individualNotesPath}/${fileName}]] - ${problem.difficulty} - ${problem.status}`;
            
            await this.addToTopicFile(topicFile, topic, backlink);
        }
    }

    private async addToTopicFile(filePath: string, topic: string, backlink: string): Promise<void> {
        let file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
        
        if (!file) {
            const initialContent = `# ${topic}

## Problems
${backlink}

## Notes
- 

## Patterns
- 

## Related Topics
- 
`;
            file = await this.app.vault.create(filePath, initialContent);
        } else {
            const content = await this.app.vault.read(file);
            
            // Check if backlink already exists
            if (content.includes(backlink)) {
                return;
            }
            
            // Add backlink under Problems section
            const lines = content.split('\n');
            const problemsIndex = lines.findIndex(line => line.includes('## Problems'));
            
            if (problemsIndex !== -1) {
                lines.splice(problemsIndex + 1, 0, backlink);
                await this.app.vault.modify(file, lines.join('\n'));
            } else {
                // Append to end
                await this.app.vault.modify(file, content + '\n' + backlink);
            }
        }
    }

    async generateStatsReport(): Promise<string> {
        const logFile = await this.ensureLogFile();
        const content = await this.app.vault.read(logFile);
        
        const stats = this.analyzeLogContent(content);
        
        return `# Problem Solving Stats

*Generated: ${new Date().toISOString().split('T')[0]}*

## Overview
- **Total Problems Solved:** ${stats.totalSolved}
- **Total Problems Attempted:** ${stats.totalAttempted}
- **Current Streak:** ${stats.currentStreak} days
- **Best Streak:** ${stats.bestStreak} days

## By Difficulty
- **Easy:** ${stats.byDifficulty.Easy || 0} (${Math.round((stats.byDifficulty.Easy || 0) / stats.totalSolved * 100)}%)
- **Medium:** ${stats.byDifficulty.Medium || 0} (${Math.round((stats.byDifficulty.Medium || 0) / stats.totalSolved * 100)}%)
- **Hard:** ${stats.byDifficulty.Hard || 0} (${Math.round((stats.byDifficulty.Hard || 0) / stats.totalSolved * 100)}%)

## Top Topics
${Object.entries(stats.byTopic)
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 10)
    .map(([topic, count]) => `- **${topic}:** ${count}`)
    .join('\n')}

## Recent Activity
${stats.recentActivity.map((activity: string) => `- ${activity}`).join('\n')}
`;
    }

    private analyzeLogContent(content: string): any {
        const lines = content.split('\n').filter(line => line.startsWith('|') && !line.includes('Date') && !line.includes('---'));
        
        const stats = {
            totalSolved: 0,
            totalAttempted: 0,
            currentStreak: 0,
            bestStreak: 0,
            byDifficulty: {} as Record<string, number>,
            byTopic: {} as Record<string, number>,
            recentActivity: [] as string[]
        };
        
        const dates: string[] = [];
        
        for (const line of lines) {
            const cells = line.split('|').map(cell => cell.trim());
            if (cells.length < 6) continue;
            
            const date = cells[1];
            const problem = cells[3];
            const topics = cells[4];
            const difficulty = cells[5];
            const status = cells[6];
            
            if (status.includes('Solved')) {
                stats.totalSolved++;
                dates.push(date);
                
                // Count by difficulty
                stats.byDifficulty[difficulty] = (stats.byDifficulty[difficulty] || 0) + 1;
                
                // Count by topic
                const topicList = topics.split(',').map(t => t.trim().replace(/\[\[|\]\]/g, '').split('/').pop());
                for (const topic of topicList) {
                    if (topic) {
                        stats.byTopic[topic] = (stats.byTopic[topic] || 0) + 1;
                    }
                }
                
                // Recent activity
                if (stats.recentActivity.length < 5) {
                    stats.recentActivity.push(`${date}: ${problem.replace(/\[|\]/g, '').split('(')[0]}`);
                }
            } else if (status.includes('Attempted')) {
                stats.totalAttempted++;
            }
        }
        
        // Calculate streaks
        const sortedDates = dates.sort().reverse();
        stats.currentStreak = this.calculateCurrentStreak(sortedDates);
        stats.bestStreak = this.calculateBestStreak(sortedDates);
        
        return stats;
    }
    
    private calculateCurrentStreak(dates: string[]): number {
        if (dates.length === 0) return 0;
        
        const today = new Date().toISOString().split('T')[0];
        let streak = 0;
        let currentDate = new Date(today);
        
        for (const dateStr of dates) {
            const date = new Date(dateStr);
            const diffTime = currentDate.getTime() - date.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === streak) {
                streak++;
                currentDate = new Date(date);
            } else {
                break;
            }
        }
        
        return streak;
    }
    
    private calculateBestStreak(dates: string[]): number {
        if (dates.length === 0) return 0;
        
        let bestStreak = 0;
        let currentStreak = 1;
        
        for (let i = 1; i < dates.length; i++) {
            const prevDate = new Date(dates[i-1]);
            const currentDate = new Date(dates[i]);
            const diffTime = prevDate.getTime() - currentDate.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currentStreak++;
            } else {
                bestStreak = Math.max(bestStreak, currentStreak);
                currentStreak = 1;
            }
        }
        
        return Math.max(bestStreak, currentStreak);
    }

    private loadProcessedProblems(): void {
        const data = localStorage.getItem('leetfetch-processed-problems');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.processedProblems = new Set(parsed);
            } catch (e) {
                console.error('Failed to load processed problems:', e);
            }
        }
    }

    private saveProcessedProblems(): void {
        try {
            const data = JSON.stringify(Array.from(this.processedProblems));
            localStorage.setItem('leetfetch-processed-problems', data);
        } catch (e) {
            console.error('Failed to save processed problems:', e);
        }
    }

    async exportToCSV(): Promise<string> {
        const logFile = await this.ensureLogFile();
        const content = await this.app.vault.read(logFile);
        const lines = content.split('\n').filter(line => line.startsWith('|') && !line.includes('Date') && !line.includes('---'));
        
        let csv = 'Date,Problem ID,Problem,Topics,Difficulty,Status,Notes,Additional Notes\n';
        
        for (const line of lines) {
            const cells = line.split('|').map(cell => cell.trim());
            if (cells.length >= 8) {
                const row = cells.slice(1, 9).map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
                csv += row + '\n';
            }
        }
        
        return csv;
    }
}