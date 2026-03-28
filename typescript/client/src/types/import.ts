import { type MONGO_ImportDocument } from "tachi-common";

export type ImportStates =
	| { error: string; state: "failed" }
	| { import: MONGO_ImportDocument; state: "done" }
	| { progressInfo: { description: string }; state: "waiting_processing" }
	| { state: "not_started" }
	| { state: "waiting_init" };

export const NotStartedState: ImportStates = { state: "not_started" };
