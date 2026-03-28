import type { Classes, GameGroup, GPTString, integer, Playtype } from "tachi-common";

import { ONE_HOUR } from "#lib/constants/time";
import MONGODB_KILL from "#services/mongo/db";
import NodeCache from "node-cache";

const classDistCache = new NodeCache();

export async function GetClassDistribution(
	game: GameGroup,
	playtype: Playtype,
	className: Classes[GPTString],
) {
	const cacheKey = `${game}:${playtype}:${className}`;
	const cache = classDistCache.get<Record<string, integer>>(cacheKey);

	if (!cache) {
		const distribution: Array<{
			_id: string;
			count: integer;
		}> = await MONGODB_KILL["game-stats"].aggregate([
			{
				$match: {
					game,
					playtype,
				},
			},
			{
				$group: {
					_id: `$classes.${className}`,
					count: { $sum: 1 },
				},
			},
		]);

		// Converts {_id: "kaiden", count: 3} to {"kaiden": 3}, more or less.
		const convert = Object.fromEntries(distribution.map((e) => [e._id, e.count]));

		classDistCache.set(cacheKey, convert, ONE_HOUR);

		return convert;
	}

	return cache;
}
