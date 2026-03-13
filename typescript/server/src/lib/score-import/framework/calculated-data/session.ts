import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import { type GPTString, type ScoreDocument } from "tachi-common";

/**
 * Create calculated data for a session of this game and playtype.
 * @param scores - All of the scores in this session.
 */
export function CreateSessionCalcData(gpt: GPTString, scores: Array<ScoreDocument>) {
	return GPT_SERVER_IMPLEMENTATIONS[gpt].newSessionCalcs(scores.map((e) => e.calculatedData));
}
