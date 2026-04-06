import { describe, expect, it } from "vitest";

/**
 * POC for docs/security-audit-2026-04-05.md §1.
 *
 * The real handler is GET /api/v1/seeds/collections with ?revision=…
 * (typescript/server/src/server/router/api/v1/seeds/router.ts).
 * It only runs under RequireLocalDevelopment.
 *
 * The implementation builds a shell line like:
 *   PAGER=cat git show '${rev}:seeds/collections' | tail -n +3
 * and passes it to asyncExec (child_process.exec).
 *
 * Only ':' is rejected in revision — not ', ;, $(), etc.
 */
function buildGitShowTreeCommand(rev: string): string {
	return `PAGER=cat git show '${rev}:seeds/collections' | tail -n +3`;
}

describe("POC: seeds revision breaks out of single-quoted git argument (local dev)", () => {
	it("injects shell separators when revision contains a single quote", () => {
		const rev = "x'; id; echo 'y";
		const cmd = buildGitShowTreeCommand(rev);
		// After the first ', the shell runs `; id; echo` before the trailing quote.
		expect(cmd).toContain("'; id;");
	});

	it("shows ':' alone is insufficient to prevent injection", () => {
		const blocked = "abc:def";
		expect(blocked.includes(":")).toBe(true);

		const maliciousNoColon = "x'; whoami; echo 'z";
		expect(maliciousNoColon.includes(":")).toBe(false);
		expect(buildGitShowTreeCommand(maliciousNoColon)).toMatch(/'; whoami;/u);
	});
});
