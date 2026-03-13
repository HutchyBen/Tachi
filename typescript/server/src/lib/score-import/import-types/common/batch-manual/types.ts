import type { GameGroup, GPTString, Playtype, Versions } from "tachi-common";

export interface BatchManualContext {
	game: GameGroup;
	playtype: Playtype;
	version: Versions[GPTString] | null;
	service: string;
}
