import { describe } from "vitest";
import { api } from "./setup";
import { it } from "vitest";

describe("GET /config/game-support", () => {
	it("returns identical game support config", async () => {
		await api.get("/config/game-support").check();
	});
});
