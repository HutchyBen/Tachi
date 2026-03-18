import { BotConfig } from "#config";
import { PrependTachiUrl } from "#utils/fetch-tachi.js";
import { log } from "#utils/log";
import { GetGameGroupConfig, type integer, type WebhookEventQuestAchievedV1 } from "tachi-common";

import { client } from "../main";
import { GetQuestWithID, GetUserInfo } from "../utils/api-requests";
import { CreateEmbed } from "../utils/embeds";
import { GetGameChannel } from "../utils/misc";

export async function HandleQuestAchievedV1(
	event: WebhookEventQuestAchievedV1["content"],
): Promise<integer> {
	const { game, playtype } = event;

	let channel;

	try {
		channel = GetGameChannel(client, game);
	} catch (e) {
		const err = e as Error;

		log.error({ err }, "ClassUpdate handler failed.");
		return 500;
	}

	const userDoc = await GetUserInfo(event.userID);

	const quest = await GetQuestWithID(event.questID, game, playtype);

	const gameConfig = GetGameGroupConfig(game);
	const shouldShowPlaytype = gameConfig.playtypes.length > 1 ? ` (${playtype})` : "";

	const embed = CreateEmbed(userDoc.id)
		.setThumbnail(PrependTachiUrl(`/users/${userDoc.id}/pfp`))
		.setURL(`${BotConfig.TACHI_SERVER_LOCATION}/u/${userDoc.username}`)
		.setTitle(
			`${userDoc.username} just completed the ${quest.name}${shouldShowPlaytype} quest!`,
		);

	await channel.send({ embeds: [embed] });

	return 200;
}
