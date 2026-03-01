import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type ComparePBsDataset } from "#types/tables";
import { NumericSOV, StrSOV } from "#util/sorts";
import { CreatePBCompareSearchParams } from "#util/tables/create-search";
import React, { useEffect, useState } from "react";
import {
	type GameGroup,
	GetGamePTConfig,
	GetGPTString,
	GetScoreMetricConf,
	type Playtype,
} from "tachi-common";

import DifficultyCell from "../cells/DifficultyCell";
import PBCompareCell from "../cells/PBCompareCell";
import TitleCell from "../cells/TitleCell";
import SelectableCompareType from "../components/SelectableCompareType";
import TachiTable, { type Header, type ZTableTHProps } from "../components/TachiTable";
import ScoreCoreCells from "../game-core-cells/ScoreCoreCells";
import ChartHeader from "../headers/ChartHeader";

export default function ComparePBsTable({
	dataset,
	game,
	playtype,
	baseUser,
	compareUser,
}: {
	baseUser: string;
	compareUser: string;
	dataset: ComparePBsDataset;
	game: GameGroup;
	playtype: Playtype;
}) {
	const gptConfig = GetGamePTConfig(game, playtype);
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, playtype)];

	const [metric, setMetric] = useState<string>(gptConfig.defaultMetric);

	useEffect(() => {
		setMetric(gptConfig.defaultMetric);
	}, [gptConfig]);

	const headers: Header<ComparePBsDataset[0]>[] = [
		ChartHeader(game, (d) => d.chart),
		["Song", "Song", StrSOV((x) => x.song.title)],
		["", "", () => 1, () => <td colSpan={gptImpl.scoreHeaders.length}>{baseUser}</td>],
		[
			"Vs.",
			"Vs.",
			NumericSOV((x) => {
				if (!x.base) {
					return -Infinity;
				}

				if (!x.compare) {
					return Infinity;
				}

				const conf = GetScoreMetricConf(gptConfig, metric);

				if (!conf) {
					return 0; // wut
				}

				if (conf.type === "ENUM") {
					return (
						// @ts-expect-error this will work
						x.base.scoreData.enumIndexes[metric] -
						// @ts-expect-error this will work
						x.compare.scoreData.enumIndexes[metric]
					);
				}

				return (
					// @ts-expect-error this will work
					x.base.scoreData[metric] -
					// @ts-expect-error this will work
					x.compare.scoreData[metric]
				);
			}),
			(thProps: ZTableTHProps) => (
				<SelectableCompareType
					gptConfig={gptConfig}
					key={metric}
					metric={metric}
					setMetric={(e) => {
						setMetric(e);
						thProps.changeSort("Vs.");
					}}
					{...thProps}
				/>
			),
		],
		["", "", () => 1, () => <td colSpan={gptImpl.scoreHeaders.length}>{compareUser}</td>],
	];

	return (
		<TachiTable
			dataset={dataset}
			defaultReverseSort
			defaultSortMode="Vs."
			entryName="Charts"
			headers={headers}
			rowFunction={(data) => <Row data={data} game={game} metric={metric} />}
			searchFunctions={CreatePBCompareSearchParams(game, playtype)}
		/>
	);
}

function Row({
	data,
	game,
	metric,
}: {
	data: ComparePBsDataset[0];
	game: GameGroup;
	metric: string;
}) {
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, data.chart.playtype)];
	const metricConf = GetScoreMetricConf(GetGamePTConfig(game, data.chart.playtype), metric)!;

	return (
		<tr>
			<DifficultyCell alwaysShort chart={data.chart} game={game} />
			<TitleCell chart={data.chart} game={game} song={data.song} />
			{data.base ? (
				<ScoreCoreCells chart={data.chart} game={game} score={data.base} short />
			) : (
				<td colSpan={gptImpl.scoreHeaders.length}>Not Played</td>
			)}
			<PBCompareCell
				base={data.base}
				compare={data.compare}
				game={game}
				metric={metric}
				metricConf={metricConf}
				playtype={data.chart.playtype}
			/>
			{data.compare ? (
				<ScoreCoreCells chart={data.chart} game={game} score={data.compare} short />
			) : (
				<td colSpan={gptImpl.scoreHeaders.length}>Not Played</td>
			)}
		</tr>
	);
}
