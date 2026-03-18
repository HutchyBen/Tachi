import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /games", () => {
	it("returns identical game list", async () => {
		await api.get("/games").check();
	});
});

describe("GET /games/:game", () => {
	it("iidx — returns identical game info", async () => {
		await api.get("/games/iidx").check();
	});
});

describe("GET /games/:game/:playtype", () => {
	it("iidx/SP — returns identical playtype info", async () => {
		await api.get("/games/iidx/SP").check();
	});
});

describe("GET /games/:game/:playtype/charts", () => {
	it("iidx/SP — returns identical chart list", async () => {
		await api.get("/games/iidx/SP/charts").check();
	});
});

describe("GET /games/:game/:playtype/songs/:songID", () => {
	it("iidx/SP song 1 — returns identical song", async () => {
		await api.get("/games/iidx/SP/songs/1").check();
	});
});

describe("GET /games/:game/:playtype/folders", () => {
	it("iidx/SP — returns identical folder list", async () => {
		await api.get("/games/iidx/SP/folders").check();
	});
});

describe("GET /games/:game/:playtype/tables", () => {
	it("iidx/SP — returns identical table list", async () => {
		await api.get("/games/iidx/SP/tables").check();
	});
});

describe("GET /games/:game/:playtype/targets/goals", () => {
	it("iidx/SP — returns identical goal list", async () => {
		await api.get("/games/iidx/SP/targets/goals").check();
	});
});

describe("GET /games/:game/:playtype/targets/quests", () => {
	it("iidx/SP — returns identical quest list", async () => {
		await api.get("/games/iidx/SP/targets/quests").check();
	});
});

describe("GET /games/:game/:playtype/targets/questlines", () => {
	it("iidx/SP — returns identical questline list", async () => {
		await api.get("/games/iidx/SP/targets/questlines").check();
	});
});
