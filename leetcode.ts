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

export class LeetCodeAPI {
	private settings: any;
	private baseURL = "https://leetcode.com";
	private graphqlURL = "https://leetcode.com/graphql";
	private processedQuestionIds: Set<number> = new Set();

	constructor(settings: any) {
		this.settings = settings;
	}

	updateSettings(settings: any) {
		this.settings = settings;
	}

	async loadProcessedQuestions(logFiles: string[]): Promise<void> {
		this.processedQuestionIds.clear();

		for (const logContent of logFiles) {
			// Extract question IDs from log content using regex
			const questionIdRegex = /(?:id|questionId|question_id):\s*(\d+)/gi;
			const titleSlugRegex =
				/(?:titleSlug|title_slug):\s*["']([^"']+)["']/gi;
			const urlRegex = /https:\/\/leetcode\.com\/problems\/([^\/\s]+)/gi;

			let match;

			// Extract from direct ID references
			while ((match = questionIdRegex.exec(logContent)) !== null) {
				this.processedQuestionIds.add(parseInt(match[1]));
			}

			// Extract from title slugs and convert to IDs
			const titleSlugs = new Set<string>();
			while ((match = titleSlugRegex.exec(logContent)) !== null) {
				titleSlugs.add(match[1]);
			}

			// Extract from URLs
			while ((match = urlRegex.exec(logContent)) !== null) {
				titleSlugs.add(match[1]);
			}

			// Convert title slugs to question IDs
			for (const slug of titleSlugs) {
				try {
					const problem = await this.fetchProblemDetails(slug);
					this.processedQuestionIds.add(problem.id);
				} catch (error) {
					console.warn(
						`Could not resolve title slug ${slug} to question ID:`,
						error
					);
				}
			}
		}

		console.log(
			`Loaded ${this.processedQuestionIds.size} processed question IDs`
		);
	}

	// Check if a question has already been processed
	private isQuestionProcessed(questionId: number): boolean {
		return this.processedQuestionIds.has(questionId);
	}

	// Mark a question as processed
	private markQuestionProcessed(questionId: number): void {
		this.processedQuestionIds.add(questionId);
	}

	private async makeGraphQLRequest(
		query: string,
		variables: any = {}
	): Promise<any> {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Referer: "https://leetcode.com",
			Origin: "https://leetcode.com",
			"User-Agent": "Mozilla/5.0",
		};

		if (this.settings.sessionToken) {
			headers[
				"Cookie"
			] = `LEETCODE_SESSION=${this.settings.sessionToken}`;
		}

		try {
			console.log("GraphQL Request:", {
				url: this.graphqlURL,
				query,
				variables,
				headers,
			});
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

			console.log("GraphQL Response:", response.status, response.text);

			if (response.status >= 400) {
				throw new Error(`GraphQL request failed: ${response.status}`);
			}

			const data = JSON.parse(response.text);

			if (data.errors) {
				throw new Error(
					`GraphQL errors: ${JSON.stringify(data.errors)}`
				);
			}

			return data.data;
		} catch (error) {
			console.error("GraphQL request failed:", error);
			throw error;
		}
	}

	async fetchUserProfile(): Promise<any> {
		if (!this.settings.username) {
			throw new Error("Username is required");
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

		return this.makeGraphQLRequest(query, {
			username: this.settings.username,
		});
	}

	async fetchRecentSubmissions(
		filterProcessed: boolean = true
	): Promise<LeetCodeProblem[]> {
		if (!this.settings.username) {
			throw new Error("Username is required");
		}

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
			username: this.settings.username, limit: 20
		});

		if (!data.recentAcSubmissionList) {
			return [];
		}

		const problems: LeetCodeProblem[] = [];
		const seenIds = new Set<number>();

		for (const submission of data.recentAcSubmissionList) {
			const problemDetails = await this.fetchProblemDetails(
				submission.titleSlug
			);

			// Skip if already processed
			if (
				filterProcessed &&
				this.isQuestionProcessed(problemDetails.id)
			) {
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
		}

		return problems;
	}

	async fetchAllSubmissions(): Promise<LeetCodeProblem[]> {
		if (!this.settings.sessionToken) {
			console.warn(
				"Session token required for all submissions, falling back to recent submissions"
			);
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
		const limit = 100;
        let offset = 0;
		let hasNext = true;
        let lastKey: string | null = null;

		while (hasNext) {
			const data: any = await this.makeGraphQLRequest(query, { offset, limit, lastKey });
            const page: any = data.submissionList;
            if (!page?.submissions) break;

			for (const sub of page.submissions) {
				if (!processedProblems.has(sub.titleSlug)) {
					const problemDetails = await this.fetchProblemDetails(
						sub.titleSlug
					);

					problems.push({
						...problemDetails,
						timestamp: sub.timestamp,
						status:
							sub.statusDisplay === "Accepted"
								? "Solved"
								: "Attempted",
						submissionId: parseInt(sub.id),
						runtime: sub.runtime,
						memory: sub.memory,
						language: sub.lang,
						solution: "",
					});

					processedProblems.add(sub.titleSlug);
				}
			}

			hasNext = page.hasNext;
            lastKey = page.lastKey;
            offset += page.submissions.length;
		}

		return problems.sort((a, b) => b.timestamp - a.timestamp);
	}

	async fetchProblemDetails(
		titleSlug: string
	): Promise<Omit<LeetCodeProblem, "timestamp" | "status">> {
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
			throw new Error(`Problem not found: ${titleSlug}`);
		}

		const problem = data.question;

		return {
			id: parseInt(problem.questionId),
			title: problem.title,
			titleSlug: titleSlug,
			difficulty: problem.difficulty,
			topics: problem.topicTags?.map((tag: any) => tag.name) || [],
			url: `${this.baseURL}/problems/${titleSlug}/`,
			description: this.cleanDescription(problem.content || ""),
			tags: problem.topicTags?.map((tag: any) => `[[${tag.name}]]`) || [],
		};
	}

	async fetchSubmissionDetails(
		submissionId: number
	): Promise<LeetCodeSubmissionDetail | undefined> {
		if (!this.settings.sessionToken) {
			console.warn("Session token required for submission details");
			return undefined;
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
				code: submission.code,
				lang: submission.lang?.name || "Unknown",
				runtime: submission.runtime,
				memory: submission.memory,
				runtimePercentile: submission.runtimePercentile || 0,
				memoryPercentile: submission.memoryPercentile || 0,
				statusDisplay:
					submission.totalCorrect === submission.totalTestcases
						? "Solved"
						: "Attempted",
				timestamp: submission.timestamp,
			};
		} catch (error) {
			console.error(
				`Failed to fetch submission details for ${submissionId}:`,
				error
			);
			return undefined;
		}
	}

	async fetchProblemsByTopic(topic: string): Promise<LeetCodeProblem[]> {
		const query = `
            query getProblemsByTopic($categorySlug: String!, $limit: Int!, $skip: Int!) {
                questionList(
                    categorySlug: $categorySlug
                    limit: $limit
                    skip: $skip
                    filters: { tags: [$topic] }
                ) {
                    total
                    questions {
                        questionId
                        title
                        titleSlug
                        difficulty
                        topicTags {
                            name
                            slug
                        }
                        status
                        paidOnly
                        frontendQuestionId
                    }
                }
            }
        `;

		const data = await this.makeGraphQLRequest(query, {
			categorySlug: "all-code-essentials",
			limit: 50,
			skip: 0,
			topic,
		});

		if (!data.problemsetQuestionList?.questions) {
			return [];
		}

		return data.problemsetQuestionList.questions.map((problem: any) => ({
			id: parseInt(problem.questionId),
			title: problem.title,
			titleSlug: problem.titleSlug,
			difficulty: problem.difficulty,
			topics: problem.topicTags?.map((tag: any) => tag.name) || [],
			url: `${this.baseURL}/problems/${problem.titleSlug}/`,
			status: problem.status || "Todo",
			timestamp: Date.now(),
			tags: problem.topicTags?.map((tag: any) => `[[${tag.name}]]`) || [],
		}));
	}

	async fetchAllProblems(
		options: {
			difficulty?: "EASY" | "MEDIUM" | "HARD";
			tags?: string[];
			limit?: number;
			skip?: number;
		} = {}
	): Promise<LeetCodeProblem[]> {
		const query = `
            query getAllProblems($categorySlug: String!, $limit: Int!, $skip: Int!, $filters: QuestionListFilterInput) {
                problemsetQuestionList: questionList(
                    categorySlug: $categorySlug
                    limit: $limit
                    skip: $skip
                    filters: $filters
                ) {
                    total: totalNum
                    questions: data {
                    acRate
                    difficulty
                    freqBar
                    frontendQuestionId: questionFrontendId
                    paidOnly: isPaidOnly
                    status
                    questionId
                    title
                    titleSlug
                    topicTags {
                        name
                        slug
                    }
                }
            }
        }
        `;

		const filters: any = {};
		if (options.difficulty) {
			filters.difficulty = options.difficulty;
		}
		if (options.tags) {
			filters.tags = options.tags;
		}

		const data = await this.makeGraphQLRequest(query, {
			categorySlug: "all-code-essentials",
			limit: options.limit || 100,
			skip: options.skip || 0,
			filters,
		});

		if (!data.problemsetQuestionList?.questions) {
			return [];
		}

		return data.problemsetQuestionList.questions.map((problem: any) => ({
			id: parseInt(problem.questionId),
			title: problem.title,
			titleSlug: problem.titleSlug,
			difficulty: problem.difficulty,
			topics: problem.topicTags?.map((tag: any) => tag.name) || [],
			url: `${this.baseURL}/problems/${problem.titleSlug}/`,
			status: problem.status || "Todo",
			timestamp: Date.now(),
			tags: problem.topicTags?.map((tag: any) => `[[${tag.name}]]`) || [],
		}));
	}

	private cleanDescription(html: string): string {
		return html
			.replace(/<[^>]*>/g, "")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/\n\s*\n/g, "\n\n")
			.replace(/\[/g, "\\[")
			.replace(/\]/g, "\\]")
			.trim();
	}

	// Helper method to extract topic tags for backlinking
	getTopicTags(topics: string[]): string[] {
		const topicMap: Record<string, string> = {
			Array: "Arrays",
			String: "Strings",
			"Hash Table": "Hash Tables",
			"Dynamic Programming": "Dynamic Programming",
			"Two Pointers": "Two Pointers",
			"Sliding Window": "Sliding Window",
			"Binary Search": "Binary Search",
			Tree: "Trees",
			Graph: "Graphs",
			"Linked List": "Linked Lists",
			Stack: "Stack",
			Queue: "Queue",
			Heap: "Heaps",
			Trie: "Trie",
			Backtracking: "Backtracking",
			Greedy: "Greedy",
			"Bit Manipulation": "Bit Manipulation",
			Math: "Math",
			Sort: "Sorting",
			"Divide and Conquer": "Divide and Conquer",
		};

		return topics.map((topic) => topicMap[topic] || topic);
	}
}
