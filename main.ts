import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { LeetCodeAPI } from "./leetcode";
import { ProblemLogWriter } from "./writer";
import { BaseManager } from "./bases";

interface LeetFetchSettings {
	// LeetCode API Configuration
	username: string;
	sessionToken: string;
	
	// Core Bases Configuration
	baseFilePath: string;
	basesDefaultView: string;
	useBasesFormat: boolean;
	
	// Individual Notes Configuration
	createIndividualNotes: boolean;
	individualNotesPath: string;
	noteTemplatePath: string;
	
	// Topic Management
	topicTagsEnabled: boolean;
	topicBacklinkEnabled: boolean;
	topicNotesPath: string;
	
	// Sync Configuration
	autoSync: boolean;
	syncInterval: number; // in minutes
	fetchAllOnEmpty: boolean;
	
	// Additional Features
	addAdditionalNotes: boolean;

	// Advanced Settings
	recentSubmissionsLimit: number; // Default: 20
    maxRetries: number; // Default: 3
    requestTimeout: number; // Default: 30000
}

const DEFAULT_SETTINGS: LeetFetchSettings = {
	// LeetCode API Configuration
	username: "",
	sessionToken: "",
	
	// Core Bases Configuration
	baseFilePath: "DSA/leetcode-problems.base",
	basesDefaultView: "All Problems",
	useBasesFormat: true,
	
	// Individual Notes Configuration
	createIndividualNotes: true,
	individualNotesPath: "DSA/Problems",
	noteTemplatePath: "",
	
	// Topic Management
	topicTagsEnabled: true,
	topicBacklinkEnabled: true,
	topicNotesPath: "DSA/Topics",
	
	// Sync Configuration
	autoSync: false,
	syncInterval: 60, // in minutes
	fetchAllOnEmpty: true,
	
	// Additional Features
	addAdditionalNotes: false,

	// Advanced Settings
	recentSubmissionsLimit: 20,
	maxRetries: 3,
	requestTimeout: 30000,
};

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

export default class LeetFetchPlugin extends Plugin {
	settings: LeetFetchSettings;
	leetcodeAPI: LeetCodeAPI;
	writer: ProblemLogWriter;
	syncInterval: number;

	async onload() {
		await this.loadSettings();

		this.leetcodeAPI = new LeetCodeAPI(this.settings);
		this.writer = new ProblemLogWriter(this.app, this.settings, this);

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("download", "Sync LeetCode Problems", () => {
			this.syncProblems();
		});

		this.addCommand({
			id: "sync-leetcode-problems",
			name: "Sync LeetCode Problems",
			callback: () => {
				this.syncProblems();
			},
		});

		this.addCommand({
			id: "sync-all-problems",
			name: "Sync All LeetCode Problems",
			callback: () => {
				this.syncAllProblems();
			},
		});

		this.addCommand({
			id: "create-problem-note",
			name: "Create Problem Note from Current Line",
			callback: () => {
				this.createProblemNoteFromCursor();
			},
		});

		this.addCommand({
			id: "initialize-bases",
			name: "Initialize Obsidian Bases Format",
			callback: () => {
				this.initializeBasesFormat();
			},
		});

		this.addCommand({
			id: "validate-bases-integrity",
			name: "Validate Bases Data Integrity",
			callback: () => {
				this.validateBasesIntegrity();
			},
		});

		this.addSettingTab(new LeetFetchSettingTab(this.app, this));

		if (this.settings.autoSync) {
			this.setupAutoSync();
		}

		console.log("LeetFetch Plugin loaded successfully!");
	}

	async syncProblems() {
		if (!this.settings.username) {
			new Notice(
				"Please set your LeetCode username in the plugin settings."
			);
			return;
		}
		try {
			new Notice("Syncing problems...");

			// Check if we should fetch all problems (when base is empty or doesn't exist)
			const shouldFetchAll = await this.shouldFetchAllProblems();

			let problems;
			if (shouldFetchAll) {
				new Notice("Fetching all submissions...");
				problems = await this.leetcodeAPI.fetchAllSubmissions();
			} else {
				problems = await this.leetcodeAPI.fetchRecentSubmissions();
			}
			
			const newProblems = await this.writer.updateProblemBase(problems);

			if (this.settings.createIndividualNotes) {
				await this.writer.createIndividualNotes(newProblems);
			}

			const message = shouldFetchAll
				? `Fetched ${newProblems.length} problems successfully!`
				: `Synced ${newProblems.length} new problems successfully!`;
			new Notice(message);
		} catch (error) {
			console.error("Error syncing problems:", error);
			new Notice(
				"Error syncing problems. Please check the console for more details."
			);
		}
	}

	async syncAllProblems() {
		if (!this.settings.username) {
			new Notice(
				"Please set your LeetCode username in the plugin settings."
			);
			return;
		}

		try {
			new Notice("Fetching all submissions...");

			const problems = await this.leetcodeAPI.fetchAllSubmissions();
			const newProblems = await this.writer.updateProblemBase(problems);

			if (this.settings.createIndividualNotes) {
				await this.writer.createIndividualNotes(newProblems);
			}

			new Notice(`Fetched ${newProblems.length} problems successfully!`);
		} catch (error) {
			console.error("Error syncing all problems:", error);
			new Notice(`Error syncing all problems: ${error.message}`);
		}
	}

	async shouldFetchAllProblems(): Promise<boolean> {
		if (!this.settings.fetchAllOnEmpty) {
			return false;
		}

		try {
			const baseFile = this.app.vault.getFileByPath(
				this.settings.baseFilePath
			);
			if (!baseFile) {
				return true; // base file doesn't exist
			}
			
			// Check if base has any data by looking at the source folder
			const sourceFolder = this.app.vault.getAbstractFileByPath(
				this.settings.individualNotesPath
			);
			if (!sourceFolder) {
				return true; // source folder doesn't exist
			}
			
			// Count existing problem notes
			const files = await this.app.vault.adapter.list(this.settings.individualNotesPath);
			return files.files.length === 0; // no problem notes exist
		} catch (error) {
			console.error("Error checking base status:", error);
			return false;
		}
	}

	async createProblemNoteFromCursor() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file found.");
			return;
		}

		const editor =
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		if (!editor) {
			new Notice("No active editor found.");
			return;
		}

		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line).trim();

		const linkMatch = line.match(/\[([^\]]+)\]\([^)]+\)/);
		if (!linkMatch) {
			new Notice("No valid problem link found on the current line.");
			return;
		}

		const problemTitle = linkMatch[1];
		const slug = this.extractSlugFromTitle(problemTitle);

		try {
			const problemDetails = await this.leetcodeAPI.fetchProblemDetails(
				slug
			);
			if (!problemDetails) {
				new Notice("Problem not found.");
				return;
			}

			// Create a mock problem object for the note creation
			const problem = {
				...problemDetails,
				timestamp: Date.now() / 1000,
				status: "Todo" as const,
			};

			await this.writer.createProblemNote(problem);
			new Notice(`Created note for ${problemTitle}`);
		} catch (error) {
			console.error("Failed to create problem note:", error);
			new Notice("Failed to create problem note");
		}
	}

	async generateStatsReport() {
		try {
			const report = await this.writer.generateStatsReport();
			const fileName = `DSA/Stats-${
				new Date().toISOString().split("T")[0]
			}.md`;

			await this.app.vault.create(fileName, report);
			new Notice(`Stats report generated: ${fileName}`);
		} catch (error) {
			console.error("Error generating stats report:", error);
			new Notice(`Error generating stats report: ${error.message}`);
		}
	}

	extractSlugFromTitle(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.replace(/\s+/g, "-");
	}

	async initializeBasesFormat() {
		if (!this.settings.username) {
			new Notice("Please set your LeetCode username in the plugin settings.");
			return;
		}

		try {
			new Notice("Initializing Obsidian Bases format...");
			
			const baseManager = new BaseManager(this.app, this.settings);
			await baseManager.createOrUpdateBase();
			
			new Notice("✅ Obsidian Bases format initialized successfully!");
		} catch (error) {
			console.error("Bases initialization failed:", error);
			new Notice(`❌ Bases initialization failed: ${error.message}`);
		}
	}

	async validateBasesIntegrity() {
		if (!this.settings.useBasesFormat) {
			new Notice("Bases format is not enabled. Please enable it in settings.");
			return;
		}

		try {
			new Notice("Validating Bases data integrity...");
			
			const baseManager = new BaseManager(this.app, this.settings);
			const validation = await baseManager.validateBaseIntegrity();
			
			if (validation.valid) {
				new Notice("✅ Bases data integrity check passed!");
			} else {
				new Notice(`❌ Found ${validation.issues.length} integrity issues. Check console for details.`);
				console.error("Bases integrity issues:", validation.issues);
			}
		} catch (error) {
			console.error("Validation failed:", error);
			new Notice(`Validation failed: ${error.message}`);
		}
	}

	setupAutoSync() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}

		this.syncInterval = window.setInterval(() => {
			this.syncProblems();
		}, this.settings.syncInterval * 60 * 1000);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update instances
		this.leetcodeAPI?.updateSettings(this.settings);
		this.writer?.updateSettings(this.settings);

		// Update auto-sync
		if (this.settings.autoSync) {
			this.setupAutoSync();
		} else if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}
	}

	onunload(): void {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
		}
		console.log("LeetFetch Plugin unloaded successfully!");
	}
}

class LeetFetchSettingTab extends PluginSettingTab {
	plugin: LeetFetchPlugin;

	constructor(app: App, plugin: LeetFetchPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "LeetFetch Settings" });

		// Basic Settings
		containerEl.createEl("h3", { text: "Basic Settings" });

		new Setting(containerEl)
			.setName("LeetCode Username")
			.setDesc("Your LeetCode username.")
			.addText((text) =>
				text
					.setPlaceholder("Enter your username")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Session Token (optional)")
			.setDesc(
				"For accessing private submissions. Get from browser cookies."
			)
			.addText((text) =>
				text
					.setPlaceholder("Enter your session token")
					.setValue(this.plugin.settings.sessionToken)
					.onChange(async (value) => {
						this.plugin.settings.sessionToken = value;
						await this.plugin.saveSettings();
					})
			);

		// File Paths
		containerEl.createEl("h3", { text: "File Paths" });

		new Setting(containerEl)
			.setName("Problem Log File Path")
			.setDesc("Path to the problem log file.")
			.addText((text) =>
				text
					.setPlaceholder("DSA/ProblemLogs.md")
					.setValue(this.plugin.settings.baseFilePath)
					.onChange(async (value) => {
						this.plugin.settings.baseFilePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Individual Notes Path")
			.setDesc("Directory path for individual problem notes.")
			.addText((text) =>
				text
					.setPlaceholder("DSA/Problems")
					.setValue(this.plugin.settings.individualNotesPath)
					.onChange(async (value) => {
						this.plugin.settings.individualNotesPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Topic Notes Path")
			.setDesc("Directory path for topic notes.")
			.addText((text) =>
				text
					.setPlaceholder("DSA/Topics")
					.setValue(this.plugin.settings.topicNotesPath)
					.onChange(async (value) => {
						this.plugin.settings.topicNotesPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Note Template Path")
			.setDesc(
				"Path to custom note template file. Leave empty to use default template."
			)
			.addText((text) =>
				text
					.setPlaceholder("Templates/problem-template.md")
					.setValue(this.plugin.settings.noteTemplatePath)
					.onChange(async (value) => {
						this.plugin.settings.noteTemplatePath = value;
						await this.plugin.saveSettings();
					})
			);

		// Features
		containerEl.createEl("h3", { text: "Features" });

		new Setting(containerEl)
			.setName("Create Individual Notes")
			.setDesc("Create individual notes for each problem solved.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createIndividualNotes)
					.onChange(async (value) => {
						this.plugin.settings.createIndividualNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable Topic Tags")
			.setDesc("Add topic tags like [[Arrays]], [[Dynamic Programming]]")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.topicTagsEnabled)
					.onChange(async (value) => {
						this.plugin.settings.topicTagsEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable Topic Backlinks")
			.setDesc(
				"Create backlinks to topic notes in the specified topic directory."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.topicBacklinkEnabled)
					.onChange(async (value) => {
						this.plugin.settings.topicBacklinkEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Add Additional Notes")
			.setDesc(
				"Add additional notes section to individual problem notes."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addAdditionalNotes)
					.onChange(async (value) => {
						this.plugin.settings.addAdditionalNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Fetch All on Empty")
			.setDesc(
				"Fetch all submissions when problem log is empty or doesn't exist."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fetchAllOnEmpty)
					.onChange(async (value) => {
						this.plugin.settings.fetchAllOnEmpty = value;
						await this.plugin.saveSettings();
					})
			);

		// Bases Settings
		containerEl.createEl("h3", { text: "Obsidian Bases Integration" });

		new Setting(containerEl)
			.setName("Use Bases Format")
			.setDesc(
				"Store problem data in Obsidian Bases format instead of markdown tables."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useBasesFormat)
					.onChange(async (value) => {
						this.plugin.settings.useBasesFormat = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Base File Path")
			.setDesc("Path to the Obsidian Base file for storing problem data.")
			.addText((text) =>
				text
					.setPlaceholder("DSA/leetcode-problems.base")
					.setValue(this.plugin.settings.baseFilePath)
					.onChange(async (value) => {
						this.plugin.settings.baseFilePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default Bases View")
			.setDesc("Default view to display in the Bases interface.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("All Problems", "All Problems")
					.addOption("Solved Problems", "Solved Problems")
					.addOption("By Difficulty", "By Difficulty")
					.addOption("To Review", "To Review")
					.setValue(this.plugin.settings.basesDefaultView)
					.onChange(async (value) => {
						this.plugin.settings.basesDefaultView = value;
						await this.plugin.saveSettings();
					})
			);


		// Auto Sync
		containerEl.createEl("h3", { text: "Auto Sync" });

		new Setting(containerEl)
			.setName("Auto Sync Problems")
			.setDesc("Automatically sync problems at regular intervals.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sync Interval (minutes)")
			.setDesc("How often to auto-sync (if enabled)")
			.addText((text) =>
				text
					.setPlaceholder("60")
					.setValue(this.plugin.settings.syncInterval.toString())
					.onChange(async (value) => {
						const interval = parseInt(value);
						if (!isNaN(interval) && interval > 0) {
							this.plugin.settings.syncInterval = interval;
							await this.plugin.saveSettings();
						}
					})
			);

		// Actions
		containerEl.createEl("h3", { text: "Actions" });

		new Setting(containerEl)
			.setName("Sync All Problems")
			.setDesc("Manually fetch all submissions from LeetCode.")
			.addButton((button) =>
				button.setButtonText("Sync All").onClick(() => {
					this.plugin.syncAllProblems();
				})
			);

		new Setting(containerEl)
			.setName("Generate Stats Report")
			.setDesc("Generate a statistics report of your problem solving.")
			.addButton((button) =>
				button.setButtonText("Generate Stats").onClick(() => {
					this.plugin.generateStatsReport();
				})
			);

		new Setting(containerEl)
			.setName("Validate Bases Integrity")
			.setDesc("Check data integrity of the Bases format.")
			.addButton((button) =>
				button.setButtonText("Validate Integrity").onClick(() => {
					this.plugin.validateBasesIntegrity();
				})
			);
	}
}
