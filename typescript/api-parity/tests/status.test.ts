import { describe } from "vitest";
import { api } from "./setup"
import { it } from "vitest";

describe("GET /status", () => {
	it("returns identical responses", async () => {
		// serverTime will always differ between the two parallel calls.
		await api.get("/status").ignoringFields("serverTime").check();
	});

	it("echoes query param identically", async () => {
		await api
			.get("/status")
			.withQuery("?echo=parity-check")
			.ignoringFields("serverTime")
			.check();
	});
});

describe("POST /status", () => {
	it("returns identical responses", async () => {
		await api.post("/status").ignoringFields("serverTime").check();
	});

	it("echoes body param identically", async () => {
		await api
			.post("/status")
			.withBody({ echo: "parity-check" })
			.ignoringFields("serverTime")
			.check();
	});
});
