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
	csrfToken: string;

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
	recentSubmissionsLimit: number;
	maxRetries: number;
	requestTimeout: number;
}

const DEFAULT_SETTINGS: LeetFetchSettings = {
	// LeetCode API Configuration
	username: "",
	sessionToken: "",
	csrfToken: "",

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

export default class LeetFetchPlugin extends Plugin {
	settings: LeetFetchSettings;
	leetcodeAPI: LeetCodeAPI;
	writer: ProblemLogWriter;
	syncInterval: number;

	async onload() {
		await this.loadSettings();

		this.leetcodeAPI = new LeetCodeAPI(this.settings);
		this.writer = new ProblemLogWriter(this.app, this.settings, this);

		// Create an icon in the left ribbon.
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

		// Add debug command to clear cache
		this.addCommand({
			id: "clear-cache",
			name: "Clear All Cache (Debug)",
			callback: () => {
				this.clearCache();
			},
		});

		this.addSettingTab(new LeetFetchSettingTab(this.app, this));

		if (this.settings.autoSync) {
			this.setupAutoSync();
		}
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

			if (this.settings.createIndividualNotes && newProblems.length > 0) {
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
			new Notice("Fetching all submissions (This may take a while)...");

			const problems = await this.leetcodeAPI.fetchAllSubmissions();
			const newProblems = await this.writer.updateProblemBase(problems);

			if (this.settings.createIndividualNotes && newProblems.length > 0) {
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
			const baseFile = this.app.vault.getAbstractFileByPath(
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
			const files = this.app.vault.getMarkdownFiles().filter(file =>
				file.path.startsWith(this.settings.individualNotesPath + '/') &&
				file.extension === 'md'
			);

			const isEmpty = files.length === 0;
			return isEmpty;
		} catch (error) {
			console.error("Error checking base status:", error);
			return true; // default to fetching all on error
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
			const fileName = `DSA/Stats-${new Date().toISOString().split("T")[0]
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

			new Notice("Obsidian Bases format initialized successfully!");
		} catch (error) {
			console.error("Bases initialization failed:", error);
			new Notice(`Bases initialization failed: ${error.message}`);
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
				new Notice("Bases data integrity check passed!");
			} else {
				new Notice(`Found ${validation.issues.length} integrity issues. Check console for details.`);
				console.error("Bases integrity issues:", validation.issues);
			}
		} catch (error) {
			console.error("Validation failed:", error);
			new Notice(`Validation failed: ${error.message}`);
		}
	}

	async clearCache() {
		try {
			// Clear processed problems from writer
			await this.writer.clearProcessedProblems();

			// Clear base manager cache
			const baseManager = new BaseManager(this.app, this.settings);
			baseManager.clearCache();

			new Notice("Cache cleared successfully! Next sync will reprocess all problems.");
		} catch (error) {
			console.error("Error clearing cache:", error);
			new Notice(`Error clearing cache: ${error.message}`);
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

		containerEl.createEl("h1", { text: "LeetFetch Settings" });
		containerEl.createEl("p", {
			text: "Sync your LeetCode progress to Obsidian.",
			cls: "setting-item-description"
		});

		// Quick Setup Section
		this.addQuickSetupSection(containerEl);

		// Authentication Section  
		this.addAuthenticationSection(containerEl);

		// File Organization Section
		this.addFileOrganizationSection(containerEl);

		// Features Section
		this.addFeaturesSection(containerEl);

		// Sync Configuration Section
		this.addSyncSection(containerEl);

		// Advanced Settings Section
		this.addAdvancedSection(containerEl);

		// Actions Section
		this.addActionsSection(containerEl);
	}

	private addQuickSetupSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Quick Setup" });

		new Setting(containerEl)
			.setName("LeetCode Username")
			.setDesc("Your public LeetCode username (required)")
			.addText((text) =>
				text
					.setPlaceholder("Enter your username")
					.setValue(this.plugin.settings.username)
					.onChange(async (value) => {
						this.plugin.settings.username = value;
						await this.plugin.saveSettings();
					})
			);

		// Test Connection
		new Setting(containerEl)
			.setName("Verify Connection")
			.setDesc("Test your username and check API connectivity")
			.addButton((button) =>
				button
					.setButtonText("Test Connection")
					.setClass("mod-cta")
					.onClick(async () => {
						if (!this.plugin.settings.username) {
							new Notice("Please enter your username first.");
							return;
						}

						// Disable button during test
						button.setButtonText("Testing...");
						button.setDisabled(true);

						try {
							const health = await this.plugin.leetcodeAPI.healthCheck();
							if (health.healthy) {
								new Notice("Connection successful!");
							} else {
								new Notice(`Connection failed: ${health.message}`);
							}
						} catch (error) {
							new Notice(`Connection test failed: ${error.message}`);
						} finally {
							button.setButtonText("Test Connection");
							button.setDisabled(false);
						}
					})
			);
	}

	private addAuthenticationSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Authentication (Optional)" });

		const authDesc = containerEl.createDiv({ cls: "setting-item-description" });
		authDesc.createEl("p", {
			text: "For accessing private submissions and detailed solution data. These tokens are stored locally in your vault."
		});

		new Setting(containerEl)
			.setName("Session Token")
			.setDesc("Get from browser cookies (LEETCODE_SESSION) for private data access")
			.addText((text) => {
				text
					.setPlaceholder("Paste session token here")
					.setValue(this.plugin.settings.sessionToken)
					.onChange(async (value) => {
						this.plugin.settings.sessionToken = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			})
			.addButton((button) =>
				button
					.setButtonText("Show")
					.onClick(() => {
						const inputEl = button.buttonEl.parentElement?.querySelector("input");
						if (inputEl) {
							inputEl.type = inputEl.type === "password" ? "text" : "password";
							button.setButtonText(inputEl.type === "password" ? "Show" : "Hide");
						}
					})
			);

		new Setting(containerEl)
			.setName("CSRF Token")
			.setDesc(
				"Get from browser cookies (csrftoken) - helps prevent authentication errors"
			)
			.addText((text) => {
				text
					.setPlaceholder("Paste CSRF token here")
					.setValue(this.plugin.settings.csrfToken)
					.onChange(async (value) => {
						this.plugin.settings.csrfToken = value.trim();
						await this.plugin.saveSettings();
					})
				text.inputEl.type = "password";
			})
			.addButton((button) =>
				button
					.setButtonText("Show")
					.onClick(() => {
						const inputEl = button.buttonEl.parentElement?.querySelector("input");
						if (inputEl) {
							inputEl.type = inputEl.type === "password" ? "text" : "password";
							button.setButtonText(inputEl.type === "password" ? "Show" : "Hide");
						}
					})
			);

		// Token help collapsible
		this.addTokenHelpSection(containerEl);
	}

	private addTokenHelpSection(containerEl: HTMLElement): void {
		const helpContainer = containerEl.createDiv({ cls: "setting-item" });

		const helpToggle = helpContainer.createEl("details");
		helpToggle.createEl("summary", {
			text: "How to get authentication tokens",
			cls: "setting-item-name"
		});

		const helpContent = helpToggle.createDiv({ cls: "setting-item-description" });

		helpContent.createEl("h4", { text: "Method 1: Browser Developer Tools" });
		const stepsList1 = helpContent.createEl("ol");
		stepsList1.createEl("li", { text: "Open LeetCode in your browser and log in" });
		stepsList1.createEl("li", { text: "Press F12 to open Developer Tools" });
		stepsList1.createEl("li", { text: "Go to Application tab → Storage → Cookies → https://leetcode.com" });
		stepsList1.createEl("li", { text: "Copy values for 'LEETCODE_SESSION' and 'csrftoken'" });

		helpContent.createEl("h4", { text: "Method 2: Network Tab" });
		const stepsList2 = helpContent.createEl("ol");
		stepsList2.createEl("li", { text: "Open Developer Tools → Network tab" });
		stepsList2.createEl("li", { text: "Refresh LeetCode page" });
		stepsList2.createEl("li", { text: "Click any request and look for Cookie header" });
		stepsList2.createEl("li", { text: "Find and copy the token values" });

		const securityNote = helpContent.createDiv({ cls: "mod-warning" });
		securityNote.createEl("strong", { text: "Security Note: " });
		securityNote.appendText("Tokens are stored locally in plain text. Only use on trusted devices. Regenerate tokens periodically for security.");
	}

	private addFileOrganizationSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "File Organization" });

		new Setting(containerEl)
			.setName("Problems Database")
			.setDesc("Path for the main Obsidian Base file storing all problem data")
			.addText((text) =>
				text
					.setPlaceholder("DSA/ProblemLogs.base")
					.setValue(this.plugin.settings.baseFilePath)
					.onChange(async (value) => {
						this.plugin.settings.baseFilePath = value || "DSA/leetcode-problems.base";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Individual Notes Folder")
			.setDesc("Directory path for individual problem notes files")
			.addText((text) =>
				text
					.setPlaceholder("DSA/Problems")
					.setValue(this.plugin.settings.individualNotesPath)
					.onChange(async (value) => {
						this.plugin.settings.individualNotesPath = value || "DSA/Problems";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Topic Notes Folder")
			.setDesc("Directory for topic-based organization (Arrays, DP, etc.)")
			.addText((text) =>
				text
					.setPlaceholder("DSA/Topics")
					.setValue(this.plugin.settings.topicNotesPath)
					.onChange(async (value) => {
						this.plugin.settings.topicNotesPath = value || "DSA/Topics";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Custom Note Template")
			.setDesc(
				"Path to custom template file (leave empty for default) - WIP"
			)
			.addText((text) =>
				text
					.setPlaceholder("Templates/leetcode-template.md")
					.setValue(this.plugin.settings.noteTemplatePath)
					.onChange(async (value) => {
						this.plugin.settings.noteTemplatePath = value;
						await this.plugin.saveSettings();
					})
			);

	}

	private addFeaturesSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Features" });

		new Setting(containerEl)
			.setName("Create Individual Notes")
			.setDesc("Generate separate markdown files for each problem")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createIndividualNotes)
					.onChange(async (value) => {
						this.plugin.settings.createIndividualNotes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Topic Tags")
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
			.setName("Topic Backlinks")
			.setDesc(
				"Create dedicated topic pages with backlinks to problems"
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
			.setName("Smart Import")
			.setDesc("Fetch all submissions when starting with empty vault")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.fetchAllOnEmpty)
					.onChange(async (value) => {
						this.plugin.settings.fetchAllOnEmpty = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addSyncSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Sync Configuration" });

		new Setting(containerEl)
			.setName("Auto Sync")
			.setDesc("Automatically sync problems at regular intervals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();

						// Show/hide interval setting
						const intervalSetting = containerEl.querySelector('.leetfetch-sync-interval');
						if (intervalSetting) {
							if (value) {
								intervalSetting.removeClass('hidden');
							} else {
								intervalSetting.addClass('hidden');
							}
						}
					})
			);

		const intervalSetting = new Setting(containerEl)
			.setName("Sync Interval")
			.setDesc("Minutes between automatic syncs (minimum 5)")
			.addSlider((slider) =>
				slider
					.setLimits(5, 1440, 5)
					.setValue(this.plugin.settings.syncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();

						// Update the display
						const display = slider.sliderEl.nextElementSibling as HTMLElement;
						if (display) {
							const hours = Math.floor(value / 60);
							const mins = value % 60;
							display.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
						}
					})
			);

		// Add class for dynamic show/hide
		intervalSetting.settingEl.addClass('sync-interval-setting');
		if (!this.plugin.settings.autoSync) {
			intervalSetting.settingEl.addClass('hidden');
		}

		// Add current interval display
		const intervalDisplay = intervalSetting.settingEl.createDiv({ cls: "setting-item-description" });
		const currentInterval = this.plugin.settings.syncInterval;
		const hours = Math.floor(currentInterval / 60);
		const mins = currentInterval % 60;
		intervalDisplay.textContent = `Current: ${hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}`;

		new Setting(containerEl)
			.setName("Recent Problems Limit")
			.setDesc("Number of recent problems to fetch (1-100)")
			.addSlider((slider) =>
				slider
					.setLimits(1, 100, 1)
					.setValue(this.plugin.settings.recentSubmissionsLimit)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.recentSubmissionsLimit = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addAdvancedSection(containerEl: HTMLElement): void {
		const advancedContainer = containerEl.createEl("details");
		advancedContainer.createEl("summary", {
			text: "Advanced Settings",
			cls: "setting-item-name"
		});

		const advancedContent = advancedContainer.createDiv();

		new Setting(advancedContent)
			.setName("Request Timeout")
			.setDesc("API request timeout in seconds (10-120)")
			.addSlider((slider) =>
				slider
					.setLimits(10, 120, 5)
					.setValue(this.plugin.settings.requestTimeout / 1000)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.requestTimeout = value * 1000;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedContent)
			.setName("Max Retries")
			.setDesc("Maximum retry attempts for failed requests")
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.maxRetries)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxRetries = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(advancedContent)
			.setName("Default Base View")
			.setDesc("Default view in the Obsidian Base interface")
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
	}

	private addActionsSection(containerEl: HTMLElement): void {
		containerEl.createEl("h2", { text: "Actions" });

		const actionsContainer = containerEl.createDiv({ cls: "leetfetch-actions" });

		// Primary Actions
		const primaryActions = actionsContainer.createDiv({ cls: "setting-item" });
		primaryActions.createDiv({ cls: "setting-item-info" }).createDiv({ cls: "setting-item-name", text: "Sync Operations" });
		const primaryButtons = primaryActions.createDiv({ cls: "setting-item-control" });

		primaryButtons.createEl("button", {
			text: "Sync Recent",
			cls: "mod-cta"
		}).onclick = () => this.plugin.syncProblems();

		primaryButtons.createEl("button", {
			text: "Sync All",
		}).onclick = () => this.plugin.syncAllProblems();

		// Secondary Actions
		const secondaryActions = actionsContainer.createDiv({ cls: "setting-item" });
		secondaryActions.createDiv({ cls: "setting-item-info" }).createDiv({ cls: "setting-item-name", text: "Data Management" });
		const secondaryButtons = secondaryActions.createDiv({ cls: "setting-item-control" });

		secondaryButtons.createEl("button", {
			text: "Initialize Base"
		}).onclick = () => this.plugin.initializeBasesFormat();

		secondaryButtons.createEl("button", {
			text: "Validate Data"
		}).onclick = () => this.plugin.validateBasesIntegrity();

		secondaryButtons.createEl("button", {
			text: "Clear Cache"
		}).onclick = () => {
			if (confirm("This will clear the plugin cache and reprocess all problems on next sync. Continue?")) {
				this.plugin.clearCache();
			}
		};

		// Stats Action
		const statsAction = actionsContainer.createDiv({ cls: "setting-item" });
		statsAction.createDiv({ cls: "setting-item-info" }).createDiv({ cls: "setting-item-name", text: "Generate Report" });
		const statsButton = statsAction.createDiv({ cls: "setting-item-control" });

		statsButton.createEl("button", {
			text: "Stats Report"
		}).onclick = () => this.plugin.generateStatsReport();
	}
}