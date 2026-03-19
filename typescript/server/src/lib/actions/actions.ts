import DB from "#services/pg/db";
import { type ActionTaker, type AnonActionTaker, MakeActionGuts } from "bliss";
import { type ActionSignature } from "bliss/actions";
import { zodPermission } from "tachi-common";
import { z } from "zod";

const APP_NAME = "TACHI_SERVER";

export type ActionName = keyof typeof ActionSignatures;
export type AnonActionName = keyof typeof AnonActionSignatures;

export const ActionSignatures = {
	NO_OP: {
		input: z.object({}),
		output: z.object({}),
	},
	INSTALL_BUILTIN_CLIENT: {
		input: z.object({
			clientID: z.string(),
			name: z.string(),
			webhookUri: z.url().nullable(),
			redirectUri: z.url().nullable(),
			permissions: z
				.object({
					customise_profile: z.boolean(),
					customise_score: z.boolean(),
					customise_session: z.boolean(),
					delete_score: z.boolean(),
					manage_rivals: z.boolean(),
					manage_targets: z.boolean(),
					submit_score: z.boolean(),
					manage_challenges: z.boolean(),
				})
				.partial(),
			apiKeyTemplate: z.string().nullable(),
			apiKeyFilename: z.string().nullable(),
		}),
		output: z.object({}),
	},
} satisfies Record<string, ActionSignature>;

export const AnonActionSignatures = {
	NO_OP: {
		input: z.object({}),
		output: z.object({}),
	},
} satisfies Record<string, ActionSignature>;

/**
 * Wrap a function in all of the things that make it an action, but this is an action where the user initiating it is not necessarily known.
 */
export function MakeAnonAction<A extends AnonActionName>(
	kind: A,
	fn: AnonActionFn<A>,
): AnonActionFn<A> {
	return MakeActionGuts({
		db: DB,
		appName: APP_NAME,
		kind,
		// @ts-expect-error we're being creative with the types here
		fn,
	}) as AnonActionFn<A>;
}

/**
 * Wrap a function in all of the things that make it an action, including audit logging
 * to the action table.
 */
export function MakeAction<A extends ActionName>(kind: A, fn: ActionFn<A>): ActionFn<A> {
	return MakeActionGuts({
		db: DB,
		appName: APP_NAME,
		kind,
		// @ts-expect-error we're being creative with the types here
		fn,
	}) as ActionFn<A>;
}

type ActionFn<A extends ActionName> = (
	actionTaker: ActionTaker,
	input: z.infer<(typeof ActionSignatures)[A]["input"]>,
) => Promise<z.infer<(typeof ActionSignatures)[A]["output"]>>;

type AnonActionFn<A extends AnonActionName> = (
	actionTaker: AnonActionTaker,
	input: z.infer<(typeof AnonActionSignatures)[A]["input"]>,
) => Promise<z.infer<(typeof AnonActionSignatures)[A]["output"]>>;
