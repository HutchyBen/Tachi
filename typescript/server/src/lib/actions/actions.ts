import DB from "#services/pg/db";
import { type ActionTaker, type AnonActionTaker, MakeActionGuts } from "bliss";
import { type ActionSignature } from "bliss/actions";
import { z } from "zod";

const APP_NAME = "TACHI_SERVER";

export type ActionName = keyof typeof ActionSignatures;
export type AnonActionName = keyof typeof AnonActionSignatures;

export const ActionSignatures = {
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
	RESEND_VERIFY_EMAIL: {
		input: z.object({}),
		output: z.object({}),
	},
	CHANGE_USERNAME: {
		input: z.object({
			newUsername: z.string().regex(/^[a-zA-Z_-][a-zA-Z0-9_-]{2,20}$/u),
			"!password": z.string().min(8),
		}),
		output: z.object({
			prevUsername: z.string(),
			newUsername: z.string(),
		}),
	},
	CHANGE_PASSWORD: {
		input: z.object({
			"!oldPassword": z.string().min(8),
			"!password": z.string().min(8),
		}),
		output: z.object({}),
	},
	CHANGE_EMAIL: {
		input: z.object({
			email: z.email(),
			"!password": z.string().min(8),
		}),
		output: z.object({}),
	},
	CHANGE_PFP: {
		input: z.object({
			"!fileBuffer": z.instanceof(Buffer),
			fileMimetype: z.string(),
		}),
		output: z.object({
			contentHash: z.string(),
		}),
	},
	CHANGE_BANNER: {
		input: z.object({
			"!fileBuffer": z.instanceof(Buffer),
			fileMimetype: z.string(),
		}),
		output: z.object({
			contentHash: z.string(),
		}),
	},
	DELETE_PFP: {
		input: z.object({}),
		output: z.object({}),
	},
	DELETE_BANNER: {
		input: z.object({}),
		output: z.object({}),
	},
	UPDATE_USER: {
		input: z.object({
			about: z.string().optional(),
			status: z.string().nullable().optional(),
			discord: z.string().nullable().optional(),
			twitter: z.string().nullable().optional(),
			github: z.string().nullable().optional(),
			steam: z.string().nullable().optional(),
			youtube: z.string().nullable().optional(),
			twitch: z.string().nullable().optional(),
		}),
		output: z.object({}),
	},
	MARK_ALL_NOTIFICATIONS_READ: {
		input: z.object({}),
		output: z.object({
			markedCount: z.number(),
		}),
	},
	DELETE_ALL_NOTIFICATIONS: {
		input: z.object({}),
		output: z.object({
			deletedCount: z.number(),
		}),
	},
	CREATE_API_TOKEN: {
		input: z.object({
			clientID: z.string().optional(),
			permissions: z.array(z.string()).optional(),
			identifier: z.string().optional(),
		}),
		output: z.object({
			token: z.string(),
			wasExisting: z.boolean(),
		}),
	},
	DELETE_API_TOKEN: {
		input: z.object({
			token: z.string(),
		}),
		output: z.object({}),
	},
	CREATE_API_CLIENT: {
		input: z.object({
			name: z.string().min(3).max(80),
			redirectUri: z.url().nullable(),
			webhookUri: z.url().nullable(),
			apiKeyTemplate: z.string().nullable(),
			apiKeyFilename: z.string().nullable(),
			permissions: z.array(z.string()),
		}),
		output: z.object({
			clientID: z.string(),
			clientSecret: z.string(),
			name: z.string(),
			author: z.number().int(),
			requestedPermissions: z.array(z.string()),
			redirectUri: z.string().nullable(),
			webhookUri: z.string().nullable(),
			apiKeyTemplate: z.string().nullable(),
			apiKeyFilename: z.string().nullable(),
		}),
	},
	UPDATE_API_CLIENT: {
		input: z.object({
			clientID: z.string(),
			name: z.string().min(3).max(80).optional(),
			redirectUri: z.url().nullable().optional(),
			webhookUri: z.url().nullable().optional(),
			apiKeyTemplate: z.string().nullable().optional(),
			apiKeyFilename: z.string().min(3).max(80).nullable().optional(),
		}),
		output: z.object({
			clientID: z.string(),
			clientSecret: z.string(),
			name: z.string(),
			author: z.number().int(),
			requestedPermissions: z.array(z.string()),
			redirectUri: z.string().nullable(),
			webhookUri: z.string().nullable(),
			apiKeyTemplate: z.string().nullable(),
			apiKeyFilename: z.string().nullable(),
		}),
	},
	RESET_API_CLIENT_SECRET: {
		input: z.object({
			clientID: z.string(),
		}),
		output: z.object({
			clientID: z.string(),
			clientSecret: z.string(),
			name: z.string(),
			author: z.number().int(),
			requestedPermissions: z.array(z.string()),
			redirectUri: z.string().nullable(),
			webhookUri: z.string().nullable(),
			apiKeyTemplate: z.string().nullable(),
			apiKeyFilename: z.string().nullable(),
		}),
	},
	DELETE_API_CLIENT: {
		input: z.object({
			clientID: z.string(),
		}),
		output: z.object({}),
	},
	UPDATE_KSHOOK_SV6C_SETTINGS: {
		input: z.object({ forceStaticImport: z.boolean() }),
		output: z.object({ forceStaticImport: z.boolean() }),
	},
} satisfies Record<string, ActionSignature>;

export const AnonActionSignatures = {
	REGISTER: {
		input: z.object({
			email: z.email(),
			"!password": z.string().min(8),
			captcha: z.string(),
			inviteCode: z.string().nullable(),
			username: z.string().min(3).max(20),
		}),
		output: z.object({
			userID: z.number().int(),
		}),
	},
	VERIFY_EMAIL: {
		input: z.object({
			code: z.string(),
		}),
		output: z.object({}),
	},
	FORGOT_PASSWORD: {
		input: z.object({
			email: z.email(),
		}),
		output: z.object({
			silentlyRejected: z.boolean(),
		}),
	},
	RESET_PASSWORD: {
		input: z.object({
			code: z.string(),
			"!password": z.string().min(8),
		}),
		output: z.object({
			userID: z.number().int(),
		}),
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
		inputSchema: AnonActionSignatures[kind].input,
		outputSchema: AnonActionSignatures[kind].output,
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
		inputSchema: ActionSignatures[kind].input,
		outputSchema: ActionSignatures[kind].output,
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
