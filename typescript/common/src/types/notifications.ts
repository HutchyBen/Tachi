import type { GameGroup, integer, Playtype } from "../types";

export interface BaseNotification {
	title: string;
	notifID: string;

	// The user this notification was sent to.
	sentTo: integer;
	sentAt: integer;
	read: boolean;
}

export type NotificationBody =
	| {
			content: {
				game: GameGroup;
				playtype: Playtype;
				questID: string;
			};
			type: "QUEST_CHANGED"; // Emitted when a quest the user is subscribed to changed.
	  }
	| {
			content: {
				game: GameGroup;
				playtype: Playtype;
				userID: integer;
			};
			type: "RIVALED_BY"; // Emitted when the user is rivalled by someone.
	  }
	| {
			content: Record<string, never>;
			type: "SITE_ANNOUNCEMENT"; // Emitted as a site announcement
	  };
