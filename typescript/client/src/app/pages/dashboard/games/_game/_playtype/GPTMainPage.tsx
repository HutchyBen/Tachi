import Activity from "#components/activity/Activity";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import { type GamePT } from "#types/react";
import React from "react";
import { FormatGame, GameToGameGroup, GetGameGroupConfig } from "tachi-common";

export default function GPTMainPage({ game }: GamePT) {
	useSetSubheader(
		["Games", GetGameGroupConfig(GameToGameGroup(game)).name],
		[game],
		FormatGame(game),
	);

	return <Activity url={`/games/${game}/activity`} />;
}
