import { describe } from "vitest";
import { api } from "./setup";
import { it } from "vitest";

describe("GET /sessions/:sessionID", () => {
	// Replace with a real sessionID from your test dataset.
	const SESSION_ID = "placeholder-session-id";

	it("returns identical session document", async () => {
		await api.get(`/sessions/${SESSION_ID}`).check();
	});

	it("returns identical session scores", async () => {
		await api.get(`/sessions/${SESSION_ID}/scores`).check();
	});
});
