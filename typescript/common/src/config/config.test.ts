import { describe, expect, it } from "vitest";

import { allSupportedGameGroups, GetGameGroupConfig, GetGamePTConfig } from "./config";

describe("#GetGameGroupConfig", () => {
	it("defines configs for every supported game group with valid IDs", () => {
		for (const game of allSupportedGameGroups) {
			// i don't feel *that* strongly about this restriction, but game IDs *definitely*
			// can't have things like `:` in them.
			expect(game).toMatch(/^[a-z]+$/u);

			const conf = GetGameGroupConfig(game);

			expect(conf, `'${game}' should have a config defined.`).toBeDefined();
		}
	});
});

const BANNED_METRIC_NAMES = [
	"enumIndexes", // haha
	"optional", // used for optional metrics
	"playcount", // used by showcase stats
	"scoreID",
	"userID",

	// lazily hacked onto folder stat metrics
	"folderID",
	"chartCount",
];

describe("#GetGamePTConfig", () => {
	it("defines playtype configs with consistent rating algs and metrics", () => {
		for (const game of allSupportedGameGroups) {
			const gameConfig = GetGameGroupConfig(game);

			for (const playtype of gameConfig.playtypes) {
				const conf = GetGamePTConfig(game, playtype);

				expect(conf, `'${game}:${playtype}' should have a config defined.`).toBeDefined();
				if (!conf) {
					continue;
				}

				expect(
					conf.scoreRatingAlgs[conf.defaultScoreRatingAlg],
					"The default score rating alg should have an implementation.",
				).toBeTruthy();

				expect(
					conf.sessionRatingAlgs[conf.defaultSessionRatingAlg],
					"The default session rating alg should have an implementation.",
				).toBeTruthy();

				expect(
					conf.profileRatingAlgs[conf.defaultProfileRatingAlg],
					"The default profile rating alg should have an implementation.",
				).toBeTruthy();

				if (conf.difficulties.type === "FIXED") {
					expect(
						conf.difficulties.order.includes(conf.difficulties.default),
						"The default difficulty should be part of difficultyOrder.",
					).toBe(true);
				}

				for (const metric of Object.keys(conf.scoreRatingAlgs)) {
					expect(
						BANNED_METRIC_NAMES.includes(metric),
						`Cannot have a metric called ${metric}. This is a banned metric name.`,
					).toBe(false);

					expect(metric, `Should be alphanumeric.`).toMatch(/^[a-zA-Z][a-zA-Z0-9]+$/u);
				}
			}
		}
	});
});
