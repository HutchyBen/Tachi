import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /users", () => {
	it("returns identical user list", async () => {
		await api.get("/users").check();
	});
});

describe("GET /users/:userID", () => {
	it("user 1 — returns identical user document", async () => {
		await api.get("/users/1").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype", () => {
	it("user 1 iidx/SP — returns identical game stats", async () => {
		await api.get("/users/1/games/iidx/SP").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/scores", () => {
	it("user 1 iidx/SP — returns identical score list", async () => {
		await api.get("/users/1/games/iidx/SP/scores").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/pbs", () => {
	it("user 1 iidx/SP — returns identical PB list", async () => {
		await api.get("/users/1/games/iidx/SP/pbs").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/sessions", () => {
	it("user 1 iidx/SP — returns identical session list", async () => {
		await api.get("/users/1/games/iidx/SP/sessions").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/folders", () => {
	it("user 1 iidx/SP — returns identical folder list", async () => {
		await api.get("/users/1/games/iidx/SP/folders").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/tables", () => {
	it("user 1 iidx/SP — returns identical table list", async () => {
		await api.get("/users/1/games/iidx/SP/tables").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/targets", () => {
	it("user 1 iidx/SP — returns identical targets", async () => {
		await api.get("/users/1/games/iidx/SP/targets").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/rivals", () => {
	it("user 1 iidx/SP — returns identical rival list", async () => {
		await api.get("/users/1/games/iidx/SP/rivals").check();
	});
});

describe("GET /users/:userID/games/:game/:playtype/most-played", () => {
	it("user 1 iidx/SP — returns identical most-played", async () => {
		await api.get("/users/1/games/iidx/SP/most-played").check();
	});
});

describe("GET /users/:userID/imports", () => {
	it("user 1 — returns identical import list", async () => {
		await api.get("/users/1/imports").check();
	});
});
