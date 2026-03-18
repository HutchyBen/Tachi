import {
	type AnyProfileRatingAlg,
	type AnyScoreRatingAlg,
	type AnySessionRatingAlg,
	type GameGroup,
	GetGamePTConfig,
	type Playtype,
} from "tachi-common";

import { IsString } from "./misc";

const isIntegerRegex = /^-?\d+$/u;

export function ParseStrPositiveInt(val: unknown) {
	if (!IsString(val)) {
		return null;
	}

	const isInt = isIntegerRegex.test(val);

	if (!isInt) {
		return null;
	}

	const v = Number(val);

	if (!Number.isSafeInteger(v) || v < 0) {
		return null;
	}

	return v;
}

export function ParseStrPositiveNonZeroInt(val: unknown) {
	if (!IsString(val)) {
		return null;
	}

	const isInt = isIntegerRegex.test(val);

	if (!isInt) {
		return null;
	}

	const v = Number(val);

	if (!Number.isSafeInteger(v) || v <= 0) {
		return null;
	}

	return v;
}

export function CheckStrProfileAlg(game: GameGroup, playtype: Playtype, strVal: string) {
	const gptConfig = GetGamePTConfig(game, playtype);

	// @hack
	if (!Object.keys(gptConfig.profileRatingAlgs).includes(strVal as AnyProfileRatingAlg)) {
		return null;
	}

	return strVal as AnyProfileRatingAlg;
}

export function CheckStrScoreAlg(game: GameGroup, playtype: Playtype, strVal: string) {
	const gptConfig = GetGamePTConfig(game, playtype);

	// @hack
	if (!Object.keys(gptConfig.scoreRatingAlgs).includes(strVal as AnyScoreRatingAlg)) {
		return null;
	}

	return strVal as AnyScoreRatingAlg;
}

export function CheckStrSessionAlg(game: GameGroup, playtype: Playtype, strVal: string) {
	const gptConfig = GetGamePTConfig(game, playtype);

	// @hack
	if (!Object.keys(gptConfig.sessionRatingAlgs).includes(strVal as AnySessionRatingAlg)) {
		return null;
	}

	return strVal as AnySessionRatingAlg;
}
