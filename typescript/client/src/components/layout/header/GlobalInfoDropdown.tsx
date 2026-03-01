import DropdownNavLink from "#components/ui/DropdownNavLink";
import QuickDropdown from "#components/ui/QuickDropdown";
import { TachiConfig } from "#lib/config";
import { type SetState } from "#types/react";
import React from "react";
import { FormatGameGroup, GetGameGroupConfig } from "tachi-common";

export default function GlobalInfoDropdown({
	className,
	menuClassName,
	style,
	setState,
}: {
	className?: string;
	menuClassName?: string;
	setState?: SetState<boolean>;
	style?: React.CSSProperties;
}) {
	const links = [];

	for (const game of TachiConfig.GAMES) {
		const gameConfig = GetGameGroupConfig(game);

		for (const playtype of gameConfig.playtypes) {
			links.push(
				<DropdownNavLink
					key={`${game}:${playtype}`}
					onClick={() => setState?.(false)}
					to={`/games/${game}/${playtype}`}
				>
					{FormatGameGroup(game, playtype)}
				</DropdownNavLink>,
			);
		}
	}

	return (
		<QuickDropdown
			caret
			className={`h-14 ${className}`}
			menuClassName={menuClassName}
			menuStyle={style}
			toggle="Global Info"
			variant="clear"
		>
			{links}
		</QuickDropdown>
	);
}
