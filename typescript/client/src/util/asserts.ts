import { TachiConfig } from "#lib/config";
import {
	type GameGroup,
	GetGameGroupConfig,
	type GPTString,
	type PBScoreDocument,
	type Playtypes,
	type ScoreDocument,
} from "tachi-common";

export function IsSupportedGame(str: string): str is GameGroup {
	return TachiConfig.GAMES.includes(str as unknown as GameGroup);
}

export function IsSupportedPlaytype<G extends GameGroup = GameGroup>(
	game: G,
	str: string,
): str is Playtypes[G] {
	const gameConfig = GetGameGroupConfig(game);

	return gameConfig.playtypes.includes(str as unknown as Playtypes[G]);
}

export function IsScore<GPT extends GPTString>(
	pbOrScore: PBScoreDocument<GPT> | ScoreDocument<GPT>,
): pbOrScore is ScoreDocument<GPT> {
	// @ts-expect-error thats the test...
	return !!pbOrScore.scoreMeta;
}
