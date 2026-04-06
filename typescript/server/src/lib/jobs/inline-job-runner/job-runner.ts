import { ACTION_BacksyncBmsPmsSeeds } from "#actions/backsync-bms-pms-seeds";
import { ACTION_BMSTableSync } from "#actions/bms-table-sync";
import { ACTION_UGSSnapshot } from "#actions/ugs-snapshot";
import { ACTION_UpdateBpiData } from "#actions/update-bpi-data";
import { ACTION_UpdateDpTiers } from "#actions/update-dp-tiers";
import { DefaultAdminUser } from "#lib/jobs/default-admin-user";
import { log } from "#lib/log/log";
import { TachiConfig } from "#lib/setup/config";
import { DedupeArr } from "#utils/misc";
import { Queue, Worker } from "bullmq";

import { UpdateAILevels } from "../bms-ai-table-sync";
import { DeorphanScoresMain } from "../deorphan-scores";
import { drainPbDirty, drainScoreRederive } from "../drain-dirty-queues";
import { RebuildFolderChartLookupJob } from "../rebuild-folder-chart-lookup";

interface Job {
	name: string;
	cronFormat: string;
	run: () => Promise<void>;
}

const jobs: Array<Job> = [
	{
		name: "Rebuild folder chart lookup",
		cronFormat: "5 0 * * *",
		run: RebuildFolderChartLookupJob,
	},
	{
		name: "Snapshot User Game Stats",
		cronFormat: "0 0 * * *",
		run: async () => {
			const taker = await DefaultAdminUser.actionTaker();
			await ACTION_UGSSnapshot(taker, {});
		},
	},
	{
		name: "De-Orphan Scores",

		// We run an hour after snapshotting UGS
		// just to spread load out a bit.
		cronFormat: "1 0 * * *",
		run: DeorphanScoresMain,
	},
	{
		name: "Drain pb_dirty",
		cronFormat: "* * * * *",
		run: async () => {
			let drained = 0;

			// Keep draining until the queue is empty or we hit a safety cap.

			while (true) {
				// eslint-disable-next-line no-await-in-loop
				const n = await drainPbDirty();

				if (n === 0) {
					break;
				}

				drained += n;

				if (drained >= 10_000) {
					break;
				}
			}
		},
	},
	{
		name: "Drain score_rederive",
		cronFormat: "*/5 * * * *",
		run: async () => {
			while (true) {
				// eslint-disable-next-line no-await-in-loop
				const n = await drainScoreRederive();

				if (n === 0) {
					break;
				}
			}
		},
	},
];

// if kamaitachi or omnitachi
if (TachiConfig.TYPE !== "boku") {
	jobs.push({
		name: "Update BPI",
		cronFormat: "2 0 * * *",
		run: async () => {
			const taker = await DefaultAdminUser.actionTaker();
			await ACTION_UpdateBpiData(taker, {});
		},
	});

	jobs.push({
		name: "Update DP Tiers",
		cronFormat: "3 0 * * *",
		run: async () => {
			const taker = await DefaultAdminUser.actionTaker();
			await ACTION_UpdateDpTiers(taker, {});
		},
	});
}

// if bokutachi or omnitachi
if (TachiConfig.TYPE !== "kamai") {
	jobs.push({
		name: "Update AI Table",
		cronFormat: "2 0 * * *",
		run: UpdateAILevels,
	});

	jobs.push({
		name: "Update Tables",
		cronFormat: "3 0 * * *",
		run: async () => {
			const taker = await DefaultAdminUser.actionTaker();
			await ACTION_BMSTableSync(taker, {});
		},
	});

	jobs.push({
		name: "Backsync BMS + PMS",
		cronFormat: "4 0 * * *",
		run: async () => {
			const taker = await DefaultAdminUser.actionTaker();
			await ACTION_BacksyncBmsPmsSeeds(taker, {});
		},
	});
}

/**
 * Initalises a tachi-server job runner.
 * This runs the list of jobs defined in jobConfig.jobs.
 */
export function InitialiseJobRunner() {
	log.info(`Booting up Job Runner.`);

	const names = jobs.map((e) => e.name);

	if (DedupeArr(names).length !== names.length) {
		log.fatal(() => {
			process.exit(1);
		}, `Jobs has duplicate name fields, refusing to run.`);
	}

	const JobQueue = new Queue("Job Runner");

	const jobNameMap = new Map<string, Job>();

	for (const job of jobs) {
		void JobQueue.add(job.name, { jobName: job.name }, { repeat: { cron: job.cronFormat } });
		jobNameMap.set(job.name, job);
	}

	const worker = new Worker("Job Runner", async (j) => {
		const { jobName } = j.data as { jobName: string };

		log.info(`Running job ${jobName}.`);

		const jobInfo = jobNameMap.get(jobName);

		if (!jobInfo) {
			log.error(`Unknown job name ${jobName}, couldn't find a run function?`);
			return false;
		}

		await jobInfo.run();

		return true;
	});

	log.info(`Initialised ${jobs.length} jobs (${jobs.map((e) => e.name).join(", ")}).`);

	return worker;
}

if (require.main === module) {
	InitialiseJobRunner();
}
