import Icon from "#components/util/Icon";
import { type SetState } from "#types/react";
import { FormatGPTScoreRatingName, FormatGPTSessionRatingName } from "#util/misc";
import React from "react";
import { type GameGroup, GetGamePTConfig, type GPTString, type Playtypes } from "tachi-common";

import { type ZTableTHProps } from "./TachiTable";

// hack to get everything to work
type AllRatings<_GPT> = any;

export default function SelectableRating<GPT extends GPTString>({
	game,
	playtype,
	rating,
	setRating,
	changeSort,
	currentSortMode,
	reverseSort,
	mode = "score",
}: {
	game: GameGroup;
	mode?: "profile" | "score" | "session";
	playtype: Playtypes[GameGroup];
	rating: AllRatings<GPT>;
	setRating: SetState<AllRatings<GPT>>;
} & ZTableTHProps) {
	const gptConfig = GetGamePTConfig(game, playtype);

	let key: "profileRatingAlgs" | "scoreRatingAlgs" | "sessionRatingAlgs";
	if (mode === "score") {
		key = "scoreRatingAlgs";
	} else if (mode === "profile") {
		key = "profileRatingAlgs";
	} else {
		key = "sessionRatingAlgs";
	}

	return (
		<th>
			<div className="vstack gap-1 align-items-center justify-content-center">
				<select
					className="border-0 text-body fw-bolder bg-transparent rounded focus-ring focus-ring-light"
					onChange={(v) => setRating(v.target.value as AllRatings<GPT>)}
					value={rating}
				>
					{Object.keys(gptConfig[key]).map((s) => (
						<option key={s} value={s}>
							{mode === "session"
								? FormatGPTSessionRatingName(game, playtype, s)
								: FormatGPTScoreRatingName(game, playtype, s)}
						</option>
					))}
				</select>
				<div onClick={() => changeSort("Rating")}>
					<span className="d-flex justify-content-center gap-1">
						<Icon
							className={
								currentSortMode === "Rating" && reverseSort
									? "opacity-100"
									: "opacity-25"
							}
							type="arrow-up"
						/>
						<Icon
							className={
								currentSortMode === "Rating" && !reverseSort
									? "opacity-100"
									: "opacity-25"
							}
							type="arrow-down"
						/>
					</span>
				</div>
			</div>
		</th>
	);
}
