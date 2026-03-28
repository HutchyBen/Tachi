import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import {
	FormatDifficulty,
	FormatDifficultyShort,
	type GameGroup,
	GetGamePTConfig,
	GetGPTString,
	type MONGO_ChartDocument,
} from "tachi-common";

import BMSOrPMSDifficultyCell from "./BMSOrPMSDifficultyCell";
import ITGDifficultyCell from "./ITGDifficultyCell";
import RatingSystemPart from "./RatingSystemPart";
import USCDifficultyCell from "./USCDifficultyCell";

export default function DifficultyCell({
	game,
	chart,
	alwaysShort,
	noTierlist,
}: {
	alwaysShort?: boolean;
	chart: MONGO_ChartDocument;
	game: GameGroup;
	noTierlist?: boolean;
}) {
	const gptConfig = GetGamePTConfig(game, chart.playtype);

	if (!gptConfig) {
		throw new Error(`Was passed nonsense combination of ${game}, ${chart.playtype}`);
	}

	if (game === "bms" || game === "pms") {
		return (
			<BMSOrPMSDifficultyCell
				chart={
					chart as MONGO_ChartDocument<
						"bms:7K" | "bms:14K" | "pms:Controller" | "pms:Keyboard"
					>
				}
				game={game}
			/>
		);
	} else if (game === "usc") {
		return (
			<USCDifficultyCell
				chart={chart as MONGO_ChartDocument<"usc:Controller" | "usc:Keyboard">}
			/>
		);
	} else if (game === "itg") {
		return <ITGDifficultyCell chart={chart as MONGO_ChartDocument<"itg:Stamina">} />;
	}

	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, chart.playtype)];

	if (game === "iidx" || game === "maimaidx") {
		// IIDX stuff should always be in the form SPA/SPL to save space.
		// For the same reason, maimai DX stuff should be using (DX) EXP/MAS/Re:MAS.
		// All players know what this means.

		alwaysShort = true;
	}

	return (
		<td
			style={{
				// @ts-expect-error yawn
				backgroundColor: ChangeOpacity(gptImpl.difficultyColours[chart.difficulty]!, 0.2),
				minWidth: "80px",
				maxWidth: "100px",
			}}
		>
			{!alwaysShort && (
				<div className="d-none d-lg-block">{FormatDifficulty(chart, game)}</div>
			)}
			<div className={!alwaysShort ? "d-lg-none" : ""}>
				{FormatDifficultyShort(chart, game)}
			</div>
			<DisplayLevelNum game={game} level={chart.level} levelNum={chart.levelNum} />
			{!noTierlist && gptImpl.ratingSystems.length > 0 && (
				<RatingSystemPart chart={chart} game={game} />
			)}
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

export function DisplayLevelNum({
	level,
	levelNum,
	prefix,
	game,
}: {
	game: GameGroup;
	level: string;
	levelNum: number;
	prefix?: string;
}) {
	// Always display 1dp levelNum for these games
	if (["chunithm", "maimai", "maimaidx", "ongeki", "wacca"].includes(game)) {
		return (
			<Muted>
				{prefix}
				{levelNum.toFixed(1)}
			</Muted>
		);
	}

	// Don't display levelnum if its identical to the level, the decimal places in the
	// level end with .0, or the levelNum itself is 0.
	if (levelNum.toString() === level || level.endsWith(".0") || levelNum === 0) {
		return null;
	}

	// or if it's gitadora
	if (game === "gitadora") {
		return null;
	}

	return (
		<Muted>
			{prefix}
			{levelNum.toString()}
		</Muted>
	);
}
