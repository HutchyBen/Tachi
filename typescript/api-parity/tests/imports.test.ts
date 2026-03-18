import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /imports/:importID", () => {
	// Replace with a real importID from your test dataset.
	const IMPORT_ID = "placeholder-import-id";

	it("returns identical import document", async () => {
		await api.get(`/imports/${IMPORT_ID}`).check();
	});
});
