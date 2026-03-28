import Muted from "#components/util/Muted";
import usePreferredRanking from "#components/util/usePreferredRanking";
import useScoreRatingAlg from "#components/util/useScoreRatingAlg";
import { type FolderDataset } from "#types/tables";
import { NumericSOV, StrSOV } from "#util/sorts";
import { CreateDefaultFolderSearchParams } from "#util/tables/create-search";
import React, { useState } from "react";
import {
	type GameGroup,
	type GPTString,
	type MONGO_PBScoreDocument,
	type Playtype,
	type ScoreRatingAlgorithms,
} from "tachi-common";

import DifficultyCell from "../cells/DifficultyCell";
import IndicatorsCell from "../cells/IndicatorsCell";
import RankingCell, { type RankingViewMode } from "../cells/RankingCell";
import TimestampCell from "../cells/TimestampCell";
import TitleCell from "../cells/TitleCell";
import DropdownRow from "../components/DropdownRow";
import TachiTable, { type Header } from "../components/TachiTable";
import { usePBState } from "../components/UseScoreState";
import PBDropdown from "../dropdowns/PBDropdown";
import ScoreCoreCells from "../game-core-cells/ScoreCoreCells";
import ChartHeader from "../headers/ChartHeader";
import { GetGPTCoreHeaders } from "../headers/GameHeaders";
import { EmptyHeader, FolderIndicatorHeader } from "../headers/IndicatorHeader";
import { CreateRankingHeader } from "../headers/RankingHeader";

export default function FolderTable({
	dataset,
	game,
	playtype,
}: {
	dataset: FolderDataset;
	game: GameGroup;
	playtype: Playtype;
}) {
	const defaultRating = useScoreRatingAlg(game, playtype);

	const preferredRanking = usePreferredRanking();

	const [rating, setRating] = useState(defaultRating);
	const [rankingViewMode, setRankingViewMode] = useState<RankingViewMode>(
		preferredRanking ?? "global",
	);

	const headers: Header<FolderDataset[0]>[] = [
		ChartHeader(game, (k) => k),
		FolderIndicatorHeader,
		["Song", "Song", StrSOV((x) => x.__related.song.title)],
		EmptyHeader,
		...GetGPTCoreHeaders<FolderDataset>(
			game,
			playtype,
			rating,
			setRating,
			(x) => x.__related.pb,
		),
		CreateRankingHeader(
			rankingViewMode,
			setRankingViewMode,
			(k) => k.__related.pb?.rankingData,
		),
		["Last Raised", "Last Raised", NumericSOV((x) => x.__related.pb?.timeAchieved ?? 0)],
	];

	return (
		<TachiTable
			dataset={dataset}
			entryName="Charts"
			headers={headers}
			rowFunction={(data) => (
				<Row
					data={data}
					game={game}
					key={data.chartID}
					rankingViewMode={rankingViewMode}
					rating={rating}
				/>
			)}
			searchFunctions={CreateDefaultFolderSearchParams(game, playtype)}
		/>
	);
}

function Row({
	data,
	rating,
	game,
	rankingViewMode,
}: {
	data: FolderDataset[0];
	game: GameGroup;
	rankingViewMode: RankingViewMode;
	rating: ScoreRatingAlgorithms[GPTString];
}) {
	const score = data.__related.pb;

	if (!score) {
		return (
			<tr>
				<DifficultyCell chart={data} game={game} />
				<IndicatorsCell highlight={false} />
				<TitleCell chart={data} game={game} song={data.__related.song} />
				<td colSpan={7}>Not Played.</td>
			</tr>
		);
	}

	return (
		<RowInner
			data={data}
			game={game}
			rankingViewMode={rankingViewMode}
			rating={rating}
			score={score}
		/>
	);
}

function RowInner({
	data,
	game,
	rating,
	rankingViewMode,
	score,
}: {
	data: FolderDataset[0];
	game: GameGroup;
	rankingViewMode: RankingViewMode;
	rating: ScoreRatingAlgorithms[GPTString];
	score: MONGO_PBScoreDocument;
}) {
	// screw the rules of hooks
	const scoreState = usePBState(score);

	return (
		<DropdownRow
			dropdown={
				<PBDropdown
					chart={data}
					game={game}
					playtype={data.playtype}
					scoreState={scoreState}
					song={data.__related.song}
					userID={score.userID}
				/>
			}
		>
			<DifficultyCell chart={data} game={game} />
			<IndicatorsCell highlight={scoreState.highlight} />
			<TitleCell chart={data} game={game} song={data.__related.song} />
			<td>
				<Muted>PB</Muted>
			</td>
			<ScoreCoreCells chart={data} game={game} rating={rating} score={score} />
			<RankingCell
				rankingData={score.rankingData}
				rankingViewMode={rankingViewMode}
				userID={score.userID}
			/>
			<TimestampCell time={score.timeAchieved} />
		</DropdownRow>
	);
}
