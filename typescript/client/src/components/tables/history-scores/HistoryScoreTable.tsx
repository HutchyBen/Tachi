import useScoreRatingAlg from "#components/util/useScoreRatingAlg";
import { type ScoreDataset } from "#types/tables";
import { NumericSOV } from "#util/sorts";
import React, { useState } from "react";
import {
	type GameGroup,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_ScoreDocument,
	type Playtype,
	type ScoreRatingAlgorithms,
} from "tachi-common";

import DropdownIndicatorCell from "../cells/DropdownIndicatorCell";
import TimestampCell from "../cells/TimestampCell";
import DropdownRow from "../components/DropdownRow";
import TachiTable from "../components/TachiTable";
import { GraphAndJudgementDataComponent } from "../dropdowns/components/DocumentComponent";
import { GPTDropdownSettings } from "../dropdowns/GPTDropdownSettings";
import ScoreCoreCells from "../game-core-cells/ScoreCoreCells";
import { GetGPTCoreHeaders } from "../headers/GameHeaders";
import { EmptyHeader } from "../headers/IndicatorHeader";

export default function HistoryScoreTable({
	dataset,
	pageLen = 10,
	playtype,
	game,
	chart,
}: {
	chart: MONGO_ChartDocument;
	dataset: MONGO_ScoreDocument[];
	game: GameGroup;
	pageLen?: integer;
	playtype: Playtype;
}) {
	const defaultRating = useScoreRatingAlg(game, playtype);

	const [rating, setRating] = useState(defaultRating);

	const headers = GetGPTCoreHeaders<ScoreDataset>(game, playtype, rating, setRating, (k) => k);

	return (
		<TachiTable
			dataset={dataset as ScoreDataset}
			defaultReverseSort
			defaultSortMode="Timestamp"
			entryName="Scores"
			headers={[
				...headers,
				["Timestamp", "Timestamp", NumericSOV((x) => x.timeAchieved ?? 0)],
				EmptyHeader,
			]}
			noTopDisplayStr
			pageLen={pageLen}
			rowFunction={(sc) => (
				<Row chart={chart} game={game} key={sc.scoreID} rating={rating} sc={sc} />
			)}
		/>
	);
}

function Row({
	sc,
	chart,
	rating,
	game,
}: {
	chart: MONGO_ChartDocument;
	game: GameGroup;
	rating: ScoreRatingAlgorithms[GPTString];
	sc: MONGO_ScoreDocument;
}) {
	return (
		<DropdownRow
			dropdown={
				<GraphAndJudgementDataComponent
					chart={chart}
					score={sc}
					{...{ ...GPTDropdownSettings(game, chart.playtype) }}
				/>
			}
			nested
		>
			<ScoreCoreCells chart={chart} game={game} rating={rating as any} score={sc} />
			<TimestampCell service={sc.service} time={sc.timeAchieved} />
			<DropdownIndicatorCell />
		</DropdownRow>
	);
}
