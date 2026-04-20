import QuickTooltip from "#components/layout/misc/QuickTooltip";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GamePT } from "#types/react";
import { UppercaseFirst } from "#util/misc";
import React from "react";
import { Badge } from "react-bootstrap";
import { type Classes, GetGameConfig, type V3Game } from "tachi-common";

export default function ClassBadge<GPT extends V3Game = V3Game>({
	game,
	classSet,
	classValue,
	showSetOnHover = true,
}: {
	classSet: Classes[GPT];
	classValue: string;
	showSetOnHover?: boolean;
} & GamePT) {
	const classStyle =
		// @ts-expect-error complex indexed types
		GPT_CLIENT_IMPLEMENTATIONS[game].classColours[classSet][classValue];

	const data = GetGameConfig(game).classes[classSet].values.find((e) => e.id === classValue);

	if (!data) {
		return (
			<>
				{classSet} {classValue} (messed up!)
			</>
		);
	}

	let badgeComponent;

	if (classStyle === null) {
		badgeComponent = (
			<Badge bg="dark" className="mx-2">
				{data.display}
			</Badge>
		);
	} else if (typeof classStyle === "string") {
		badgeComponent = (
			<Badge bg={classStyle} className="mx-2">
				{data.display}
			</Badge>
		);
	} else {
		badgeComponent = (
			<Badge bg={""} className="mx-2" style={classStyle}>
				{data.display}
			</Badge>
		);
	}

	if (data.hoverText && showSetOnHover) {
		return (
			<QuickTooltip tooltipContent={`${UppercaseFirst(classSet)}: ${data.hoverText}`}>
				{badgeComponent}
			</QuickTooltip>
		);
	} else if (data.hoverText) {
		return <QuickTooltip tooltipContent={data.hoverText}>{badgeComponent}</QuickTooltip>;
	} else if (showSetOnHover) {
		return (
			<QuickTooltip tooltipContent={UppercaseFirst(classSet)}>{badgeComponent}</QuickTooltip>
		);
	}

	return badgeComponent;
}
