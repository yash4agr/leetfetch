import { App, TFile, Notice } from 'obsidian';
import { LeetCodeProblem } from './leetcode';
import { BaseManager } from './bases';

// Default template for individual problem notes
const DEFAULT_NOTE_TEMPLATE = `# {{title}}

## Problem Statement

[View on LeetCode]({{url}})

**Difficulty:** {{difficulty}}
**Topics:** {{topics}}

## Solution

\`\`\`{{language}}
// Add your solution here
\`\`\`

## Approach

## Time & Space Complexity

- **Time:** O(?)
- **Space:** O(?)

## Notes

`;

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * Handles writing LeetCode problems to individual notes and managing Base integration
 */
export class ProblemLogWriter {
    private app: App;
    private settings: any;
    private plugin: any;
    private processedProblems: Set<string> = new Set();
    private noteTemplate: string = DEFAULT_NOTE_TEMPLATE;
    private baseManager: BaseManager;

    constructor(app: App, settings: any, plugin: any) {
        this.app = app;
        this.settings = settings;
        this.plugin = plugin;
        this.baseManager = new BaseManager(app, settings);
        this.loadProcessedProblems();
        this.loadNoteTemplate();

    }

    updateSettings(settings: any): void {
        this.settings = settings;
        this.baseManager.updateSettings(settings);
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

    /**
     * Main method for updating problems in Bases format
     */
    async updateProblemBase(problems: LeetCodeProblem[]): Promise<LeetCodeProblem[]> {
        // Get existing problem IDs to avoid duplicates
        const existingProblemIds = await this.baseManager.getExistingProblemIds();

        // Filter out already processed problems
        const newProblems = problems.filter(p =>
            !existingProblemIds.has(p.id) &&
            !this.processedProblems.has(p.titleSlug)
        );

        if (newProblems.length === 0) {
            return [];
        }

        // Process new problems
        if (this.settings.useBasesFormat) {
            await this.updateBasesFormat(newProblems);
        } else {
            new Notice("Please enable Bases format in plugin settings to use this feature.");
            return [];
        }

        // Mark as processed
        newProblems.forEach(p => this.processedProblems.add(p.titleSlug));
        this.saveProcessedProblems();

        return newProblems;
    }

    private async updateBasesFormat(newProblems: LeetCodeProblem[]): Promise<void> {
        try {
            // Ensure base file exists and is up to date
            await this.baseManager.createOrUpdateBase();

            // Create individual problem notes with standardized frontmatter
            await this.createIndividualNotes(newProblems);

            // Update problems in the base (ensures frontmatter is standardized)
            await this.baseManager.batchUpdateProblems(newProblems);

            new Notice(`Added ${newProblems.length} new problems to your LeetCode base!`);
        } catch (error) {
            console.error("Error updating Bases format:", error);
            new Notice(`Error updating problems: ${error.message}`);
            throw error;
        }
    }

    /**
     * Creates individual note files for problems
     */
    async createIndividualNotes(problems: LeetCodeProblem[]): Promise<void> {
        if (!this.settings.createIndividualNotes) {
            return;
        }

        const notesDir = this.settings.individualNotesPath;
        await this.ensureDirectory(notesDir);

        for (const problem of problems) {
            await this.createProblemNote(problem);
        }
    }

    async createProblemNote(problem: LeetCodeProblem): Promise<void> {
        const fileName = this.sanitizeFileName(problem.title);
        const filePath = normalizePath(`${this.settings.individualNotesPath}/${fileName}.md`);

        // Check if file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile) {
            return;
        }

        const content = this.generateNoteContent(problem);
        await this.app.vault.create(filePath, content);

        // Create topic backlinks if enabled
        if (this.settings.topicTagsEnabled && this.settings.topicBacklinkEnabled) {
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

        // Generate frontmatter for Bases integration
        const frontmatter = this.generateProblemFrontmatter(problem);

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

        // Add frontmatter for Bases integration
        if (this.settings.useBasesFormat) {
            content = `${frontmatter}\n\n${content}`;
        }

        return content;
    }

    private generateProblemFrontmatter(problem: LeetCodeProblem): string {
        const date = problem.timestamp ?
            new Date(problem.timestamp * 1000).toISOString().split('T')[0] :
            null;

        return `---
problem_id: ${problem.id}
title: "${problem.title}"
difficulty: "${problem.difficulty}"
topics:
${problem.topics.map(t => `  - "${t}"`).join('\n')}
status: "${problem.status}"${date ? `\ndate_solved: "${date}"` : ''}
url: "${problem.url}"
language: "${problem.language || 'python'}"${problem.submissionDetails?.runtime ? `\nruntime: "${problem.submissionDetails.runtime}"` : ''}${problem.submissionDetails?.memory ? `\nmemory: "${problem.submissionDetails.memory}"` : ''}
notes_link: "[[${this.sanitizeFileName(problem.title)}]]"
---`;
    }

    private async createTopicBacklinks(problem: LeetCodeProblem): Promise<void> {
        const topicsDir = this.settings.topicNotesPath;
        await this.ensureDirectory(topicsDir);

        for (const topic of problem.topics) {
            const topicFile = normalizePath(`${topicsDir}/${topic}.md`);
            const fileName = this.sanitizeFileName(problem.title);
            const backlink = `- [[${this.settings.individualNotesPath}/${fileName}]] - ${problem.difficulty} - ${problem.status}`;

            await this.addToTopicFile(topicFile, topic, backlink);
        }
    }

    private async addToTopicFile(filePath: string, topic: string, backlink: string): Promise<void> {
        let abstractFile = this.app.vault.getAbstractFileByPath(filePath);
        let file: TFile;

        if (!(abstractFile instanceof TFile)) {
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
            file = abstractFile;
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

    /**
     * Validates the integrity of the Base and individual notes
     */
    async validateBaseIntegrity(): Promise<void> {
        try {
            const validation = await this.baseManager.validateBaseIntegrity();

            if (validation.valid) {
                new Notice("Base integrity validation passed!");
            } else {
                new Notice(`Base validation found ${validation.issues.length} issues. Check console for details.`);
                console.warn("Base integrity validation issues:", validation.issues);
            }
        } catch (error) {
            console.error("Error validating base integrity:", error);
            new Notice(`Error validating base: ${error.message}`);
        }
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        const normalizedPath = normalizePath(dirPath);
        const folder = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (!folder) {
            await this.app.vault.createFolder(normalizedPath);
        }
    }

    // Utility methods
    private async loadProcessedProblems(): Promise<void> {
        try {
            const data = await this.plugin.loadData();
            if (data?.processedProblems) {
                this.processedProblems = new Set(data.processedProblems);
            }

            // Clear processed problems if the folder doesn't exist
            const folder = this.app.vault.getAbstractFileByPath(this.settings.individualNotesPath);
            if (!folder) {
                this.processedProblems.clear();
                await this.saveProcessedProblems();
            }
        } catch (e) {
            console.error('Failed to load processed problems:', e);
            this.processedProblems.clear();
        }
    }

    private async saveProcessedProblems(): Promise<void> {
        try {
            const existingData = await this.plugin.loadData() || {};
            existingData.processedProblems = Array.from(this.processedProblems);
            await this.plugin.saveData(existingData);
        } catch (e) {
            console.error('Failed to save processed problems:', e);
        }
    }

    /**
     * Generate statistics report based on solved problems
     */
    async generateStatsReport(): Promise<string> {
        try {
            // Get existing problem IDs to calculate stats
            const existingIds = await this.baseManager.getExistingProblemIds();

            return `# LeetCode Progress Report

*Generated: ${new Date().toISOString().split('T')[0]}*

## Overview
- **Total Problems Solved:** ${existingIds.size}
- **Base File Path:** ${this.settings.baseFilePath}
- **Individual Notes Path:** ${this.settings.individualNotesPath}

---
*Generated by LeetFetch Plugin*`;
        } catch (error) {
            console.error("Error generating stats report:", error);
            return `# LeetCode Progress Report

*Generated: ${new Date().toISOString().split('T')[0]}*

## Error
Could not generate detailed statistics: ${error.message}

Please check your plugin configuration and try again.`;
        }
    }

    clearProcessedProblems(): void {
        this.processedProblems.clear();
        this.saveProcessedProblems();
    }
}
