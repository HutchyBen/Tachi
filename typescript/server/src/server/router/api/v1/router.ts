import { TypedRouter } from "#lib/router/typed-router";

import { API_V1_SPEC } from "./spec";

export const API_V1_ROUTER = new TypedRouter(API_V1_SPEC);

// this sucks, but there's no "mod" tree in typescript, unlike rust.
await import("./status/router");
await import("./auth/router");
await import("./admin/router");
await import("./import/router");
await import("./imports/router");
await import("./users/router");
await import("./games/router");
await import("./games/@gameSpecificRoutes/bms/router");
await import("./games/@gameSpecificRoutes/iidx/router");
await import("./search/router");
await import("./sessions/router");
await import("./sessions/_sessionID/router");
await import("./oauth/router");
await import("./clients/router");
await import("./activity/router");
await import("./config/router");
await import("./localdev/router");
await import("./seeds/router");
await import("./proposals/router");
await import("./scores/_scoreID/router");

await import("./users/_userID/router");
await import("./users/_userID/pfp/router");
await import("./users/_userID/banner/router");
await import("./users/_userID/api-tokens/router");
await import("./users/_userID/invites/router");
await import("./users/_userID/following/router");
await import("./users/_userID/notifications/router");
await import("./users/_userID/sessions/router");
await import("./users/_userID/imports/router");
await import("./users/_userID/settings/router");
await import("./users/_userID/integrations/router");
await import("./users/_userID/integrations/cg/_cgType/router");
await import("./users/_userID/integrations/kai/_kaiType/router");
await import("./users/_userID/integrations/fervidex/router");
await import("./users/_userID/integrations/kshook-sv6c/router");
await import("./users/_userID/integrations/myt/router");

await import("./users/_userID/games/@gameSpecificRoutes/bms/router");
await import("./users/_userID/games/@gameSpecificRoutes/iidx/router");
await import("./users/_userID/games/@gameSpecificRoutes/jubeat/router");
await import("./users/_userID/games/_game/_playtype/pbs/router");
await import("./users/_userID/games/_game/_playtype/scores/router");
await import("./users/_userID/games/_game/_playtype/sessions/router");
await import("./users/_userID/games/_game/_playtype/tables/router");
await import("./users/_userID/games/_game/_playtype/showcase/router");
await import("./users/_userID/games/_game/_playtype/settings/router");
await import("./users/_userID/games/_game/_playtype/targets/router");
await import("./users/_userID/games/_game/_playtype/targets/goals/router");
await import("./users/_userID/games/_game/_playtype/targets/quests/router");
await import("./users/_userID/games/_game/_playtype/folders/router");
await import("./users/_userID/games/_game/_playtype/folders/_folderSlug/router");
await import("./users/_userID/games/_game/_playtype/router");
await import("./users/_userID/games/_game/_playtype/rivals/router");

const router = API_V1_ROUTER.build();

/**
 * Return a JSON 404 response if an endpoint is hit that does not exist.
 *
 * @name ALL /api/v1/*
 */
router.all("*", (_req, res) =>
	res.status(404).json({
		success: false,
		description: "Endpoint Not Found.",
	}),
);

export default router;
