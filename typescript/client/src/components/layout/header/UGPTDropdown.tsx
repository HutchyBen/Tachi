import DropdownNavLink from "#components/ui/DropdownNavLink";
import QuickDropdown from "#components/ui/QuickDropdown";
import { TachiConfig } from "#lib/config";
import { type SetState } from "#types/react";
import React from "react";
import {
	FormatGameGroup,
	GetGameGroupConfig,
	type UserDocument,
	type UserGameStats,
} from "tachi-common";

export default function UGPTDropdown({
	user,
	ugs,
	className,
	menuClassName,
	style,
	setState,
}: {
	className?: string;
	menuClassName?: string;
	setState?: SetState<boolean>;
	style?: React.CSSProperties;
	ugs: UserGameStats[];
	user: UserDocument;
}) {
	const userProfileLinks = [];

	if (user && ugs && ugs.length !== 0) {
		const ugsMap = new Map();
		for (const s of ugs) {
			ugsMap.set(`${s.game}:${s.playtype}`, s);
		}

		for (const game of TachiConfig.GAMES) {
			for (const playtype of GetGameGroupConfig(game).playtypes) {
				const e = ugsMap.get(`${game}:${playtype}`);

				if (!e) {
					continue;
				}

				userProfileLinks.push(
					<DropdownNavLink
						key={`${e.game}:${e.playtype}`}
						onClick={() => {
							setState?.(false);
						}}
						to={`/u/${user.username}/games/${e.game}/${e.playtype}`}
					>
						{FormatGameGroup(e.game, e.playtype)}
					</DropdownNavLink>,
				);
			}
		}
	}

	return (
		<QuickDropdown
			caret
			className={`h-14 ${className}`}
			menuClassName={menuClassName}
			menuStyle={style}
			toggle="Your Profiles"
			variant="clear"
		>
			{userProfileLinks}
		</QuickDropdown>
	);
}
