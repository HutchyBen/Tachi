import { ACTION_CreateApiToken } from "#actions/create-api-token.js";
import { ACTION_DeleteApiToken } from "#actions/delete-api-token.js";
import { SELECT_API_TOKEN, ToAPITokenDocument } from "#lib/db-formats/api-token";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireSelfRequestFromUser);

/**
 * Retrieve this user's API tokens.
 * This request MUST be performed with session-level auth.
 *
 * @name GET /api/v1/users/:userID/api-tokens
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const keys = await DB.selectFrom("priv_api_token")
		.select(SELECT_API_TOKEN)
		.where("user_id", "=", user.id)
		.execute();

	return res.status(200).json({
		success: true,
		description: `Returned ${keys.length} keys.`,
		body: keys.map(ToAPITokenDocument),
	});
});

/**
 * Create a new API token.
 *
 * @param clientID - Create a token that has the permissions implied from this client.
 * @param identifier - A user provided string to identify this API Key.
 * @param permissions - An array of strings dictating what permissions to create with.
 * This is incompatible with clientID.
 *
 * @name POST /api/v1/users/:userID/api-tokens/create
 */
router.post("/create", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const body = req.body as {
		clientID?: string;
		identifier?: string;
		permissions?: Array<string>;
	};

	const { token, wasExisting } = await ACTION_CreateApiToken(
		{
			acct: {
				id: user.id,
				username: user.username,
			},
			ip: req.ip,
		},
		{
			clientID: body.clientID,
			permissions: body.permissions,
			identifier: body.identifier,
		},
	);

	const tokenRow = await DB.selectFrom("priv_api_token")
		.select(SELECT_API_TOKEN)
		.where("token", "=", token)
		.executeTakeFirstOrThrow();

	return res.status(200).json({
		success: true,
		description: wasExisting ? "Returned existing key." : "Successfully created new API Token.",
		body: ToAPITokenDocument(tokenRow),
	});
});

/**
 * Delete this token.
 *
 * @name DELETE /api/v1/users/:userID/api-tokens/:token
 */
router.delete("/:token", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	await ACTION_DeleteApiToken(
		{
			acct: {
				id: user.id,
				username: user.username,
			},
			ip: req.ip,
		},
		{ token: req.params.token },
	);

	return res.status(200).json({
		success: true,
		description: `Removed Token.`,
		body: {},
	});
});

export default router;
