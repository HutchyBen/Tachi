import { ONE_MINUTE, ONE_SECOND } from "#lib/constants/time";
import { log } from "#lib/logger/log.js";
import { Env } from "#lib/setup/config";
import { GetMillisecondsSince } from "#utils/misc";
import redis from "redis";

log.verbose("Instantiated Redis Store", { bootInfo: true });

export const RedisClient = redis.createClient({
	url: `redis://${Env.REDIS_URL}`,
});

const startConnect = process.hrtime.bigint();

log.verbose("Instantiated Redis Client", { bootInfo: true });

function EmitCritical() {
	/* istanbul ignore next */
	if (!RedisClient.connected) {
		log.fatal(`Could not connect to redis in time. No more information is available.`);

		// can't connect. kill self after 1 second.
		setTimeout(() => {
			process.exit(1);
		}, ONE_SECOND);
	}
}

// awful performance on windows and in test runners mean that connecting to redis can be a
// nearly FIVE minute endeavour!
const ref = setTimeout(EmitCritical, ONE_MINUTE * 5);

RedisClient.on("connect", () => {
	log.info(`Connected to Redis. Took ${GetMillisecondsSince(startConnect)}ms`, {
		bootInfo: true,
	});

	clearTimeout(ref);
});

export function CloseRedisConnection() {
	return new Promise((resolve, reject) => {
		RedisClient.quit((err, reply) => {
			if (err) {
				reject(err);
			} else {
				resolve(reply);
			}
		});
	});
}
