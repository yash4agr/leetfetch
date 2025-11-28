import { App, TFile, TFolder, Notice, stringifyYaml, debounce, normalizePath, EventRef } from 'obsidian';
import { LeetCodeProblem } from './leetcode';

export interface BaseColumnDefinition {
    name: string;
    type: 'text' | 'number' | 'date' | 'boolean' | 'list' | 'link';
    description?: string;
    required?: boolean;
    defaultValue?: any;
}

export interface BaseView {
    name: string;
    type: 'table' | 'cards';
    columns: string[];
    filters?: Record<string, any>;
    sort?: {
        column: string;
        direction: 'asc' | 'desc';
    };
}

export interface BaseConfiguration {
    name: string;
    description: string;
    source: string; // folder path
    columns: BaseColumnDefinition[];
    views: BaseView[];
    defaultView: string;
}

export class BaseManager {
    private app: App;
    private settings: any;
    private updateQueue = new Set<string>();
    private isUpdating = false;
    private baseConfiguration: BaseConfiguration;
    private eventRefs: EventRef[] = [];

    constructor(app: App, settings: any) {
        this.app = app;
        this.settings = settings;
        this.initializeBaseConfiguration();
        this.setupEventListeners();
    }

    private initializeBaseConfiguration(): void {
        this.baseConfiguration = {
            name: "LeetCode Problems",
            description: "Structured database of LeetCode problems and solutions",
            source: this.settings.individualNotesPath || "DSA/Problems",
            columns: [
                {
                    name: "problem_id",
                    type: "number",
                    description: "LeetCode problem ID",
                    required: true
                },
                {
                    name: "title",
                    type: "text",
                    description: "Problem title",
                    required: true
                },
                {
                    name: "difficulty",
                    type: "text",
                    description: "Problem difficulty (Easy/Medium/Hard)",
                    required: true
                },
                {
                    name: "topics",
                    type: "list",
                    description: "Problem topics/categories",
                    required: false
                },
                {
                    name: "status",
                    type: "text",
                    description: "Solution status (Solved/Attempted/Todo)",
                    required: true
                },
                {
                    name: "date_solved",
                    type: "date",
                    description: "Date when problem was solved",
                    required: false
                },
                {
                    name: "url",
                    type: "link",
                    description: "LeetCode problem URL",
                    required: false
                },
                {
                    name: "runtime",
                    type: "text",
                    description: "Solution runtime performance",
                    required: false
                },
                {
                    name: "memory",
                    type: "text",
                    description: "Solution memory usage",
                    required: false
                },
                {
                    name: "language",
                    type: "text",
                    description: "Programming language used",
                    required: false
                },
                {
                    name: "notes_link",
                    type: "link",
                    description: "Link to individual problem note",
                    required: false
                }
            ],
            views: [
                {
                    name: "All Problems",
                    type: "table",
                    columns: ["problem_id", "title", "difficulty", "topics", "status", "date_solved"],
                    sort: { column: "date_solved", direction: "desc" }
                },
                {
                    name: "Solved Problems",
                    type: "table",
                    columns: ["problem_id", "title", "difficulty", "topics", "date_solved", "runtime", "memory"],
                    filters: { status: "Solved" },
                    sort: { column: "date_solved", direction: "desc" }
                },
                {
                    name: "By Difficulty",
                    type: "cards",
                    columns: ["title", "difficulty", "topics", "status"],
                    sort: { column: "difficulty", direction: "asc" }
                },
                {
                    name: "To Review",
                    type: "table",
                    columns: ["problem_id", "title", "difficulty", "topics", "date_solved"],
                    filters: { status: ["Attempted", "Todo"] },
                    sort: { column: "date_solved", direction: "desc" }
                }
            ],
            defaultView: this.settings.basesDefaultView || "All Problems"
        };
    }

    private setupEventListeners(): void {
        // Debounced file change handling
        const debouncedModify = debounce(this.onFileModified.bind(this), 1000, true);

        const modifyRef = this.app.vault.on('modify', debouncedModify);
        const createRef = this.app.vault.on('create', this.onFileCreated.bind(this));

        this.eventRefs.push(modifyRef, createRef);
    }

    private async onFileModified(file: TFile): Promise<void> {
        if (file instanceof TFile && this.isProblemFile(file)) {
            this.queueUpdate(file.path);
        }
    }

    private async onFileCreated(file: TFile): Promise<void> {
        if (file instanceof TFile && this.isProblemFile(file)) {
            this.queueUpdate(file.path);
        }
    }

    private isProblemFile(file: TFile): boolean {
        return file.path.startsWith(this.settings.individualNotesPath) &&
            file.extension === 'md';
    }

    private queueUpdate(filePath: string): void {
        this.updateQueue.add(filePath);
        this.processUpdateQueue();
    }

    private async processUpdateQueue(): Promise<void> {
        if (this.isUpdating || this.updateQueue.size === 0) return;

        this.isUpdating = true;
        const updates = Array.from(this.updateQueue);
        this.updateQueue.clear();

        try {
            await this.batchProcessFiles(updates);
        } finally {
            this.isUpdating = false;
        }
    }

    private async batchProcessFiles(filePaths: string[]): Promise<void> {
        const BATCH_SIZE = 20;

        for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
            const batch = filePaths.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (path) => {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    await this.updateSingleFile(file);
                }
            }));
        }
    }

    private async updateSingleFile(file: TFile): Promise<void> {
        try {
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        } catch (error) {
            console.error(`Failed to update ${file.path}:`, error);
        }
    }

     /**
     * Get frontmatter using Obsidian's MetadataCache
     */
    private getFrontmatter(file: TFile): Record<string, any> | undefined {
        return this.app.metadataCache.getFileCache(file)?.frontmatter;
    }

    /**
     * Create base with proper YAML handling
     */
    async createOrUpdateBase(): Promise<void> {
        const baseFilePath = this.getBaseFilePath();

        try {
            await this.ensureDirectory(this.getDirectoryPath(baseFilePath));

            const baseContent = this.generateBaseContent();
            const existingFile = this.app.vault.getAbstractFileByPath(baseFilePath);

            if (existingFile instanceof TFile) {
                // Only update if content has changed
                await this.app.vault.process(existingFile, (currentContent) => {
                    if (currentContent !== baseContent) {
                        return baseContent;
                    }
                    return currentContent;
                });
            } else if (!existingFile) {
                await this.app.vault.create(baseFilePath, baseContent);
            }
        } catch (error) {
            console.error("Error managing base:", error);        
        }
    }

    private generateBaseContent(): string {
        const config = {
            filters: 'problem_id != null',
            views: [
                {
                    type: 'table',
                    name: 'All Problems',
                    order: ['problem_id', 'title', 'difficulty', 'topics', 'status', 'date_solved']
                },
                {
                    type: 'table',
                    name: 'Solved Problems',
                    order: ['problem_id', 'title', 'difficulty', 'topics', 'date_solved', 'runtime', 'memory'],
                    filters: 'status == "Solved"'
                },
                {
                    type: 'cards',
                    name: 'By Difficulty',
                    order: ['title', 'difficulty', 'topics', 'status']
                }
            ]
        };

        return stringifyYaml(config);
    }

    /**
     * Batch update multiple problems
     */
    async batchUpdateProblems(problems: LeetCodeProblem[]): Promise<{ updated: number; failed: number }> {
        const BATCH_SIZE = 10; // Process in smaller batches to avoid overwhelming the system
        const results = [];

        for (let i = 0; i < problems.length; i += BATCH_SIZE) {
            const batch = problems.slice(i, i + BATCH_SIZE);
            const batchPromises = batch.map(problem =>
                this.updateProblemInBase(problem).catch(error => {
                    console.error(`Failed to update ${problem.title}:`, error);
                    return { success: false, problem: problem.title, error: error.message };
                })
            );

            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults);

            // Small delay between batches
            if (i + BATCH_SIZE < problems.length) {
                 await new Promise(resolve => window.setTimeout(resolve, 100));
            }
        }

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - successful;

        return  {
            updated: successful,
            failed: failed
        }

    }

    /**
     * Updates a single problem in the base
     */
    async updateProblemInBase(problem: LeetCodeProblem): Promise<void> {
        const notePath = this.getProblemNotePath(problem);
        const file = this.app.vault.getAbstractFileByPath(notePath);

        if (!(file instanceof TFile)) {
            console.warn(`Problem note not found: ${notePath}`);
            return;
        }

        await this.updateProblemFrontmatter(file, problem);
    }

    /**
     * Frontmatter update using Obsidian's built-in processor
     */
    async updateProblemFrontmatter(file: TFile, problem: LeetCodeProblem): Promise<void> {
        const updates = {
            problem_id: problem.id,
            title: problem.title,
            difficulty: problem.difficulty,
            topics: problem.topics,
            status: problem.status,
            date_solved: problem.timestamp ?
                new Date(problem.timestamp * 1000).toISOString().split('T')[0] : null,
            url: problem.url,
            language: problem.language || 'python',
            runtime: problem.submissionDetails?.runtime || '',
            memory: problem.submissionDetails?.memory || ''
        };

        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
            Object.assign(frontmatter, updates);
        });
    }

    /**
     * Validation for base integrity
     */
    async validateBaseIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];
        const files = await this.getProblemsInFolder();

        const CHUNK_SIZE = 50;
        for (let i = 0; i < files.length; i += CHUNK_SIZE) {
            const chunk = files.slice(i, i + CHUNK_SIZE);
            const results = await Promise.allSettled(
                chunk.map(file => this.validateProblemNote(file))
            );

            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && !result.value.valid) {
                    issues.push(`${chunk[index].path}: ${result.value.issues.join(', ')}`);
                } else if (result.status === 'rejected') {
                    issues.push(`${chunk[index].path}: Validation error`);
                }
            });
        }

        return { valid: issues.length === 0, issues };
    }

    private async validateProblemNote(file: TFile): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];

        try {
            const frontmatter = this.getFrontmatter(file);

            if (!frontmatter) {
                issues.push('Missing frontmatter');
                return { valid: false, issues };
            }

            const requiredFields = ['problem_id', 'title', 'difficulty', 'status'];

            for (const field of requiredFields) {
                if (!(field in frontmatter)) {
                    issues.push(`Missing required field: ${field}`);
                }
            }

            return { valid: issues.length === 0, issues };
        } catch (error) {
            return { valid: false, issues: [`Error reading file: ${(error as Error).message}`] };
        }
    }

    private getProblemNotePath(problem: LeetCodeProblem): string {
        const fileName = this.sanitizeFileName(problem.title);
        return normalizePath(`${this.settings.individualNotesPath}/${fileName}.md`);
    }

    private sanitizeFileName(title: string): string {
        return title
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
    }

    /**
     * Existing IDs retrieval using MetadataCache
     */
    async getExistingProblemIds(): Promise<Set<number>> {
        const ids = new Set<number>();

        try {
            const folder = this.app.vault.getAbstractFileByPath(this.settings.individualNotesPath);
            if (!(folder instanceof TFolder)) {
                return ids;
            }

            const files = await this.getProblemsInFolder();

            if (files.length === 0) {
                return ids;
            }

            // Use MetadataCache instead of reading files
           for (const file of files) {
                const frontmatter = this.getFrontmatter(file);
                if (frontmatter) {
                    const problemId = frontmatter.problem_id;
                    if (typeof problemId === 'number' && problemId > 0) {
                        ids.add(problemId);
                    }
                }
            }
        } catch (error) {
            console.warn("Error retrieving existing problem IDs:", error);
        }

        return ids;
    }

    // Utility methods
    private getBaseFilePath(): string {
        return normalizePath(this.settings.baseFilePath || "DSA/leetcode-problems.base");
    }

    private getDirectoryPath(filePath: string): string {
        return filePath.substring(0, filePath.lastIndexOf('/'));
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            const normalizedPath = normalizePath(dirPath);
            const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (!(folder instanceof TFolder)) {
                await this.app.vault.createFolder(normalizedPath);
            }
        } catch (error) {
            console.error(`Failed to create directory ${dirPath}:`, error);
            throw new Error(`Could not create directory: ${dirPath}`);
        }
    }

    private async getProblemsInFolder(): Promise<TFile[]> {
        try {
            const folder = this.app.vault.getAbstractFileByPath(this.settings.individualNotesPath);
            if (!(folder instanceof TFolder)) {
                return [];
            }

            // Get all markdown files in the problems folder
            const allFiles = this.app.vault.getMarkdownFiles();
            const problemFiles = allFiles.filter(file =>
                file.path.startsWith(this.settings.individualNotesPath + '/') &&
                file.extension === 'md'
            );

            return problemFiles;
        } catch (error) {
            console.error("Error getting problems in folder:", error);
            return [];
        }
    }


    // Clean up resources
    destroy(): void {
        // Unregister all event listeners
        this.eventRefs.forEach(ref => this.app.vault.offref(ref));
        this.eventRefs = [];
        this.updateQueue.clear();
    }

    updateSettings(settings: any): void {
        this.settings = settings;
        this.initializeBaseConfiguration();
    }
}