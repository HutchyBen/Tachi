import { type UGPTChartPBComposition } from "#types/api-returns";
import React from "react";
import {
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
} from "tachi-common";

import { type ScoreState } from "../ScoreDropdown";

export default function PBCompare({
	data,
	scoreState,
	DocComponent,
}: {
	data: UGPTChartPBComposition;
	DocComponent: (props: {
		chart: MONGO_ChartDocument;
		forceScoreData: boolean;
		pbData: UGPTChartPBComposition;
		score: MONGO_PBScoreDocument | MONGO_ScoreDocument;
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
