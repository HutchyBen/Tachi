import { describe } from "vitest";
import { api } from "./setup";
import { it } from "vitest";

describe("GET /search", () => {
	it("returns identical search results for a query", async () => {
		await api.get("/search").withQuery("?search=freedom").check();
	});
});
