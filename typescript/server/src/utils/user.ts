import { ONE_DAY } from "#lib/constants/time";
import { SELECT_USER, ToUserDocument } from "#lib/db-formats/user";
import { SELECT_USER_SETTINGS, ToUserSettingsDocument } from "#lib/db-formats/user-settings";
import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import DB from "#services/pg/db";
import { ISO8601ToUnixMilliseconds } from "#utils/time";
import { type Kysely, sql, type Transaction } from "kysely";
import {
	type APITokenDocument,
	type GameGroup,
	GamePTToV3,
	GetGamePTConfig,
	type GPTString,
	type integer,
	type Playtype,
	type ProfileRatingAlgorithms,
	UserAuthLevels,
	type UserDocument,
	type UserGameStats,
	type UserSettingsDocument,
} from "tachi-common";
import { type Database } from "tachi-db";

import { GetFollowingForUser } from "./queries/settings";

/**
 * Returns a user's username from their ID. Throws if no user with that ID exists.
 */
export async function GetUsernameFromUserID(userID: integer): Promise<string> {
	const username = await DB.selectFrom("account")
		.select("username")
		.where("id", "=", userID)
		.executeTakeFirst()
		.then((res) => res?.username);

	if (!username) {
		throw new Error(`Could not find username for userID ${userID}.`);
	}
	return username;
}

/**
 * Gets a user based on their username case-insensitively.
 */
export function GetUserCaseInsensitive(username: string): Promise<UserDocument | null> {
	return DB.selectFrom("account")
		.select(SELECT_USER)
		.where("normalized_username", "=", username.toLowerCase())
		.executeTakeFirst()
		.then((res) => (res ? ToUserDocument(res) : null));
}

export async function CheckIfEmailInUse(email: string) {
	const exists = await DB.selectFrom("priv_account_credential")
		.where("email", "=", email)
		.executeTakeFirst()
		.then((res) => !!res);

	return exists;
}

export function GetUserPrivateInfo(userID: integer) {
	return DB.selectFrom("priv_account_credential")
		.selectAll()
		.where("user_id", "=", userID)
		.executeTakeFirst();
}

/**
 * Gets a user from their userID.
 */
export function GetUserWithID(userID: integer): Promise<UserDocument | null> {
	return DB.selectFrom("account")
		.select(SELECT_USER)
		.where("id", "=", userID)
		.executeTakeFirst()
		.then((res) => (res ? ToUserDocument(res) : null));
}

export async function GetSettingsForUser(userID: integer): Promise<UserSettingsDocument> {
	const following = await GetFollowingForUser(userID);

	return DB.selectFrom("account_settings")
		.select(SELECT_USER_SETTINGS)
		.where("user_id", "=", userID)
		.executeTakeFirstOrThrow()
		.then((res) => ToUserSettingsDocument(following, res));
}

/**
 * Gets the users for these user IDs.
 */
export async function GetUsersWithIDs(userIDs: Array<integer>) {
	if (userIDs.length === 0) {
		return [];
	}

	const users = await DB.selectFrom("account")
		.select(SELECT_USER)
		.where("id", "in", userIDs)
		.execute()
		.then((rows) => rows.map(ToUserDocument));

	// Note that we should dedupe this by making a set
	// as passing [1, 1, 1] is perfectly legal to this function.
	if (users.length !== new Set(userIDs).size) {
		log.error(
			{ userIDs, users },
			`GetUsersWithIDs was given ${userIDs.length} userIDs, but only matched ${users.length} -- state desync likely.`,
		);
		throw new Error(
			`GetUsersWithIDs was given ${userIDs.length} userIDs, but only matched ${users.length}.`,
		);
	}

	return users;
}

/**
 * Retrieve a user document that is expected to exist.
 * If the user document is not found, a severe error is logged, and this
 * function throws.
 */
export async function GetUserWithIDGuaranteed(userID: integer): Promise<UserDocument> {
	const userDoc = await GetUserWithID(userID);

	if (!userDoc) {
		log.error(
			`User ${userID} does not have an associated user document, but one was expected.`,
		);
		throw new Error(
			`User ${userID} does not have an associated user document, but one was expected.`,
		);
	}

	return userDoc;
}

/**
 * Gets a user based on either their username case-insensitively, or a direct lookup of their ID.
 * This is used in URLs to resolve the passed user.
 */
export function ResolveUser(usernameOrID: string) {
	// user ID passed
	if (/^[0-9]+$/u.exec(usernameOrID)) {
		const intID = Number(usernameOrID);

		return GetUserWithID(intID);
	}

	return GetUserCaseInsensitive(usernameOrID);
}

/**
 * Returns a formatted string indicating the user. This is used for logging.
 */
export function FormatUserDoc(userdoc: UserDocument) {
	return `${userdoc.username} (#${userdoc.id})`;
}

export async function GetUsersRanking(stats: UserGameStats) {
	const gptConfig = GetGamePTConfig(stats.game, stats.playtype);

	const aggRes: [{ _id: null; ranking: integer }] = await MONGODB_KILL["game-stats"].aggregate([
		{
			$match: {
				game: stats.game,
				playtype: stats.playtype,
			},
		},
		{
			$group: {
				_id: null,
				ranking: {
					$sum: {
						$cond: {
							if: {
								$gt: [
									`$ratings.${gptConfig.defaultProfileRatingAlg}`,
									stats.ratings[gptConfig.defaultProfileRatingAlg],
								],
							},
							then: 1,
							else: 0,
						},
					},
				},
			},
		},
	]);

	return aggRes[0].ranking + 1;
}

export function GetUGPTPlaycount(userID: integer, game: GameGroup, playtype: Playtype) {
	const v3Game = GamePTToV3(game, playtype);

	return DB.selectFrom("score")
		.select((eb) => eb.fn.countAll().as("playcount"))
		.where("user_id", "=", userID)
		.where("game", "=", v3Game)
		.executeTakeFirst()
		.then((res) => res?.playcount ?? 0);
}

export async function GetAllRankings(stats: UserGameStats) {
	const gptConfig = GetGamePTConfig(stats.game, stats.playtype);

	const entries = await Promise.all(
		Object.keys(gptConfig.profileRatingAlgs).map((k) =>
			GetUsersRankingAndOutOf(stats, k as ProfileRatingAlgorithms[GPTString]).then((r) => [
				k,
				r,
			]),
		),
	);

	return Object.fromEntries(entries) as Record<
		ProfileRatingAlgorithms[GPTString],
		{ outOf: integer; ranking: integer }
	>;
}

export async function GetUsersRankingAndOutOf(
	stats: UserGameStats,
	alg?: ProfileRatingAlgorithms[GPTString],
) {
	const gptConfig = GetGamePTConfig(stats.game, stats.playtype);
	const ratingAlg = alg ?? gptConfig.defaultProfileRatingAlg;
	const v3Game = GamePTToV3(stats.game, stats.playtype);
	const userRating = stats.ratings[ratingAlg] ?? null;

	const result = await DB.selectFrom("game_stats")
		.select([
			(eb) => eb.fn.countAll().as("out_of"),
			sql<number>`COUNT(*) FILTER (WHERE (ratings->>${ratingAlg})::numeric > ${userRating})`.as(
				"ranking_count",
			),
		])
		.where("game", "=", v3Game)
		.executeTakeFirstOrThrow();

	return {
		ranking: Number(result.ranking_count) + 1,
		outOf: Number(result.out_of),
	};
}

const FIVE_MINUTES = 1000 * 60 * 5;

/**
 * Returns the cutoff point for "being online" in tachi. This means the user
 * has made any page request in the past 5 minutes.
 */
export function GetOnlineCutoff() {
	return Date.now() - FIVE_MINUTES;
}

/**
 * Returns whether a given userID is an administrator or not.
 */
export async function IsRequesterAdmin(request: APITokenDocument) {
	// API Tokens created on the behalf of an admin do NOT inherit admin permissions.
	if (request.token !== null) {
		return false;
	}

	if (request.userID === null) {
		return false;
	}

	const user = await GetUserWithIDGuaranteed(request.userID);

	return user.authLevel === UserAuthLevels.ADMIN;
}

export async function IsUserAdmin(userID: integer) {
	const exists = await DB.selectFrom("account")
		.select("auth_level")
		.where("id", "=", userID)
		.where("auth_level", "=", "admin")
		.executeTakeFirst()
		.then((res) => !!res);

	return exists;
}

/**
 * Return all the GPTs this userID has played.
 */
export async function GetUserPlayedGPTs(userID: integer) {
	const gpts = (await MONGODB_KILL["game-stats"].find(
		{ userID },
		{ projection: { game: 1, playtype: 1 } },
	)) as Array<Pick<UserGameStats, "game" | "playtype">>;

	return gpts;
}

export async function GetAllUserRivals(userID: integer) {
	const rivals = (
		await MONGODB_KILL["game-settings"].find({ userID }, { projection: { rivals: 1 } })
	)
		.map((e) => e.rivals)
		.flat();

	return rivals;
}

const USERNAME_CHANGE_COOLDOWN = ONE_DAY * 180; // 6 months

export async function CanChangeUsername(
	txn: Kysely<Database> | Transaction<Database>,
	userID: integer,
) {
	const nextAvailableChange = await GetNextAvailableUsernameChange(txn, userID);

	return nextAvailableChange === null || nextAvailableChange < Date.now();
}

export async function GetNextAvailableUsernameChange(
	txn: Kysely<Database> | Transaction<Database>,
	userID: integer,
): Promise<integer | null> {
	const lastChange = await txn
		.selectFrom("account_username_change")
		.select("timestamp")
		.where("user_id", "=", userID)
		.orderBy("timestamp", "desc")
		.executeTakeFirst();

	if (!lastChange) {
		return null;
	}

	return ISO8601ToUnixMilliseconds(lastChange.timestamp) + USERNAME_CHANGE_COOLDOWN;
}

/**
 * Get the admin for the instance.
 *
 * This is used for things like builtin clients
 * and "default" admin actions. It would honestly be
 * clearer if there was a sort of "god" user on tachi
 * that was an admin but also just unique.
 *
 * In practice, that's how these things work anyway.
 */
export async function GetFirstAdmin(): Promise<UserDocument> {
	const admin = await DB.selectFrom("account")
		.select(SELECT_USER)
		.where("auth_level", "=", "admin")
		.orderBy("id", "asc")
		.executeTakeFirst();

	if (!admin) {
		throw new Error("There is no admin on this instance of Tachi.");
	}

	return ToUserDocument(admin);
}
