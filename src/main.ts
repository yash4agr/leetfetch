import {
	App,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
	Modal,
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
	syncInterval: number;
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

class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("p", { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: "modal-button-container" });

		buttonContainer.createEl("button", { text: "Cancel" }).onclick = () => {
			this.close();
		};

		const confirmBtn = buttonContainer.createEl("button", {
			text: "Confirm",
			cls: "mod-cta"
		});
		confirmBtn.onclick = () => {
			this.close();
			this.onConfirm();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class LeetFetchPlugin extends Plugin {
	settings: LeetFetchSettings;
	leetcodeAPI: LeetCodeAPI;
	writer: ProblemLogWriter;
	syncIntervalId: number | null = null;

	async onload() {
		await this.loadSettings();

		this.leetcodeAPI = new LeetCodeAPI(this.settings);
		this.writer = new ProblemLogWriter(this.app, this.settings, this);

		// Create an icon in the left ribbon.
		this.addRibbonIcon("download", "Sync LeetCode problems", () => {
			void this.syncProblems();
		});

		this.addCommand({
			id: "sync-leetcode-problems",
			name: "Sync LeetCode problems",
			callback: () => {
				void this.syncProblems();
			},
		});

		this.addCommand({
			id: "sync-all-problems",
			name: "Sync all LeetCode problems",
			callback: () => {
				void this.syncAllProblems();
			},
		});

		this.addCommand({
			id: "create-problem-note",
			name: "Create problem note from current line",
			callback: () => {
				void this.createProblemNoteFromCursor();
			},
		});

		this.addCommand({
			id: "initialize-bases",
			name: "Initialize Obsidian Bases format",
			callback: () => {
				void this.initializeBasesFormat();
			},
		});

		this.addCommand({
			id: "validate-bases-integrity",
			name: "Validate Bases data integrity",
			callback: () => {
				void this.validateBasesIntegrity();
			},
		});

		// Add debug command to clear cache
		this.addCommand({
			id: "clear-cache",
			name: "Clear all cache (debug)",
			callback: () => {
				void this.clearCache();
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

		const notice = new Notice("", 0);

		try {
			notice.setMessage("Syncing problems...");

			// Check if we should fetch all problems (when base is empty or doesn't exist)
			const shouldFetchAll = this.shouldFetchAllProblems();

			let problems;
			if (shouldFetchAll) {
				notice.setMessage("Fetching all submissions (this may take a while)...");
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
			notice.setMessage(message);

			window.setTimeout(() => notice.hide(), 4000); // Hide after 4 seconds

		} catch (error) {
			console.error("Error syncing problems:", error);
			notice.setMessage(
				"Error syncing problems. Please check the console for more details."
			);
			
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	async syncAllProblems() {
		if (!this.settings.username) {
			new Notice(
				"Please set your LeetCode username in the plugin settings."
			);
			return;
		}

		const notice = new Notice("", 0);

		try {
			notice.setMessage("Fetching all submissions (this may take a while)...");

			const problems = await this.leetcodeAPI.fetchAllSubmissions();
			const newProblems = await this.writer.updateProblemBase(problems);

			if (this.settings.createIndividualNotes && newProblems.length > 0) {
				await this.writer.createIndividualNotes(newProblems);
			}

			notice.setMessage(`Fetched ${newProblems.length} problems successfully!`);
			window.setTimeout(() => notice.hide(), 4000);

		} catch (error) {
			console.error("Error syncing all problems:", error);
			notice.setMessage(`Error syncing all problems: ${(error as Error).message}`);
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	shouldFetchAllProblems(): boolean {
		if (!this.settings.fetchAllOnEmpty) {
			return false;
		}

		try {
			const baseFile = this.app.vault.getAbstractFileByPath(
				this.settings.baseFilePath
			);
			if (!(baseFile instanceof TFile)) {
				return true;
			}

			const sourceFolder = this.app.vault.getAbstractFileByPath(
				this.settings.individualNotesPath
			);
			if (!(sourceFolder instanceof TFolder)) {
				return true;
			}

			// Count existing problem notes
			const files = this.app.vault.getMarkdownFiles().filter(file =>
				file.path.startsWith(this.settings.individualNotesPath + '/') &&
				file.extension === 'md'
			);

			return files.length === 0;
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
			const report = this.writer.generateStatsReport();
			const fileName = `DSA/Stats-${new Date().toISOString().split("T")[0]}.md`;

			await this.app.vault.create(fileName, report);
			new Notice(`Stats report generated: ${fileName}`);
		} catch (error) {
			console.error("Error generating stats report:", error);
			new Notice(`Error generating stats report: ${(error as Error).message}`);
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

		const notice = new Notice("", 0);

		try {
			notice.setMessage("Initializing Obsidian Bases format...");

			const baseManager = new BaseManager(this.app, this.settings);
			await baseManager.createOrUpdateBase();

			notice.setMessage("Obsidian Bases format initialized successfully!");
			window.setTimeout(() => notice.hide(), 4000);

		} catch (error) {
			console.error("Bases initialization failed:", error);
			notice.setMessage(`Bases initialization failed: ${(error as Error).message}`);
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	async validateBasesIntegrity() {
		if (!this.settings.useBasesFormat) {
			new Notice("Bases format is not enabled. Please enable it in settings.");
			return;
		}

		const notice = new Notice("", 0);

		try {
			notice.setMessage("Validating Bases data integrity...");

			const baseManager = new BaseManager(this.app, this.settings);
			const validation = await baseManager.validateBaseIntegrity();

			if (validation.valid) {
				notice.setMessage("Bases data integrity check passed!");
			} else {
				notice.setMessage(`Found ${validation.issues.length} integrity issues. Check console for details.`);
				console.error("Bases integrity issues:", validation.issues);
			}
			window.setTimeout(() => notice.hide(), 4000);
		} catch (error) {
			console.error("Validation failed:", error);
			notice.setMessage(`Validation failed: ${(error as Error).message}`);
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	clearCache(): void {
		const notice = new Notice("Clearing cache...", 0);

		try {
			this.writer.clearProcessedProblems();

			const baseManager = new BaseManager(this.app, this.settings);
			baseManager.destroy();

			notice.setMessage("Cache cleared successfully! Next sync will reprocess all problems.");
			window.setTimeout(() => notice.hide(), 4000);
		} catch (error) {
			console.error("Error clearing cache:", error);
			notice.setMessage(`Error clearing cache: ${(error as Error).message}`);
			window.setTimeout(() => notice.hide(), 4000);
		}
	}

	setupAutoSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
		}

		this.syncIntervalId = window.setInterval(() => {
			void this.syncProblems();
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

		this.leetcodeAPI?.updateSettings(this.settings);
		this.writer?.updateSettings(this.settings);

		if (this.settings.autoSync) {
			this.setupAutoSync();
		} else if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
	}

	onunload(): void {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
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

		// Quick setup section
		this.addQuickSetupSection(containerEl);

		// Authentication section  
		this.addAuthenticationSection(containerEl);

		// File organization section
		this.addFileOrganizationSection(containerEl);

		// Features section
		this.addFeaturesSection(containerEl);

		// Sync configuration section
		this.addSyncSection(containerEl);

		// Advanced settings section
		this.addAdvancedSection(containerEl);

		// Actions section
		this.addActionsSection(containerEl);
	}

	private addQuickSetupSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Quick setup").setHeading();

		new Setting(containerEl)
			.setName("LeetCode username")
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

		new Setting(containerEl)
			.setName("Verify connection")
			.setDesc("Test your username and check API connectivity")
			.addButton((button) =>
				button
					.setButtonText("Test connection")
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.username) {
							new Notice("Please enter your username first.");
							return;
						}

						const notice = new Notice("Testing connection...", 0);

						button.setButtonText("Testing...");
						button.setDisabled(true);

						try {
							const health = await this.plugin.leetcodeAPI.healthCheck();
							if (health.healthy) {
								notice.setMessage("Connection successful!");
							} else {
								notice.setMessage(`Connection failed: ${health.message}`);
							}
						} catch (error) {
							notice.setMessage(`Connection test failed: ${(error as Error).message}`);
						} finally {
							button.setButtonText("Test connection");
							button.setDisabled(false);
							window.setTimeout(() => notice.hide(), 4000);
						}
					})
			);
	}

	private addAuthenticationSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Authentication (optional)").setHeading();

		const authDesc = containerEl.createDiv({ cls: "setting-item-description" });
		authDesc.createEl("p", {
			text: "For accessing private submissions and detailed solution data. These tokens are stored locally in your vault."
		});

		new Setting(containerEl)
			.setName("Session token")
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
			.setName("CSRF token")
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

		helpContent.createEl("strong", { text: "Method 1: Browser developer tools" });
		const stepsList1 = helpContent.createEl("ol");
		stepsList1.createEl("li", { text: "Open LeetCode in your browser and log in" });
		stepsList1.createEl("li", { text: "Press F12 to open developer tools" });
		stepsList1.createEl("li", { text: "Go to Application tab → Storage → Cookies → https://leetcode.com" });
		stepsList1.createEl("li", { text: "Copy values for 'LEETCODE_SESSION' and 'csrftoken'" });

		helpContent.createEl("strong", { text: "Method 2: Network tab" });
		const stepsList2 = helpContent.createEl("ol");
		stepsList2.createEl("li", { text: "Open developer tools → Network tab" });
		stepsList2.createEl("li", { text: "Refresh LeetCode page" });
		stepsList2.createEl("li", { text: "Click any request and look for Cookie header" });
		stepsList2.createEl("li", { text: "Find and copy the token values" });

		const securityNote = helpContent.createDiv({ cls: "mod-warning" });
		securityNote.createEl("strong", { text: "Security note: " });
		securityNote.appendText("Tokens are stored locally in plain text. Only use on trusted devices. Regenerate tokens periodically for security.");
	}

	private addFileOrganizationSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("File organization").setHeading();

		new Setting(containerEl)
			.setName("Problems database")
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
			.setName("Individual notes folder")
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
			.setName("Topic notes folder")
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
			.setName("Custom note template")
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
		new Setting(containerEl).setName("Features").setHeading();

		new Setting(containerEl)
			.setName("Create individual notes")
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
			.setName("Topic tags")
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
			.setName("Topic backlinks")
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
			.setName("Smart import")
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
		new Setting(containerEl).setName("Sync configuration").setHeading();

		new Setting(containerEl)
			.setName("Auto sync")
			.setDesc("Automatically sync problems at regular intervals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();

						const intervalSetting = containerEl.querySelector('.sync-interval-setting');
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
			.setName("Sync interval")
			.setDesc("Minutes between automatic syncs (minimum 5)")
			.addSlider((slider) =>
				slider
					.setLimits(5, 1440, 5)
					.setValue(this.plugin.settings.syncInterval)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();

						const display = slider.sliderEl.nextElementSibling as HTMLElement;
						if (display) {
							const hours = Math.floor(value / 60);
							const mins = value % 60;
							display.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
						}
					})
			);

		intervalSetting.settingEl.addClass('sync-interval-setting');
		if (!this.plugin.settings.autoSync) {
			intervalSetting.settingEl.addClass('hidden');
		}

		const intervalDisplay = intervalSetting.settingEl.createDiv({ cls: "setting-item-description" });
		const currentInterval = this.plugin.settings.syncInterval;
		const hours = Math.floor(currentInterval / 60);
		const mins = currentInterval % 60;
		intervalDisplay.textContent = `Current: ${hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}`;

		new Setting(containerEl)
			.setName("Recent problems limit")
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
			text: "Advanced settings",
			cls: "setting-item-name"
		});

		const advancedContent = advancedContainer.createDiv();

		new Setting(advancedContent)
			.setName("Request timeout")
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
			.setName("Max retries")
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
			.setName("Default base view")
			.setDesc("Default view in the Obsidian Base interface")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("All Problems", "All problems")
					.addOption("Solved Problems", "Solved problems")
					.addOption("By Difficulty", "By difficulty")
					.addOption("To Review", "To review")
					.setValue(this.plugin.settings.basesDefaultView)
					.onChange(async (value) => {
						this.plugin.settings.basesDefaultView = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private addActionsSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Actions").setHeading();

		new Setting(containerEl)
			.setName("Sync operations")
			.addButton((button) =>
				button
					.setButtonText("Sync recent")
					.setCta()
					.onClick(() => void this.plugin.syncProblems())
			)
			.addButton((button) =>
				button
					.setButtonText("Sync all")
					.onClick(() => void this.plugin.syncAllProblems())
			);

		new Setting(containerEl)
			.setName("Data management")
			.addButton((button) =>
				button
					.setButtonText("Initialize base")
					.onClick(() => void this.plugin.initializeBasesFormat())
			)
			.addButton((button) =>
				button
					.setButtonText("Validate data")
					.onClick(() => void this.plugin.validateBasesIntegrity())
			)
			.addButton((button) =>
				button
					.setButtonText("Clear cache")
					.onClick(() => {
						new ConfirmModal(
							this.app,
							"This will clear the plugin cache and reprocess all problems on next sync. Continue?",
							() => void this.plugin.clearCache()
						).open();
					})
			);

		new Setting(containerEl)
			.setName("Generate report")
			.addButton((button) =>
				button
					.setButtonText("Stats report")
					.onClick(() => void this.plugin.generateStatsReport())
			);
	}
}