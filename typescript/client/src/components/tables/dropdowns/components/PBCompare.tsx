import { type UGPTChartPBComposition } from "#types/api-returns";
import React from "react";
import { type ChartDocument, type PBScoreDocument, type ScoreDocument } from "tachi-common";

import { type ScoreState } from "../ScoreDropdown";

export default function PBCompare({
	data,
	scoreState,
	DocComponent,
}: {
	data: UGPTChartPBComposition;
	DocComponent: (props: {
		chart: ChartDocument;
		forceScoreData: boolean;
		pbData: UGPTChartPBComposition;
		score: PBScoreDocument | ScoreDocument;
		scoreState: ScoreState;
	}) => JSX.Element;
	scoreState: ScoreState;
}) {
	return (
		<DocComponent
			chart={data.chart}
			forceScoreData
			pbData={data}
			score={data.pb}
			scoreState={scoreState}
		/>
	);
}
