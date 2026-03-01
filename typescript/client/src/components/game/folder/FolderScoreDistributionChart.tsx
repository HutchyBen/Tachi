import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GamePT } from "#types/react";
import { type FolderDataset } from "#types/tables";
import { CountElements, Reverse } from "#util/misc";
import React, { useMemo } from "react";
import { GetGamePTConfig, GetGPTString, GetScoreMetricConf } from "tachi-common";
import { type ConfEnumScoreMetric } from "tachi-common/types/metrics";

import FolderDistributionTable from "./FolderDistributionTable";

type Props = {
	folderDataset: FolderDataset;
	view: string;
} & GamePT;

export default function FolderScoreDistributionChart({
	game,
	playtype,
	folderDataset,
	view: metric,
}: Props) {
	const gptConfig = GetGamePTConfig(game, playtype);
	const conf = GetScoreMetricConf(gptConfig, metric) as ConfEnumScoreMetric<string>;

	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, playtype)];

	const values = useMemo(
		// @ts-expect-error hack
		() => CountElements(folderDataset, (x) => x.__related.pb?.scoreData[metric] ?? null),
		[folderDataset, metric],
	);

	return (
		<div className="row">
			<div className="col-12 col-lg-6 offset-lg-3">
				<FolderDistributionTable
					// @ts-expect-error this will always work
					colours={gptImpl.enumColours[metric]}
					keys={Reverse(conf.values)}
					max={folderDataset.length}
					values={values}
				/>
			</div>
		</div>
	);
}
