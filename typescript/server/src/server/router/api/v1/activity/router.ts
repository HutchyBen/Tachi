import { GetRecentActivityForMultipleGames } from "#lib/activity/activity";
import { ALL_GAMES } from "tachi-common";

import { API_V1_ROUTER } from "../router";

/**
 * Retrieve *all* activity across every game on the site.
 *
 * @param session - See CreateActivityRouteHandler
 * @param startTime - See CreateActivityRouteHandler
 */
API_V1_ROUTER.add("GET /activity", async ({ input }) => {
	const data = await GetRecentActivityForMultipleGames(
		ALL_GAMES,
		undefined,
		input.startTime ?? null,
	);

	return {
		success: true,
		description: `Returned global activity.`,
		body: data,
	};
});
