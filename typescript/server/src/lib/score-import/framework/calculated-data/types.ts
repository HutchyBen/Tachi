import type { KtLogger } from "#lib/log/log";
import type { Classes, integer, V3Game } from "tachi-common";

// type RecordClassProvider<GPT extends GPTString> = {
// 	[C in keyof ClassConfigs[GPT] as ClassConfigs[GPT][C] extends ProvidedClassConfig
// 		? C
// 		: never]: ClassConfigs[GPT][C] extends ProvidedClassConfig<infer V> ? V : never;
// };

// couldn't figure out how to get this typesafe, sorry.
type RecordClassProvider<TGame extends V3Game> = Record<Classes[TGame], string>;

export type ClassProvider<TGame extends V3Game> = (
	game: TGame,
	userID: integer,
	ratings: Record<string, number | null>,
	log: KtLogger,
) => Partial<RecordClassProvider<TGame>> | Promise<Partial<RecordClassProvider<TGame>>> | undefined;
