import { IsValidGame, type PBScoreDocument, type ScoreDocument, type V3Game } from "tachi-common";

export function IsSupportedGame(str: string): str is V3Game {
	return IsValidGame(str);
}

export function IsScore<GPT extends V3Game>(
	pbOrScore: PBScoreDocument<GPT> | ScoreDocument<GPT>,
): pbOrScore is ScoreDocument<GPT> {
	// @ts-expect-error thats the test...
	return !!pbOrScore.scoreMeta;
}
