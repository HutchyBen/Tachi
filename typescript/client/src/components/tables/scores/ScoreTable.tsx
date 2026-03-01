import useScoreRatingAlg from "#components/util/useScoreRatingAlg";
import { type ScoreDataset } from "#types/tables";
import { NumericSOV, StrSOV } from "#util/sorts";
import { CreateDefaultScoreSearchParams } from "#util/tables/create-search";
import React, { useState } from "react";
import {
	type AnyScoreRatingAlg,
	type GameGroup,
	type integer,
	type Playtype,
	type ScoreDocument,
} from "tachi-common";

import DifficultyCell from "../cells/DifficultyCell";
import DropdownIndicatorCell from "../cells/DropdownIndicatorCell";
import IndicatorsCell from "../cells/IndicatorsCell";
import TimestampCell from "../cells/TimestampCell";
import TitleCell from "../cells/TitleCell";
import UserCell from "../cells/UserCell";
import DropdownRow from "../components/DropdownRow";
import TachiTable, { type Header } from "../components/TachiTable";
import { useScoreState } from "../components/UseScoreState";
import ScoreDropdown from "../dropdowns/ScoreDropdown";
import ScoreCoreCells from "../game-core-cells/ScoreCoreCells";
import ChartHeader from "../headers/ChartHeader";
import { GetGPTCoreHeaders } from "../headers/GameHeaders";
import IndicatorHeader, { EmptyHeader } from "../headers/IndicatorHeader";

export default function ScoreTable({
	dataset,
	pageLen,
	playtype,
	userCol = false,
	game,
	alg,
	noTopDisplayStr,
	onScoreUpdate,
}: {
	alg?: AnyScoreRatingAlg;
	dataset: ScoreDataset;
	game: GameGroup;
	noTopDisplayStr?: boolean;
	onScoreUpdate?: (sc: ScoreDocument) => void;
	pageLen?: integer;
	playtype: Playtype;
	userCol?: boolean;
}) {
	const defaultRating = useScoreRatingAlg(game, playtype);
	const [rating, setRating] = useState(alg ?? defaultRating);

	const headers: Header<ScoreDataset[0]>[] = [
		ChartHeader(game, (k) => k.__related.chart),
		IndicatorHeader,
		["Song", "Song", StrSOV((x) => x.__related.song.title)],
		...GetGPTCoreHeaders<ScoreDataset>(game, playtype, rating, setRating, (k) => k),
		["Timestamp", "Timestamp", NumericSOV((x) => x.timeAchieved ?? 0)],
		EmptyHeader,
	];

	if (userCol) {
		headers.unshift(["User", "User", StrSOV((x) => x.__related.user.username)]);
	}

	return (
		<TachiTable
			dataset={dataset}
			entryName="Scores"
			headers={headers}
			noTopDisplayStr={noTopDisplayStr}
			pageLen={pageLen}
			rowFunction={(sc) => (
				<Row
					game={game}
					key={sc.scoreID}
					onScoreUpdate={onScoreUpdate}
					playtype={playtype}
					rating={rating as any}
					sc={sc}
					userCol={userCol}
				/>
			)}
			searchFunctions={CreateDefaultScoreSearchParams(game, playtype)}
		/>
	);
}

function Row({
	sc,
	rating,
	playtype,
	userCol,
	game,
	onScoreUpdate,
}: {
	game: GameGroup;
	onScoreUpdate?: (sc: ScoreDocument) => void;
	playtype: Playtype;
	rating: AnyScoreRatingAlg;
	sc: ScoreDataset[0];
	userCol: boolean;
}) {
	const scoreState = useScoreState(sc);

	return (
		<DropdownRow
			dropdown={
				<ScoreDropdown
					chart={sc.__related.chart}
					game={game}
					onScoreUpdate={onScoreUpdate}
					playtype={playtype}
					scoreState={scoreState}
					song={sc.__related.song}
					thisScore={sc}
					user={sc.__related.user}
				/>
			}
		>
			{userCol && <UserCell game={sc.game} playtype={playtype} user={sc.__related.user} />}
			<DifficultyCell chart={sc.__related.chart} game={game} />
			<IndicatorsCell highlight={scoreState.highlight} />
			<TitleCell
				chart={sc.__related.chart}
				comment={scoreState.comment}
				game={game}
				song={sc.__related.song}
			/>
			<ScoreCoreCells chart={sc.__related.chart} game={game} rating={rating} score={sc} />
			<TimestampCell service={sc.service} time={sc.timeAchieved} />
			<DropdownIndicatorCell />
		</DropdownRow>
	);
}
