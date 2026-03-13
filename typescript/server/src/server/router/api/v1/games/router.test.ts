import { TachiConfig } from "#lib/setup/config";
import mockApi from "#test-utils/mock-api";
import { GetGameGroupConfig } from "tachi-common";
import t from "tap";

t.test("GET /api/v1/games", async (t) => {
	// lets just run some basic tests that this contains all of our supported games
	// and also returns configs properly.
	const res = await mockApi.get("/api/v1/games");

	t.strictSame(res.body.body.supportedGames, TachiConfig.GAMES);

	t.hasStrict(
		{
			...res.body.body.configs.iidx,
			// songData doesn't serialise nicely as it has functions on it.
			songData: null,
		},
		{
			...GetGameGroupConfig("iidx"),
			songData: null,
		},
	);
	t.equal(Object.keys(res.body.body.configs).length, TachiConfig.GAMES.length);

	t.end();
});
