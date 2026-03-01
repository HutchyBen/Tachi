import type { GoalImportStat, integer, QuestImportStat } from "./types";
import type { Classes, GameGroup, GPTString, Playtypes } from "./types/game-config";

/**
 * An event fired when a users class improves.
 */
export interface WebhookEventClassUpdateV1 {
	type: "class-update/v1";
	content: {
		game: GameGroup;
		new: string;
		old: string | null;
		playtype: Playtypes[GameGroup];
		set: Classes[GPTString];
		userID: integer;
	};
}

/**
 * An event fired when a goal is achieved.
 */
export interface WebhookEventGoalAchievedV1 {
	type: "goals-achieved/v1";
	content: {
		game: GameGroup;
		goals: Array<{
			goalID: string;
			new: GoalImportStat;
			old: GoalImportStat;
			playtype: Playtypes[GameGroup];
		}>;
		userID: integer;
	};
}

/**
 * An event fired when a quest is achieved.
 */
export interface WebhookEventQuestAchievedV1 {
	type: "quest-achieved/v1";
	content: {
		game: GameGroup;
		new: QuestImportStat;
		old: QuestImportStat;
		playtype: Playtypes[GameGroup];
		questID: string;
		userID: integer;
	};
}

/**
 * An event used for debugging. Contains information about the
 * registered client and the server.
 */
export interface WebhookEventStatusV1 {
	type: "status/v1";
	content: {
		clientID: string;
		clientName: string;
		serverVersion: string;
	};
}

export type WebhookEvents =
	| WebhookEventClassUpdateV1
	| WebhookEventGoalAchievedV1
	| WebhookEventQuestAchievedV1;
