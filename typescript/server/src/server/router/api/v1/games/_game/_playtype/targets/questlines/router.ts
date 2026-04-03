import { FindStandaloneQuests, GetGoalsInQuests } from "#lib/targets/quests";
import { GetChildQuests } from "#utils/db";
import { GetQuestlineById, GetQuestlinesForGamePlaytype } from "#utils/queries/questlines";
import { AssignToReqTachiData, GetGPT, GetTachiData } from "#utils/req-tachi-data";
import { type RequestHandler, Router } from "express";

const router: Router = Router({ mergeParams: true });

const ResolveQuestlineID: RequestHandler = async (req, res, next) => {
	const { game, playtype } = GetGPT(req);
	const questlineID = req.params.questlineID;

	const questline = await GetQuestlineById(game, playtype, questlineID);

	if (!questline) {
		return res.status(404).json({
			success: false,
			description: `A questline with ID ${questlineID} doesn't exist.`,
		});
	}

	AssignToReqTachiData(req, { questlineDoc: questline });

	next();
};

/**
 * Retrieve all questlines for this GPT. Also, return any standalone quests.
 *
 * @name GET /api/v1/games/:game/:playtype/targets/questlines
 */
router.get("/", async (req, res) => {
	const { game, playtype } = GetGPT(req);

	const questlines = await GetQuestlinesForGamePlaytype(game, playtype);

	const standalone = await FindStandaloneQuests(game, playtype);
	const standaloneGoals = await GetGoalsInQuests(standalone);

	return res.status(200).json({
		success: true,
		description: `Returned ${questlines.length} questlines.`,
		body: { questlines, standalone, standaloneGoals },
	});
});

/**
 * Retrieve a specific questline.
 *
 * @name GET /api/v1/games/:game/:playtype/targets/questlines/:questlineID
 */
router.get("/:questlineID", ResolveQuestlineID, async (req, res) => {
	const questline = GetTachiData(req, "questlineDoc");

	const quests = await GetChildQuests(questline);

	const goals = await GetGoalsInQuests(quests);

	return res.status(200).json({
		success: true,
		description: `Retrieved questline '${questline.name}'.`,
		body: {
			quests,
			questline,
			goals,
		},
	});
});

export default router;
