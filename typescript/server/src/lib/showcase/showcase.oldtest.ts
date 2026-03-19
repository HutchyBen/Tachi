import MONGODB_KILL from "#services/mongo/db";
import { mkFakeGameSettings } from "#test-utils/misc";
import ResetDBState from "#test-utils/resets";
import t from "tap";

import { RemoveStaleFolderShowcaseStats } from "./showcase";

t.test("#RemoveStaleFolderShowcaseStats", (t) => {
	t.beforeEach(ResetDBState);
	t.beforeEach(async () => {
		await MONGODB_KILL["game-settings"].remove({});
		await MONGODB_KILL["game-settings"].insert([
			mkFakeGameSettings(1, "iidx", "SP", {
				preferences: {
					stats: [
						{
							mode: "chart",
							chartID: "foo",
							metric: "grade",
						},
						{
							mode: "folder",
							folderID: "REMOVED_FOLDER",
							gte: 1,
							metric: "lamp",
						},
						{
							mode: "folder",
							folderID: "NORMAL_FOLDER",
							gte: 1,
							metric: "lamp",
						},
					],
				},
			}),
			mkFakeGameSettings(2, "iidx", "SP", {
				preferences: {
					stats: [
						{
							mode: "chart",
							chartID: "foo",
							metric: "grade",
						},
						{
							mode: "folder",
							folderID: "REMOVED_FOLDER",
							gte: 1,
							metric: "lamp",
						},
					],
				},
			}),
		]);
	});

	t.test("Should remove folder stats that refer to unused folders.", async (t) => {
		await RemoveStaleFolderShowcaseStats(["REMOVED_FOLDER"]);

		const dbResult = await MONGODB_KILL["game-settings"].find();

		t.strictSame(
			dbResult.map((e) => e.preferences.stats),
			[
				[
					{
						mode: "chart",
						chartID: "foo",
						metric: "grade",
					},
					{
						mode: "folder",
						folderID: "NORMAL_FOLDER",
						gte: 1,
						metric: "lamp",
					},
				],
				[
					{
						mode: "chart",
						chartID: "foo",
						metric: "grade",
					},
				],
			],
		);

		t.end();
	});

	t.end();
});
