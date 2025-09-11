import { requestUrl } from "obsidian";

export interface LeetCodeProblem {
	id: number;
	title: string;
	titleSlug: string;
	difficulty: string;
	timestamp: number;
	topics: string[];
	url: string;
	status: "Solved" | "Attempted" | "Todo";
	description?: string;
	solution?: string;
	language?: string;
	tags?: string[];
	submissionId?: number;
	runtime?: string;
	memory?: string;
	submissionDetails?: LeetCodeSubmissionDetail;
}

export interface LeetCodeSubmissionDetail {
	id: number;
	code: string;
	lang: string;
	runtime: string;
	memory: string;
	runtimePercentile: number;
	memoryPercentile: number;
	statusDisplay: string;
	timestamp: number;
}

interface APISettings {
	username: string;
	sessionToken?: string;
	recentSubmissionsLimit: number;
	maxRetries: number;
	requestTimeout: number;
}

class LeetCodeAPIError extends Error {
	constructor(
		message: string,
		public readonly type: 'NETWORK' | 'AUTH' | 'RATE_LIMIT' | 'NOT_FOUND' | 'UNKNOWN',
		public readonly statusCode?: number,
		public readonly retryable: boolean = false
	) {
		super(message);
		this.name = 'LeetCodeAPIError';
	}
}

export class LeetCodeAPI {
	private settings: APISettings;
	private readonly baseURL = "https://leetcode.com";
	private readonly graphqlURL = "https://leetcode.com/graphql";
	private processedQuestionIds: Set<number> = new Set();
	
	// Rate limiting
	private lastRequestTime = 0;
	private readonly MIN_REQUEST_INTERVAL = 100; // 100ms between requests

	constructor(settings: any) {
		this.settings = {
			username: settings.username || '',
			sessionToken: settings.sessionToken,
			recentSubmissionsLimit: settings.recentSubmissionsLimit || 20,
			maxRetries: settings.maxRetries || 3,
			requestTimeout: settings.requestTimeout || 30000, // 30 seconds
		};
	}

	updateSettings(settings: any): void {
		this.settings = {
			username: settings.username || '',
			sessionToken: settings.sessionToken,
			recentSubmissionsLimit: settings.recentSubmissionsLimit || 20,
			maxRetries: settings.maxRetries || 3,
			requestTimeout: settings.requestTimeout || 30000,
		};
	}

	async loadProcessedQuestions(logFiles: string[]): Promise<void> {
		this.processedQuestionIds.clear();

		for (const logContent of logFiles) {
			try {
				// Extract question IDs from log
				const questionIdRegex = /(?:id|questionId|problem_id):\s*(\d+)/gi;
				const titleSlugRegex = /(?:titleSlug|title_slug):\s*["']([^"']+)["']/gi;
				const urlRegex = /https:\/\/leetcode\.com\/problems\/([^\/\s]+)/gi;

				let match;

				// Extract from direct ID references
				while ((match = questionIdRegex.exec(logContent)) !== null) {
					const id = parseInt(match[1]);
					if (!isNaN(id)) {
						this.processedQuestionIds.add(id);
					}
				}

				// Extract from title slugs and convert to IDs with rate limiting
				const titleSlugs = new Set<string>();
				while ((match = titleSlugRegex.exec(logContent)) !== null) {
					titleSlugs.add(match[1]);
				}

				// Extract from URLs
				while ((match = urlRegex.exec(logContent)) !== null) {
					titleSlugs.add(match[1]);
				}

				// Convert title slugs to question IDs with rate limiting
				for (const slug of titleSlugs) {
					try {
						await this.enforceRateLimit();
						const problem = await this.fetchProblemDetails(slug);
						this.processedQuestionIds.add(problem.id);
					} catch (error) {
						console.warn(`Could not resolve title slug ${slug} to question ID:`, error instanceof Error ? error.message : error);
					}
				}
			} catch (error) {
				console.error('Error processing log file:', error instanceof Error ? error.message : error);
			}
		}

		console.log(`Loaded ${this.processedQuestionIds.size} processed question IDs`);
	}

	private isQuestionProcessed(questionId: number): boolean {
		return this.processedQuestionIds.has(questionId);
	}

	private markQuestionProcessed(questionId: number): void {
		this.processedQuestionIds.add(questionId);
	}

	private async enforceRateLimit(): Promise<void> {
		const timeSinceLastRequest = Date.now() - this.lastRequestTime;
		if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
			await this.sleep(this.MIN_REQUEST_INTERVAL - timeSinceLastRequest);
		}
		this.lastRequestTime = Date.now();
	}

	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private async exponentialBackoff<T>(
		operation: () => Promise<T>,
		maxRetries: number = this.settings.maxRetries,
		baseDelay: number = 1000
	): Promise<T> {
		let lastError: Error = new Error('No attempts made');

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await operation();
			} catch (error) {
				lastError = error as Error;

				// Don't retry on non-retryable errors
				if (error instanceof LeetCodeAPIError && !error.retryable) {
					throw error;
				}

				// Don't retry on the last attempt
				if (attempt === maxRetries) {
					break;
				}

				// Calculate delay with exponential backoff and jitter
				const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
				console.warn(`API request failed (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}. Retrying in ${Math.round(delay)}ms`);
				
				await this.sleep(delay);
			}
		}

		throw new LeetCodeAPIError(
			`Max retries (${maxRetries}) exceeded. Last error: ${lastError.message}`,
			'UNKNOWN',
			undefined,
			false
		);
	}

	private async makeGraphQLRequest(
		query: string,
		variables: any = {}
	): Promise<any> {
		if (!query.trim()) {
			throw new LeetCodeAPIError('GraphQL query cannot be empty', 'UNKNOWN', undefined, false);
		}

		await this.enforceRateLimit();

		return this.exponentialBackoff(async () => {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				"Referer": "https://leetcode.com",
				"Origin": "https://leetcode.com",
				"User-Agent": "Mozilla/5.0 (compatible; LeetFetch/1.0)",
			};

			if (this.settings.sessionToken) {
				headers["Cookie"] = `LEETCODE_SESSION=${this.settings.sessionToken}`;
			}

			try {
				const response = await requestUrl({
					url: this.graphqlURL,
					method: "POST",
					headers,
					body: JSON.stringify({
						query,
						variables,
					}),
					throw: false,
				});

				// Handle different HTTP status codes
				if (response.status === 429) {
					throw new LeetCodeAPIError(
						'Rate limited by LeetCode. Please wait before retrying.',
						'RATE_LIMIT',
						response.status,
						true
					);
				}

				if (response.status === 401 || response.status === 403) {
					throw new LeetCodeAPIError(
						'Authentication failed. Please check your session token.',
						'AUTH',
						response.status,
						false
					);
				}

				if (response.status >= 500) {
					throw new LeetCodeAPIError(
						`LeetCode server error: ${response.status}`,
						'NETWORK',
						response.status,
						true
					);
				}

				if (response.status >= 400) {
					throw new LeetCodeAPIError(
						`HTTP error ${response.status}: ${response.text || 'Unknown error'}`,
						'NETWORK',
						response.status,
						false
					);
				}

				let data;
				try {
					data = JSON.parse(response.text);
				} catch (parseError) {
					throw new LeetCodeAPIError(
						'Invalid JSON response from LeetCode API',
						'NETWORK',
						response.status,
						true
					);
				}

				if (data.errors) {
					const errorMessage = Array.isArray(data.errors) 
						? data.errors.map((e: any) => e.message || e.toString()).join('; ')
						: data.errors.toString();
					
					// Check for specific GraphQL errors
					if (errorMessage.includes('User not found')) {
						throw new LeetCodeAPIError(
							`User '${this.settings.username}' not found. Please check your username.`,
							'NOT_FOUND',
							undefined,
							false
						);
					}

					throw new LeetCodeAPIError(
						`GraphQL errors: ${errorMessage}`,
						'UNKNOWN',
						undefined,
						false
					);
				}

				return data.data;
			} catch (error) {
				if (error instanceof LeetCodeAPIError) {
					throw error;
				}

				// Handle network errors
				if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
					throw new LeetCodeAPIError(
						'Request timeout. Please check your internet connection.',
						'NETWORK',
						undefined,
						true
					);
				}

				if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
					throw new LeetCodeAPIError(
						'Unable to connect to LeetCode. Please check your internet connection.',
						'NETWORK',
						undefined,
						true
					);
				}

				throw new LeetCodeAPIError(
					`Network error: ${error.message}`,
					'NETWORK',
					undefined,
					true
				);
			}
		});
	}

	async fetchUserProfile(): Promise<any> {
		if (!this.settings.username?.trim()) {
			throw new LeetCodeAPIError('Username is required', 'AUTH', undefined, false);
		}

		const query = `
			query getUserProfile($username: String!) {
				matchedUser(username: $username) {
					username
					profile {
						ranking
						userAvatar
						realName
						aboutMe
						school
						websites
						countryName
						company
						jobTitle
						skillTags
						postViewCount
						postViewCountDiff
						reputation
						reputationDiff
						solutionCount
						solutionCountDiff
						categoryDiscussCount
						categoryDiscussCountDiff
					}
					submitStats {
						acSubmissionNum {
							difficulty
							count
							submissions
						}
						totalSubmissionNum {
							difficulty
							count
							submissions
						}
					}
					badges {
						id
						displayName
						icon
						creationDate
					}
				}
			}
		`;

		const data = await this.makeGraphQLRequest(query, {
			username: this.settings.username,
		});

		if (!data.matchedUser) {
			throw new LeetCodeAPIError(
				`User '${this.settings.username}' not found`,
				'NOT_FOUND',
				undefined,
				false
			);
		}

		return data.matchedUser;
	}

	async fetchRecentSubmissions(
		filterProcessed: boolean = true,
		limit?: number
	): Promise<LeetCodeProblem[]> {
		if (!this.settings.username?.trim()) {
			throw new LeetCodeAPIError('Username is required', 'AUTH', undefined, false);
		}

		const submissionLimit = Math.max(1, Math.min(limit || this.settings.recentSubmissionsLimit, 100));

		const query = `
			query recentAcSubmissions($username: String!, $limit: Int!) {
				recentAcSubmissionList(username: $username, limit: $limit) {
					id
					title
					titleSlug
					timestamp
				}
			}
		`;

		const data = await this.makeGraphQLRequest(query, {
			username: this.settings.username,
			limit: submissionLimit
		});

		if (!data.recentAcSubmissionList) {
			return [];
		}

		const problems: LeetCodeProblem[] = [];
		const seenIds = new Set<number>();
		const failedProblems: string[] = [];

		for (const submission of data.recentAcSubmissionList) {
			try {
				const problemDetails = await this.fetchProblemDetails(submission.titleSlug);

				// Skip if already processed
				if (filterProcessed && this.isQuestionProcessed(problemDetails.id)) {
					continue;
				}

				// Skip duplicates within this batch
				if (seenIds.has(problemDetails.id)) {
					continue;
				}

				seenIds.add(problemDetails.id);

				problems.push({
					...problemDetails,
					timestamp: submission.timestamp,
					status: "Solved",
					runtime: "",
					memory: "",
					language: "",
				});

				// Mark as processed
				this.markQuestionProcessed(problemDetails.id);
			} catch (error) {
				failedProblems.push(`${submission.titleSlug}: ${error instanceof Error ? error.message : error}`);
				console.error(`Failed to fetch problem details for ${submission.titleSlug}:`, error);
			}
		}

		if (failedProblems.length > 0 && problems.length === 0) {
			throw new LeetCodeAPIError(
				`Failed to fetch any problem details. Errors: ${failedProblems.join('; ')}`,
				'UNKNOWN',
				undefined,
				true
			);
		}

		if (failedProblems.length > 0) {
			console.warn(`Failed to fetch ${failedProblems.length} problem details out of ${data.recentAcSubmissionList.length} submissions`);
		}

		return problems;
	}

	async fetchAllSubmissions(): Promise<LeetCodeProblem[]> {
		if (!this.settings.sessionToken?.trim()) {
			console.warn("Session token required for all submissions, falling back to recent submissions");
			return this.fetchRecentSubmissions();
		}

		const query = `
			query getSubmissions($offset: Int!, $limit: Int!, $lastKey: String) {
				submissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
					lastKey
					hasNext
					submissions {
						id
						title
						titleSlug
						timestamp
						statusDisplay
						lang
						runtime
						memory
						isPending
					}
				}
			}
		`;

		const problems: LeetCodeProblem[] = [];
		const processedProblems = new Set<string>();
		const failedProblems: string[] = [];
		const limit = 50;
		let offset = 0;
		let hasNext = true;
		let lastKey: string | null = null;
		let consecutiveFailures = 0;
		const maxConsecutiveFailures = 3;

		while (hasNext && consecutiveFailures < maxConsecutiveFailures) {
			try {
				const data: any = await this.makeGraphQLRequest(query, { 
					offset, 
					limit, 
					lastKey 
				});
				
				const page: any = data.submissionList;
				if (!page?.submissions) {
					console.warn('No submissions found in response page');
					break;
				}

				consecutiveFailures = 0; // Reset on successful request

				for (const sub of page.submissions) {
					if (!processedProblems.has(sub.titleSlug) && !sub.isPending) {
						try {
							const problemDetails = await this.fetchProblemDetails(sub.titleSlug);

							problems.push({
								...problemDetails,
								timestamp: sub.timestamp,
								status: sub.statusDisplay === "Accepted" ? "Solved" : "Attempted",
								submissionId: parseInt(sub.id),
								runtime: sub.runtime || "",
								memory: sub.memory || "",
								language: sub.lang || "",
								solution: "",
							});

							processedProblems.add(sub.titleSlug);
						} catch (error) {
							failedProblems.push(`${sub.titleSlug}: ${error instanceof Error ? error.message : error}`);
							console.error(`Failed to fetch problem details for ${sub.titleSlug}:`, error);
						}
					}
				}

				hasNext = page.hasNext;
				lastKey = page.lastKey;
				offset += page.submissions.length;

				// Add delay between batch requests
				if (hasNext) {
					await this.sleep(500);
				}
			} catch (error) {
				consecutiveFailures++;
				console.error(`Failed to fetch submission batch (attempt ${consecutiveFailures}/${maxConsecutiveFailures}):`, error);
				
				if (consecutiveFailures >= maxConsecutiveFailures) {
					throw new LeetCodeAPIError(
						`Failed to fetch submissions after ${maxConsecutiveFailures} consecutive failures. Last error: ${error instanceof Error ? error.message : error}`,
						'UNKNOWN',
						undefined,
						false
					);
				}

				// Wait before retrying
				await this.sleep(2000 * consecutiveFailures);
			}
		}

		if (failedProblems.length > 0) {
			console.warn(`Failed to fetch details for ${failedProblems.length} problems during full sync`);
		}

		return problems.sort((a, b) => b.timestamp - a.timestamp);
	}

	async fetchProblemDetails(
		titleSlug: string
	): Promise<Omit<LeetCodeProblem, "timestamp" | "status">> {
		if (!titleSlug?.trim()) {
			throw new LeetCodeAPIError('Title slug is required', 'UNKNOWN', undefined, false);
		}

		const query = `
			query getProblem($titleSlug: String!) {
				question(titleSlug: $titleSlug) {
					questionId
					title
					titleSlug
					content
					difficulty
					topicTags {
						name
						slug
					}
					hints
					similarQuestions
					exampleTestcases
					metaData
				}
			}
		`;

		const data = await this.makeGraphQLRequest(query, { titleSlug });

		if (!data.question) {
			throw new LeetCodeAPIError(
				`Problem not found: ${titleSlug}`,
				'NOT_FOUND',
				undefined,
				false
			);
		}

		const problem = data.question;

		return {
			id: parseInt(problem.questionId),
			title: problem.title || "Unknown Title",
			titleSlug: titleSlug,
			difficulty: problem.difficulty || "Unknown",
			topics: problem.topicTags?.map((tag: any) => tag.name).filter(Boolean) || [],
			url: `${this.baseURL}/problems/${titleSlug}/`,
			description: this.cleanDescription(problem.content || ""),
			tags: problem.topicTags?.map((tag: any) => `[[${tag.name}]]`).filter(Boolean) || [],
		};
	}

	async fetchSubmissionDetails(
		submissionId: number
	): Promise<LeetCodeSubmissionDetail | undefined> {
		if (!this.settings.sessionToken?.trim()) {
			console.warn("Session token required for submission details");
			return undefined;
		}

		if (!submissionId || submissionId <= 0) {
			throw new LeetCodeAPIError('Valid submission ID is required', 'UNKNOWN', undefined, false);
		}

		const query = `
			query getSubmissionDetails($submissionId: Int!) {
				submissionDetails(submissionId: $submissionId) {
					id
					code
					lang {
						name
					}
					runtime
					memory
					runtimePercentile
					memoryPercentile
					statusDisplay
					timestamp
					totalCorrect
					totalTestcases
				}
			}
		`;

		try {
			const data = await this.makeGraphQLRequest(query, { submissionId });

			if (!data.submissionDetails) {
				return undefined;
			}

			const submission = data.submissionDetails;

			return {
				id: submission.id,
				code: submission.code || "",
				lang: submission.lang?.name || "Unknown",
				runtime: submission.runtime || "",
				memory: submission.memory || "",
				runtimePercentile: submission.runtimePercentile || 0,
				memoryPercentile: submission.memoryPercentile || 0,
				statusDisplay: submission.totalCorrect === submission.totalTestcases ? "Solved" : "Attempted",
				timestamp: submission.timestamp,
			};
		} catch (error) {
			console.error(`Failed to fetch submission details for ${submissionId}:`, error);
			return undefined;
		}
	}

	private cleanDescription(html: string): string {
		if (!html) return "";
		
		return html
			.replace(/<[^>]*>/g, "")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/&nbsp;/g, " ")
			.replace(/\n\s*\n/g, "\n\n")
			.replace(/\[/g, "\\[")
			.replace(/\]/g, "\\]")
			.trim();
	}

	// Helper method to extract topic tags for backlinking
	getTopicTags(topics: string[]): string[] {
		const topicMap: Record<string, string> = {
			"Array": "Arrays",
			"String": "Strings",
			"Hash Table": "Hash Tables",
			"Dynamic Programming": "Dynamic Programming",
			"Two Pointers": "Two Pointers",
			"Sliding Window": "Sliding Window",
			"Binary Search": "Binary Search",
			"Tree": "Trees",
			"Graph": "Graphs",
			"Linked List": "Linked Lists",
			"Stack": "Stack",
			"Queue": "Queue",
			"Heap (Priority Queue)": "Heaps",
			"Trie": "Trie",
			"Backtracking": "Backtracking",
			"Greedy": "Greedy",
			"Bit Manipulation": "Bit Manipulation",
			"Math": "Math",
			"Sorting": "Sorting",
			"Divide and Conquer": "Divide and Conquer",
		};

		return topics
			.filter(topic => topic && typeof topic === 'string')
			.map((topic) => topicMap[topic] || topic);
	}

	// Health check method to verify API connectivity
	async healthCheck(): Promise<{ healthy: boolean; message: string }> {
		try {
			if (!this.settings.username?.trim()) {
				return { healthy: false, message: "Username not configured" };
			}

			// Try a simple query to verify connectivity
			await this.fetchUserProfile();
			return { healthy: true, message: "API connection successful" };
		} catch (error) {
			const message = error instanceof LeetCodeAPIError 
				? error.message 
				: `API health check failed: ${error instanceof Error ? error.message : error}`;
			return { healthy: false, message };
		}
	}
}