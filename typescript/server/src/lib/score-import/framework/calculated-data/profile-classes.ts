import type { ExtractedClasses, GPTString, MONGO_UserGameStats } from "tachi-common";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";

export function CalculateDerivedClasses<GPT extends GPTString>(
	gptString: GPT,
	profileRatings: MONGO_UserGameStats["ratings"],
) {
	return GPT_SERVER_IMPLEMENTATIONS[gptString].classDerivers(profileRatings) as Partial<
		ExtractedClasses[GPT]
	>;
}
