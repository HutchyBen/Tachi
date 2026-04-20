import { ACTION_DeleteScore } from "#actions/delete-score";
import { ACTION_DeleteSession } from "#actions/delete-session";
import { ACTION_RebuildFolderChartLookup } from "#actions/rebuild-folder-chart-lookup";
import { ACTION_SetUserSupporterStatus } from "#actions/set-user-supporter-status";
import {
	GetActions,
	GetActiveJobs,
	GetCronTaskExecutions,
	GetCronTasks,
	GetJobQueue,
} from "#lib/admin/admin-queries";
import { SYMBOL_TACHI_API_AUTH } from "#lib/constants/tachi";
import { SendSiteAnnouncementNotification } from "#lib/notifications/notification-wrappers";
import { withAdmin } from "#lib/router/middleware";
import { success } from "#lib/router/typed-router";
import { TachiConfig } from "#lib/setup/config";
import DB from "#services/pg/db";
import { IsValidPlaytype } from "#utils/misc";
import DestroyUserGameProfile from "#utils/reset-state/destroy-user-game-profile";
import { GetUserWithIDGuaranteed, ResolveUser } from "#utils/user";
import { ExpectedErr } from "bliss";
import {
	type GameGroup,
	GameToGameGroup,
	LEGACY_GameGroupPTToGame,
	type LEGACY_Playtype,
	type V3Game,
} from "tachi-common";

import { API_V1_ROUTER } from "../router";

API_V1_ROUTER.add("GET /admin/job-queue", withAdmin, async ({ input }) => {
	const page = Math.max(0, input.page ?? 0);
	const statusRaw = input.status;
	let status: number | undefined;

	if (statusRaw !== undefined && statusRaw !== "") {
		const n = Number.parseInt(statusRaw, 10);

		if (!Number.isNaN(n)) {
			status = n;
		}
	}

	const jobKind =
		input.job_kind !== undefined && input.job_kind !== "" ? input.job_kind : undefined;
	const scope = input.scope !== undefined && input.scope !== "" ? input.scope : undefined;

	const [activeJobs, jobQueue] = await Promise.all([
		GetActiveJobs(),
		GetJobQueue({ job_kind: jobKind, page, scope, status }),
	]);

	return success("Done.", {
		activeJobs,
		filters: { job_kind: jobKind, scope, status },
		jobQueue,
	});
});

API_V1_ROUTER.add("GET /admin/actions", withAdmin, async ({ input }) => {
	const page = Math.max(0, input.page ?? 0);
	const kind = input.kind !== undefined && input.kind !== "" ? input.kind : undefined;
	const username =
		input.username !== undefined && input.username !== "" ? input.username : undefined;

	const actions = await GetActions({ page, kind, username });

	return success("Done.", { actions, filters: { kind, username } });
});

API_V1_ROUTER.add("GET /admin/cron-tasks", withAdmin, async () => {
	const [tasks, executions] = await Promise.all([GetCronTasks(), GetCronTaskExecutions(100)]);

	return success("Done.", { executions, tasks });
});

API_V1_ROUTER.add("POST /admin/resync-pbs", withAdmin, () => {
	throw new ExpectedErr(501, "Not implemented.");
});

API_V1_ROUTER.add("POST /admin/delete-score", withAdmin, async ({ input, req }) => {
	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID!;
	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { acct: { id: adminUser.id, username: adminUser.username }, ip: req.ip };

	await ACTION_DeleteScore(taker, { id: input.scoreID });

	return success("Removed score.", {});
});

API_V1_ROUTER.add("POST /admin/delete-session", withAdmin, async ({ input, req }) => {
	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID!;
	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { acct: { id: adminUser.id, username: adminUser.username }, ip: req.ip };

	await ACTION_DeleteSession(taker, { id: input.sessionID });

	return success("Removed session.", {});
});

API_V1_ROUTER.add("POST /admin/destroy-ugpt", withAdmin, async ({ input }) => {
	const gameGroup = input.game as GameGroup;
	const playtype = input.playtype as LEGACY_Playtype;

	if (!IsValidPlaytype(gameGroup, playtype)) {
		throw new ExpectedErr(400, `Invalid playtype ${playtype} for game ${gameGroup}.`);
	}

	const game = LEGACY_GameGroupPTToGame(gameGroup, playtype);

	const ugpt = await DB.selectFrom("game_profile")
		.where("user_id", "=", input.userID)
		.where("game", "=", game)
		.executeTakeFirst();

	if (!ugpt) {
		throw new ExpectedErr(
			404,
			`No stats for ${input.userID} (${gameGroup} ${playtype}) exist.`,
		);
	}

	await DestroyUserGameProfile(input.userID, gameGroup, playtype);

	return success(`Completely destroyed UGPT for ${input.userID} (${gameGroup} ${playtype}).`, {});
});

API_V1_ROUTER.add("POST /admin/recalc", withAdmin, () => {
	throw new ExpectedErr(501, "Not implemented.");
});

API_V1_ROUTER.add("POST /admin/announcement", withAdmin, async ({ input }) => {
	const game = input.game as V3Game | undefined;

	if (game) {
		if (!TachiConfig.GAME_GROUPS.includes(GameToGameGroup(game))) {
			throw new ExpectedErr(400, `This game is not enabled '${game}'.`);
		}
	}

	await SendSiteAnnouncementNotification(input.title, game);

	return success(`Sent notification '${input.title}'.`, {});
});

API_V1_ROUTER.add("POST /admin/supporter/:userID", withAdmin, async ({ params, req }) => {
	const target = await ResolveUser(params.userID);

	if (!target) {
		throw new ExpectedErr(404, "This user does not exist.");
	}

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID!;
	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { acct: { id: adminUser.id, username: adminUser.username }, ip: req.ip };

	await ACTION_SetUserSupporterStatus(taker, { isSupporter: true, userID: target.id });

	return success("Done.", {});
});

API_V1_ROUTER.add("DELETE /admin/supporter/:userID", withAdmin, async ({ params, req }) => {
	const target = await ResolveUser(params.userID);

	if (!target) {
		throw new ExpectedErr(404, "This user does not exist.");
	}

	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID!;
	const adminUser = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { acct: { id: adminUser.id, username: adminUser.username }, ip: req.ip };

	await ACTION_SetUserSupporterStatus(taker, { isSupporter: false, userID: target.id });

	return success("Done.", {});
});

API_V1_ROUTER.add("POST /admin/rebuild-folder-chart-lookup", withAdmin, async ({ input, req }) => {
	const adminUserID = req[SYMBOL_TACHI_API_AUTH].userID!;
	const user = await GetUserWithIDGuaranteed(adminUserID);
	const taker = { acct: { id: user.id, username: user.username }, ip: req.ip };

	const result = await ACTION_RebuildFolderChartLookup(taker, { folderId: input.folderId });

	return success(
		`Rebuilt folder_chart_lookup (${result.folderCount} folders, ${result.rowCount} rows).`,
		result,
	);
});

API_V1_ROUTER.add("POST /admin/reprocess-all-goals", withAdmin, () => {
	throw new ExpectedErr(501, "Not implemented.");
});
