import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { type GPTString, type MONGO_ScoreDocument } from "tachi-common";

/**
 * Create calculated data for a session of this game and playtype.
 * @param scores - All of the scores in this session.
 */
export function CreateSessionCalcData(gpt: GPTString, scores: Array<MONGO_ScoreDocument>) {
	return GPT_SERVER_IMPLEMENTATIONS[gpt].sessionCalcs(scores.map((e) => e.calculatedData));
}
