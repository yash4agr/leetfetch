import { App, TFile, Notice, parseYaml, stringifyYaml } from 'obsidian';
import { LeetCodeProblem } from './leetcode';

// Enhanced caching interface
interface CacheEntry {
    content: string;
    frontmatter: Record<string, any>;
    mtime: number;
}

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
    private cache = new Map<string, CacheEntry>();
    private updateQueue = new Set<string>();
    private isUpdating = false;
    private baseConfiguration: BaseConfiguration;

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
        this.app.vault.on('modify', this.debounce(this.onFileModified.bind(this), 1000));
        this.app.vault.on('create', this.onFileCreated.bind(this));
        this.app.vault.on('delete', this.onFileDeleted.bind(this));
    }

    private debounce(func: Function, wait: number) {
        let timeout: NodeJS.Timeout;
        return (...args: any[]) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    private async onFileModified(file: TFile): Promise<void> {
        if (this.isProblemFile(file)) {
            this.queueUpdate(file.path);
        }
    }

    private async onFileCreated(file: TFile): Promise<void> {
        if (this.isProblemFile(file)) {
            this.cache.delete(file.path);
            this.queueUpdate(file.path);
        }
    }

    private onFileDeleted(file: TFile): void {
        this.cache.delete(file.path);
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
                const file = this.app.vault.getAbstractFileByPath(path) as TFile;
                if (file) {
                    await this.updateSingleFile(file);
                }
            }));
        }
    }

    private async updateSingleFile(file: TFile): Promise<void> {
        try {
            const cachedContent = await this.getCachedContent(file);
            // Process the individual file update
            console.log(`Updated: ${file.path}`);
        } catch (error) {
            console.error(`Failed to update ${file.path}:`, error);
        }
    }

    private async getCachedContent(file: TFile): Promise<CacheEntry> {
        const mtime = file.stat.mtime;
        const cached = this.cache.get(file.path);
        
        if (cached && cached.mtime === mtime) {
            return cached;
        }
        
        const content = await this.app.vault.read(file);
        const frontmatter = this.parseFrontmatter(content);
        
        const entry: CacheEntry = { content, frontmatter, mtime };
        this.cache.set(file.path, entry);
        return entry;
    }

    private parseFrontmatter(content: string): Record<string, any> {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
        const match = content.match(frontmatterRegex);
        
        if (!match) return {};
        
        try {
            return parseYaml(match[1]) || {};
        } catch (error) {
            console.warn('Failed to parse frontmatter:', error);
            return {};
        }
    }

    /**
     * Optimized base creation with proper YAML handling
     */
    async createOrUpdateBase(): Promise<void> {
        const baseFilePath = this.getBaseFilePath();
        
        try {
            await this.ensureDirectory(this.getDirectoryPath(baseFilePath));
            
            const baseContent = this.generateBaseContent();
            const existingFile = this.app.vault.getAbstractFileByPath(baseFilePath);
            
            if (existingFile instanceof TFile) {
                // Only update if content has changed
                const currentContent = await this.app.vault.read(existingFile);
                if (currentContent !== baseContent) {
                    await this.app.vault.modify(existingFile, baseContent);
                    new Notice("LeetCode Problems base updated");
                }
            } else {
                await this.app.vault.create(baseFilePath, baseContent);
                new Notice("LeetCode Problems base created");
            }
        } catch (error) {
            console.error("Error managing base:", error);
            new Notice(`Error: ${error.message}`);
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
     * Batch update multiple problems - your original use case
     */
    async batchUpdateProblems(problems: LeetCodeProblem[]): Promise<void> {
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
            
            // Small delay between batches to prevent overwhelming the file system
            if (i + BATCH_SIZE < problems.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.length - successful;

        console.log(`Batch update completed: ${successful} successful, ${failed} failed`);
        
        if (successful > 0) {
            new Notice(`Updated ${successful} problems${failed > 0 ? ` (${failed} failed)` : ''}`);
        }
    }

        /**
     * Updates a single problem in the base (maintains your original interface)
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
     * Optimized frontmatter update using Obsidian's built-in processor
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

        // Invalidate cache
        this.cache.delete(file.path);
    }

    /**
     * Stream-based validation for large vaults
     */
    async validateBaseIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
        const issues: string[] = [];
        const files = await this.getProblemsInFolder();
        
        // Process in chunks to manage memory
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
            const cached = await this.getCachedContent(file);
            const requiredFields = ['problem_id', 'title', 'difficulty', 'status'];
            
            for (const field of requiredFields) {
                if (!(field in cached.frontmatter)) {
                    issues.push(`Missing required field: ${field}`);
                }
            }

            return { valid: issues.length === 0, issues };
        } catch (error) {
            return { valid: false, issues: [`Error reading file: ${error.message}`] };
        }
    }

    private getProblemNotePath(problem: LeetCodeProblem): string {
        const fileName = this.sanitizeFileName(problem.title);
        return this.normalizePath(`${this.settings.individualNotesPath}/${fileName}.md`);
    }

    private sanitizeFileName(title: string): string {
        return title
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .toLowerCase();
    }

    /**
     * Optimized existing IDs retrieval using cache
     */
    async getExistingProblemIds(): Promise<Set<number>> {
        const ids = new Set<number>();
        
        try {
            const files = await this.getProblemsInFolder();
            const cachedData = await Promise.all(
                files.map(file => this.getCachedContent(file))
            );
            
            cachedData.forEach(cache => {
                const problemId = cache.frontmatter.problem_id;
                if (typeof problemId === 'number') {
                    ids.add(problemId);
                }
            });
        } catch (error) {
            console.warn("Error retrieving existing problem IDs:", error);
        }
        
        return ids;
    }

    // Utility methods
    private getBaseFilePath(): string {
        return this.normalizePath(this.settings.baseFilePath || "DSA/leetcode-problems.base");
    }

    private getDirectoryPath(filePath: string): string {
        return filePath.substring(0, filePath.lastIndexOf('/'));
    }

    private normalizePath(path: string): string {
        return path.replace(/\\/g, '/').replace(/\/+/g, '/');
    }

    private async ensureDirectory(dirPath: string): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(dirPath);
        if (!folder) {
            await this.app.vault.createFolder(dirPath);
        }
    }

    private async getProblemsInFolder(): Promise<TFile[]> {
        const files: TFile[] = [];
        const folder = this.app.vault.getAbstractFileByPath(this.settings.individualNotesPath);
        
        if (folder) {
            this.app.vault.getMarkdownFiles()
                .filter(file => file.path.startsWith(this.settings.individualNotesPath))
                .forEach(file => files.push(file));
        }
        
        return files;
    }

    // Clean up resources
    destroy(): void {
        this.cache.clear();
        this.updateQueue.clear();
    }

    updateSettings(settings: any): void {
        this.settings = settings;
        this.initializeBaseConfiguration();
        this.cache.clear(); // Clear cache when settings change
    }
}