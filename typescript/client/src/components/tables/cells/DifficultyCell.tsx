import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { ChangeOpacity } from "#util/color-opacity";
import React from "react";
import {
	type ChartDocument,
	FormatDifficulty,
	FormatDifficultyShort,
	type V3Game,
} from "tachi-common";

import BMSOrPMSDifficultyCell from "./BMSOrPMSDifficultyCell";
import ITGDifficultyCell from "./ITGDifficultyCell";
import RatingSystemPart from "./RatingSystemPart";
import USCDifficultyCell from "./USCDifficultyCell";

type BMSGames = "bms-7k" | "bms-14k" | "pms-controller" | "pms-keyboard";

export default function DifficultyCell({
	game,
	chart,
	alwaysShort,
	noTierlist,
}: {
	alwaysShort?: boolean;
	chart: ChartDocument;
	game: V3Game;
	noTierlist?: boolean;
}) {
	if (
		game === "bms-7k" ||
		game === "bms-14k" ||
		game === "pms-controller" ||
		game === "pms-keyboard"
	) {
		return <BMSOrPMSDifficultyCell chart={chart as ChartDocument<BMSGames>} game={game} />;
	} else if (game === "usc-controller" || game === "usc-keyboard") {
		return (
			<USCDifficultyCell chart={chart as ChartDocument<"usc-controller" | "usc-keyboard">} />
		);
	} else if (game === "itg-stamina") {
		return <ITGDifficultyCell chart={chart as ChartDocument<"itg-stamina">} />;
	}

	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[game];

	if (game === "iidx-sp" || game === "iidx-dp" || game === "maimaidx") {
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
			{!alwaysShort && <div className="d-none d-lg-block">{FormatDifficulty(chart)}</div>}
			<div className={!alwaysShort ? "d-lg-none" : ""}>{FormatDifficultyShort(chart)}</div>
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
	game: V3Game;
	level: string;
	levelNum: number;
	prefix?: string;
}) {
	if (game === "chunithm" && level === "" && levelNum === 0) {
		return null;
	}

	if (["chunithm", "maimai", "maimaidx", "ongeki", "wacca"].includes(game)) {
		return (
			<Muted>
				{prefix}
				{levelNum.toFixed(1)}
			</Muted>
		);
	}

	if (levelNum.toString() === level || level.endsWith(".0") || levelNum === 0) {
		return null;
	}

	if (game === "gitadora-gita" || game === "gitadora-dora") {
		return null;
	}

	return (
		<Muted>
			{prefix}
			{levelNum.toString()}
		</Muted>
	);
}
