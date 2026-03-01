import type { GameGroup, GPTString, Playtype, Versions } from "../../../../../../../common/src";

export interface BatchManualContext {
	game: GameGroup;
	playtype: Playtype;
	version: Versions[GPTString] | null;
	service: string;
}
