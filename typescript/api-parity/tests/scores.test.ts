import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /scores/:scoreID", () => {
	// Replace with a real scoreID from your test dataset.
	const SCORE_ID = "placeholder-score-id";

	it("returns identical score document", async () => {
		await api.get(`/scores/${SCORE_ID}`).check();
	});

	it("returns identical score document with related data", async () => {
		await api.get(`/scores/${SCORE_ID}/related`).check();
	});
});
