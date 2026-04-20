import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Icon from "#components/util/Icon";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import { FormatTables } from "#util/misc";
import React from "react";
import { type ChartDocument, COLOUR_SET } from "tachi-common";

import RatingSystemPart from "./RatingSystemPart";

type USCGame = "usc-controller" | "usc-keyboard";

export default function USCDifficultyCell({ chart }: { chart: ChartDocument<USCGame> }) {
	const game: USCGame = chart.game as USCGame;

	const levelText = chart.data.isOfficial
		? `${chart.difficulty} ${chart.level}`
		: FormatTables(chart.data.tableFolders);

	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[game];

	const bgColour = ChangeOpacity(
		chart.data.isOfficial ? gptImpl.difficultyColours[chart.difficulty]! : COLOUR_SET.teal,
		0.2,
	);

	return (
		<td
			style={{
				backgroundColor: bgColour,
			}}
		>
			<span>{levelText}</span>
			<RatingSystemPart chart={chart} game={game} />
			{!chart.isPrimary && (
				<QuickTooltip tooltipContent="This chart is an alternate, old chart.">
					<div>
						<Icon type="exclamation-triangle" />
					</div>
				</QuickTooltip>
			)}
		</td>
	);
}
