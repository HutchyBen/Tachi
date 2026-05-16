import type { Repository } from "@octokit/webhooks-types";

import { App, createNodeMiddleware } from "@octokit/app";
import express from "express";
import { URLSearchParams } from "url";

import { ProcessEnv } from "./config";

const app = new App({
	appId: ProcessEnv.appId,
	privateKey: ProcessEnv.privateKey,
	webhooks: {
		secret: ProcessEnv.webhookSecret,
	},
	oauth: {
		clientId: ProcessEnv.clientID,
		clientSecret: ProcessEnv.clientSecret,
	},
});

/**
 * Create a response that contains a link to the seeds diff viewer on seeds.tachi.ac.
 */
function mkSeedDiffViewMsg(baseSha: string, headSha: string, prNumber: number) {
	const params = new URLSearchParams({
		base: baseSha,
		head: headSha,
		pr: String(prNumber),
	});

	const origin = ProcessEnv.seedsWebuiOrigin.replace(/\/$/u, "");
	return `\nThis pull request changes files under \`db/seeds/\`. [View the seed diff in the Seeds web UI](${origin}/diff?${params.toString()}).`;
}

/**
 * Create a rich comment for quest-proposal PRs, linking to the dedicated
 * quest-preview page on seeds.tachi.ac in addition to the regular diff link.
 */
function mkQuestProposalMsg(baseSha: string, headSha: string, prNumber: number) {
	const origin = ProcessEnv.seedsWebuiOrigin.replace(/\/$/u, "");

	const diffParams = new URLSearchParams({
		base: baseSha,
		head: headSha,
		file: "quests.json",
		pr: String(prNumber),
	});

	const previewUrl = `${origin}/pr/${prNumber}`;
	const diffUrl = `${origin}/diff?${diffParams.toString()}`;

	return `🎯 **Quest Proposal**

This PR was submitted via the Quest Editor.

| | |
|---|---|
| **Preview quests** | [View on Seeds viewer](${previewUrl}) |
| **Seed diff** | [quests.json diff](${diffUrl}) |

_A reviewer will check the content and merge when it looks good. You can update this PR from the Quest Editor at any time._`;
}

function prTouchesSeeds(files: Array<{ filename: string }>): boolean {
	return files.some((k) => k.filename.startsWith("db/seeds/") || k.filename === "db/seeds");
}

async function listAllPullFiles(
	octokit: {
		request: (route: string, params: object) => Promise<{ data: Array<{ filename: string }> }>;
	},
	owner: string,
	repoName: string,
	pullNumber: number,
): Promise<Array<{ filename: string }>> {
	const out: Array<{ filename: string }> = [];
	let page = 1;
	for (;;) {
		// GitHub returns up to 100 files per page; fetch pages sequentially.
		// eslint-disable-next-line no-await-in-loop -- pagination must be sequential
		const { data } = await octokit.request(
			"GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
			{
				owner,
				repo: repoName,
				pull_number: pullNumber,
				per_page: 100,
				page,
			},
		);
		const batch = data;
		out.push(...batch);
		if (batch.length < 100) {
			break;
		}
		page += 1;
	}
	return out;
}

async function sendMsg(message: string, octokit: any, repo: Repository, issue: number) {
	await octokit.request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
		owner: repo.owner.login,
		repo: repo.name,
		issue_number: issue,
		body: message,
	});
}

app.webhooks.on(
	["pull_request.opened", "pull_request.reopened", "pull_request.synchronize"],
	async ({ octokit, payload }) => {
		const repo = payload.repository as Repository;
		const pr = payload.pull_request;
		const isQuestProposal = pr.head.ref.startsWith("quest-proposal/");

		// Quest-proposal PRs get a dedicated preview comment; all other PRs that
		// touch db/seeds/ get the standard seed-diff link.
		if (isQuestProposal) {
			await sendMsg(
				mkQuestProposalMsg(pr.base.sha, pr.head.sha, pr.number),
				octokit,
				repo,
				pr.number,
			);
			return;
		}

		try {
			const filesChanged = await listAllPullFiles(
				octokit,
				repo.owner.login,
				repo.name,
				pr.number,
			);

			if (prTouchesSeeds(filesChanged)) {
				await sendMsg(
					mkSeedDiffViewMsg(pr.base.sha, pr.head.sha, pr.number),
					octokit,
					repo,
					pr.number,
				);
			}
		} catch (err) {
			await sendMsg(
				`I failed horribly figuring out whether this was a seeds diff or not. I'm sorry!

*****
Reason

\`\`\`
${err}
\`\`\`

*****

${mkSeedDiffViewMsg(pr.base.sha, pr.head.sha, pr.number)}`,
				octokit,
				repo,
				pr.number,
			);
		}
	},
);

app.webhooks.on(["pull_request.closed"], async ({ payload }) => {
	const pr = payload.pull_request;

	// Only fire for merged PRs whose branch starts with quest-proposal/
	if (!pr.merged || !pr.head.ref.startsWith("quest-proposal/")) {
		return;
	}

	if (!ProcessEnv.tachiApiOrigin || !ProcessEnv.tachiWebhookSecret) {
		console.warn(
			`Merged quest-proposal PR #${pr.number} but TACHI_API_ORIGIN or TACHI_WEBHOOK_SECRET are not set. Skipping server notification.`,
		);
		return;
	}

	try {
		const res = await fetch(`${ProcessEnv.tachiApiOrigin}/proposals/webhook/merged`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-tachi-webhook-secret": ProcessEnv.tachiWebhookSecret,
			},
			body: JSON.stringify({ prNumber: pr.number }),
		});

		if (!res.ok) {
			console.error(
				`Failed to notify Tachi server of merged PR #${pr.number}: ${res.status} ${res.statusText}`,
			);
		} else {
			console.log(`Notified Tachi server: quest-proposal PR #${pr.number} merged.`);
		}
	} catch (err) {
		console.error(`Error notifying Tachi server of merged PR #${pr.number}:`, err);
	}
});

app.webhooks.on(["issue_comment.created"], async ({ octokit, payload }) => {
	const body = payload.comment.body.trim();

	if (body.startsWith("+bot")) {
		const cmd = body
			.split("\n")[0]!
			.split(/\s+/u)[1]
			?.replace(/[^a-z]/u, "");

		switch (cmd) {
			case "ping": {
				await sendMsg("pong!", octokit, payload.repository as any, payload.issue.number);
				break;
			}

			case "diff": {
				const pr = (
					await octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}", {
						owner: payload.repository.owner.login,
						repo: payload.repository.name,
						pull_number: payload.issue.number,
					})
				).data;

				await sendMsg(
					mkSeedDiffViewMsg(pr.base.sha, pr.head.sha, pr.number),
					octokit,
					payload.repository as any,
					pr.number,
				);
				break;
			}

			default:
				await sendMsg(
					`No idea what to do with command \`${cmd}\`, sorry!`,
					octokit,
					payload.repository as any,
					payload.issue.number,
				);
		}
	}
});

const serverMiddleware = createNodeMiddleware(app);

const expressApp = express();

expressApp.use(serverMiddleware);

expressApp.get("/.deploy/up", (_req, res) => res.sendStatus(200));

console.log(`Listening on port ${ProcessEnv.port}.`);
expressApp.listen(ProcessEnv.port);
