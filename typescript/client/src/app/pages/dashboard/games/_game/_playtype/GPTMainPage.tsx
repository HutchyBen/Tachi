import Activity from "#components/activity/Activity";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import { type GamePT } from "#types/react";
import React from "react";
import { FormatGameGroup, GetGameGroupConfig } from "tachi-common";

export default function GPTMainPage({ game, playtype }: GamePT) {
	useSetSubheader(
		["Games", GetGameGroupConfig(game).name, playtype],
		[game, playtype],
		FormatGameGroup(game, playtype),
	);

	return <Activity url={`/games/${game}/${playtype}/activity`} />;
}
