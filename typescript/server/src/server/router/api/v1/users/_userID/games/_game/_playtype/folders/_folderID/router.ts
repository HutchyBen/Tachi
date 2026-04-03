import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db";
import { GetEnumDistForFolder, GetFolderChartsAndSongs, GetPBsOnFolder } from "#utils/folder";
import { GetFolderTimelineScores } from "#utils/queries/scores";
import { GetTachiData, GetUGPT } from "#utils/req-tachi-data";
import { UnixMillisecondsToISO8601 } from "#utils/time";
import { Router } from "express";
import { sql } from "kysely";
import { GetGamePTConfig, GetScoreMetricConf, ValidateMetric } from "tachi-common";

import { GetFolderFromParam } from "../../../../../../../games/_game/_playtype/folders/middleware";
import { RequireSelfRequestFromUser } from "../../../../../middleware";

const router: Router = Router({ mergeParams: true });

router.use(GetFolderFromParam);

/**
 * Returns a users pbs on this folder.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/folders/:folderID
 */
router.get("/", async (req, res) => {
	const { user } = GetUGPT(req);

	const folder = GetTachiData(req, "folderDoc");

	const { songs, charts, pbs } = await GetPBsOnFolder(user.id, folder);

	return res.status(200).json({
		success: true,
		description: `Returned ${pbs.length} pbs.`,
		body: {
			songs,
			charts,
			pbs,
			folder,
		},
	});
});

/**
 * Returns a users stats on this folder.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/folders/:folderID/stats
 */
router.get("/stats", async (req, res) => {
	const { user } = GetUGPT(req);

	const folder = GetTachiData(req, "folderDoc");

	const stats = await GetEnumDistForFolder(user.id, folder);

	return res.status(200).json({
		success: true,
		description: `Returned statistics for ${folder.title}.`,
		body: {
			folder,
			stats,
		},
	});
});

/**
 * Add a folder to the list of recently-viewed folders. This can only
 * be performed by a session-level token, to stop rogue API keys from causing
 * trouble. Also, it's a post request, to avoid funny SSRF stuff.
 *
 * @name POST /api/v1/users/:userID/games/:game/:playtype/folders/:folderID/viewed
 */
router.post("/viewed", RequireSelfRequestFromUser, async (req, res) => {
	const { user } = GetUGPT(req);

	const folder = GetTachiData(req, "folderDoc");

	await DB.insertInto("folder_view")
		.values({
			user_id: user.id,
			folder_id: folder.folderID,
			last_viewed: UnixMillisecondsToISO8601(Date.now()),
		})
		.onConflict((oc) =>
			oc.columns(["user_id", "folder_id"]).doUpdateSet({
				last_viewed: sql`excluded.last_viewed`,
			}),
		)
		.execute();

	return res.status(200).json({
		success: true,
		description: `Recorded a view on ${folder.title}.`,
		body: {},
	});
});

// note: this path is disgustingly long. :(
/**
 * Returns the users scores in order of when they met this criteria.
 *
 * @param criteriaType - Any metric for this GPT.
 * @param criteriaValue - Any valid value for that metric.
 *
 * @name GET /api/v1/users/:userID/games/:game/:playtype/folders/:folderID/timeline
 */
router.get(
	"/timeline",
	prValidate({
		criteriaType: "string",
		criteriaValue: "string",
	}),
	async (req, res) => {
		const { user, game, playtype } = GetUGPT(req);

		const folder = GetTachiData(req, "folderDoc");
		const gptConfig = GetGamePTConfig(game, playtype);

		// as asserted by prudence.
		const metric = req.query.criteriaType as string;

		const conf = GetScoreMetricConf(gptConfig, metric);

		if (!conf || conf.type !== "ENUM") {
			return res.status(400).json({
				success: false,
				description: `Invalid metric '${metric}' passed. Expected an ENUM for this game.`,
			});
		}

		const criteriaValue = conf.values.indexOf(req.query.criteriaValue as string);

		if (criteriaValue === -1) {
			return res.status(400).json({
				success: false,
				description: `Invalid criteriaValue of ${req.query.criteriaValue} for ${metric}.`,
			});
		}

		const { songs, charts } = await GetFolderChartsAndSongs(folder);

		const err = ValidateMetric(gptConfig, metric, criteriaValue);

		if (typeof err === "string") {
			return res.status(400).json({
				success: false,
				description: err,
			});
		}

		const scores = await GetFolderTimelineScores(
			user.id,
			game,
			playtype,
			charts.map((e) => e.chartID),
			metric,
			criteriaValue,
		);

		return res.status(200).json({
			success: true,
			description: `Returned ${scores.length} scores for ${charts.length} charts.`,
			body: {
				songs,
				charts,
				scores,
				folder,
			},
		});
	},
);

export default router;
