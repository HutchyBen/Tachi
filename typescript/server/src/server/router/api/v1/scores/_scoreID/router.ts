import { ACTION_CustomiseScore } from "#actions/customise-score";
import { ACTION_DeleteScore } from "#actions/delete-score.js";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { GetChartsBySongId } from "#lib/db-formats/chart";
import { GetSongByLegacyID } from "#lib/db-formats/song";
import { log } from "#lib/log/log";
import { RequirePermissions } from "#server/middleware/auth";
import prValidate from "#server/middleware/prudence-validate";
import { toPgGame } from "#services/pg/seeds";
import { GetTachiData } from "#utils/req-tachi-data";
import { GetUserWithID } from "#utils/user";
import { Router } from "express";
import { p } from "prudence";

import { GetScoreFromParam, RequireOwnershipOfScoreOrAdmin } from "./middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Deletes the score.
 *
 * @param blacklist - Whether to blacklist this scoreID or not.
 * A blacklisted score will never be reimported.
 *
 * @name DELETE /api/v1/scores/:scoreID
 */
router.delete(
	"/",
	RequirePermissions("delete_score"),
	prValidate({ blacklist: "*boolean" }),
	async (req, res) => {
		const body = req.safeBody as {
			blacklist?: boolean;
		};

		const auth = req[SYMBOL_TACHI_API_AUTH];

		if (auth.userID === null) {
			return res.status(401).json({
				success: false,
				description: `You are not authorised as anyone, and this endpoint requires us to know who you are.`,
			});
		}

		const user = await GetUserWithID(auth.userID);

		if (!user) {
			return res.status(401).json({
				success: false,
				description: `You are not authorised as anyone, and this endpoint requires us to know who you are.`,
			});
		}

		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		await ACTION_DeleteScore(taker, {
			id: req.params.scoreID,
			blacklist: body.blacklist,
		});

		return res.status(200).json({
			success: true,
			description: `Successfully deleted score.`,
			body: {},
		});
	},
);

router.use(GetScoreFromParam);

/**
 * Retrieve the score document at this ID.
 *
 * @param getRelated - Gets the related song and chart document for this score, aswell.
 *
 * @name GET /api/v1/scores/:scoreID
 */
router.get("/", async (req, res) => {
	const score = GetTachiData(req, "scoreDoc");

	if (req.query.getRelated !== undefined) {
		const user = await GetUserWithID(score.userID);

		const songRes = await GetSongByLegacyID(score.game, score.songID);

		const charts =
			songRes === undefined
				? []
				: await GetChartsBySongId(toPgGame(score.game, score.playtype), songRes.newSongID);

		const chart = charts.find((c) => c.chartID === score.chartID);
		const song = songRes?.doc;

		if (!user || !chart || !song) {
			log.error(
				`Score ${
					score.scoreID
				} refers to non-existent data: [user,chart,song] [${!!user} ${!!chart} ${!!song}]`,
			);

			return res.status(500).json({
				success: false,
				description: `An internal server error has occured.`,
			});
		}

		return res.status(200).json({
			success: true,
			description: `Returned score.`,
			body: {
				score,
				user,
				song,
				chart,
			},
		});
	}

	return res.status(200).json({
		success: true,
		description: `Returned score.`,
		body: {
			score,
		},
	});
});

interface ModifiableScoreProps {
	comment?: string | null;
	highlight?: boolean;
}

/**
 * Modifies a score.
 *
 * Requires you to be the owner of this score, and have the modify_scores permission.
 *
 * @name PATCH /api/v1/scores/:scoreID
 */
router.patch(
	"/",
	RequireOwnershipOfScoreOrAdmin,
	RequirePermissions("customise_score"),
	prValidate({
		comment: p.optional(p.nullable(p.isBoundedString(1, 120))),
		highlight: "*boolean",
	}),
	async (req, res) => {
		const body = req.safeBody as {
			comment?: string | null;
			highlight?: boolean;
		};

		const score = GetTachiData(req, "scoreDoc");

		const modifyOption: ModifiableScoreProps = {};

		if (body.comment !== undefined) {
			modifyOption.comment = body.comment;
		}

		if (body.highlight !== undefined) {
			modifyOption.highlight = body.highlight;
		}

		if (Object.keys(modifyOption).length === 0) {
			return res.status(400).json({
				success: false,
				description: `This request modifies nothing about the score.`,
			});
		}

		const auth = req[SYMBOL_TACHI_API_AUTH];

		if (auth.userID === null) {
			return res.status(401).json({
				success: false,
				description: `You are not authorised as anyone, and this endpoint requires us to know who you are.`,
			});
		}

		const user = await GetUserWithID(auth.userID);

		if (!user) {
			return res.status(401).json({
				success: false,
				description: `You are not authorised as anyone, and this endpoint requires us to know who you are.`,
			});
		}

		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const result = await ACTION_CustomiseScore(taker, {
			scoreID: score.scoreID,
			...modifyOption,
		});

		return res.status(200).json({
			success: true,
			description: `Updated score.`,
			body: result.score,
		});
	},
);

export default router;
