import type { Playtypes } from "../../../../../../../common/src";

export interface IRUSCContext {
	chartHash: string;
	playtype: Playtypes["usc"];
	timeReceived: number;
}
