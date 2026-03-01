// stolen straight from server/src/utils/git.ts
export interface GitCommit {
	sha: string;
	commit: {
		author: {
			date: string;
			email: string;
			name: string;
		};
		committer: {
			date: string;
			email: string;
			name: string;
		};
		message: string;
	};
	parents: Array<{ sha: string }>;
}

export type Revision = { c: GitCommit; repo: string };

export type Branch = { name: string; sha: string };
