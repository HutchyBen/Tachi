import { bench, describe } from "vitest";

import { EscapeForILIKE } from "#utils/misc";

/** Representative user search string (wildcards + backslashes) for ILIKE escaping. */
const sampleQuery =
	"artist_%track% " + "word ".repeat(32) + String.raw` \% literal \_ `;

describe("EscapeForILIKE (example)", () => {
	bench("typical search string", () => {
		EscapeForILIKE(sampleQuery);
	});
});
