import { create } from "domain";
import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { LeetCodeAPI } from "./leetcode";
import { ProblemLogWriter } from "./writer";

interface LeetFetchSettings {
	username: string;
	sessionToken: string;
	logFilePath: string;
	createIndividualNotes: boolean;
	autoSync: boolean;
	syncInterval: number; // in minutes
	noteTemplatePath: string;
	topicTagsEnabled: boolean;
	topicBacklinkEnabled: boolean;
	individualNotesPath: string;
	topicNotesPath: string;
	fetchAllOnEmpty: boolean;
	addAdditionalNotes: boolean;
}

const DEFAULT_SETTINGS: LeetFetchSettings = {
	username: "",
	sessionToken: "",
	logFilePath: "DSA/ProblemLogs.md",
	createIndividualNotes: true,
	autoSync: false,
	syncInterval: 60, // in minutes
	noteTemplatePath: "",
	topicTagsEnabled: true,
	topicBacklinkEnabled: true,
	individualNotesPath: "DSA/Problems",
	topicNotesPath: "DSA/Topics",
	fetchAllOnEmpty: true,
	addAdditionalNotes: false,
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
		this.writer = new ProblemLogWriter(this.app, this.settings);

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

			// check if log file exists and is empty
			const shouldFetchAll = await this.shouldFetchAllProblems();

			let problems;
			if (shouldFetchAll) {
				new Notice("Fetching all submissions...");
				problems = await this.leetcodeAPI.fetchAllSubmissions();
			} else {
				problems = await this.leetcodeAPI.fetchRecentSubmissions();
			}
			
			const newProblems = await this.writer.updateProblemLog(problems);

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
			const newProblems = await this.writer.updateProblemLog(problems);

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
			const logFile = this.app.vault.getFileByPath(
				this.settings.logFilePath
			);
			if (!logFile) {
				return true; // file doesn't exist
			}
			// await this.leetcodeAPI.loadProcessedQuestions([this.settings.logFilePath]);
			const content = await this.app.vault.read(logFile);
			const lines = content
				.split("\n")
				.filter(
					(line) => line.startsWith("|") && !line.includes("Date")
				);
			return lines.length === 0; // file is empty of problem entries
		} catch (error) {
			console.error("Error checking log file:", error);
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
					.setValue(this.plugin.settings.logFilePath)
					.onChange(async (value) => {
						this.plugin.settings.logFilePath = value;
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
	}
}
