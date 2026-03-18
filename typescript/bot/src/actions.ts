import type { GuildMember } from "discord.js";

import pgDb from "#services/pg/db";
import { log } from "#utils/log";
import { type ActionResult } from "tachi-db";
import { z, type ZodObject } from "zod";

export type BotActionName = keyof typeof BotActionInput;

export const BotActionInput = {
	REGISTER: z.object({
		user_id: z.number().int(),
		discord_id: z.string(),
		"!api_token": z.string(),
	}),
	SYNC: z.object({
		import_type: z.string(),
		"!api_token": z.string(),
	}),
	LETMEIN: z.object({
		discord_user_id: z.string(),
		role_id: z.string(),
		"!member": z.custom<GuildMember>(),
	}),
} satisfies Record<string, ZodObject>;

export const BotActionOutput = {
	REGISTER: z.object({ was_update: z.boolean() }),
	SYNC: z.object({
		import_id: z.string(),
		score_count: z.number().int(),
		session_count: z.number().int(),
		error_count: z.number().int(),
		user_id: z.number().int(),
		game: z.string(),
	}),
	LETMEIN: z.object({}),
} satisfies Record<BotActionName, ZodObject>;

export class ExpectedErr extends Error {
	code: number;
	reason: string;
	stamp = "EXPECTED_ERR" as const;

	constructor(code: number, reason: string) {
		super(reason);
		this.code = code;
		this.reason = reason;
	}

	static is(t: unknown): t is ExpectedErr {
		return t instanceof ExpectedErr;
	}
}

// ==> abstract inner bullshit to be refactored out

export interface AcctInfo {
	username: string;
	// n.b. number in tachi, uuid in zenith?
	id: number;
}

// TODO(zk): Somehow pull this out into some sort of
// common "zk" framework - this is used by bot, server,
// zenith, etc.
export interface ActionTaker {
	acct: AcctInfo;
	ip: string | null;
}

type ActionTemplate<A extends BotActionName> = (
	actionTaker: ActionTaker,
	input: z.infer<(typeof BotActionInput)[A]>,
) => Promise<z.infer<(typeof BotActionOutput)[A]>>;

type AnonActionTemplate<A extends BotActionName> = (
	actionTaker: Pick<ActionTaker, "ip">,
	input: z.infer<(typeof BotActionInput)[A]>,
) => Promise<z.infer<(typeof BotActionOutput)[A]>>;

/**
 * Secret input and output fields (keys starting with "!") are stripped before logging.
 */
function OmitPrivate<O extends object>(obj: O) {
	const out: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(obj)) {
		if (key.startsWith("!")) {
			continue;
		}
		out[key] = value;
	}

	return out;
}

/**
 * Wrap a function in all of the things that make it an action, but this is an action where the user initiating it is not necessarily known.
 */
export function MakeAnonAction<A extends BotActionName>(
	kind: A,
	fn: AnonActionTemplate<A>,
): AnonActionTemplate<A> {
	return MakeActionInner(kind, fn) as AnonActionTemplate<A>;
}

/**
 * Wrap a function in all of the things that make it an action, including audit logging
 * to the action table.
 */
export function MakeAction<A extends BotActionName>(
	kind: A,
	fn: ActionTemplate<A>,
): ActionTemplate<A> {
	return MakeActionInner(kind, fn) as ActionTemplate<A>;
}

function MakeActionInner<A extends BotActionName>(
	kind: A,
	fn: ActionTemplate<A> | AnonActionTemplate<A>,
): unknown {
	return async (
		taker: ActionTaker | { ip: string },
		input: z.infer<(typeof BotActionInput)[A]>,
	) => {
		const ts_start = new Date();

		const inputJSON = JSON.stringify(OmitPrivate(input));

		let result: ActionResult;
		let outputJSON = null;
		let retval;
		let err;

		try {
			// @ts-expect-error we're being creative with the types here
			retval = await fn(taker, input);

			outputJSON = JSON.stringify(OmitPrivate(retval ?? {}));
			log.debug(
				{ input: OmitPrivate(input), output: OmitPrivate(retval ?? {}) },
				`Action ${kind} succeeded`,
			);

			result = "GOOD";
		} catch (e) {
			if (ExpectedErr.is(e)) {
				log.info(
					{ code: e.code, input: OmitPrivate(input), reason: e.reason },
					`Action ${kind} failed`,
				);
				outputJSON = JSON.stringify({ code: e.code, reason: e.reason });
				result = "BAD";
			} else {
				log.error({ err: e, input: OmitPrivate(input) }, `Action ${kind} threw`);
				outputJSON = JSON.stringify({ reason: String(e) });
				result = "THROW";
			}

			err = e;
		}

		await pgDb
			.insertInto("action")
			.values({
				app: "BOT",
				kind,
				user_id: "acct" in taker ? taker.acct.id : null,
				ip: taker.ip,
				input: inputJSON,
				output: outputJSON,
				result,
				ts_start: ts_start.toISOString(),
				ts_end: new Date().toISOString(),
			})
			.execute();

		if (err) {
			throw err;
		}

		return retval!;
	};
}
