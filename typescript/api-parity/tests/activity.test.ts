import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /activity", () => {
	it("returns identical global activity feed", async () => {
		await api.get("/activity").check();
	});
});
