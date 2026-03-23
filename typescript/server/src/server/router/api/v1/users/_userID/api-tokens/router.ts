import { log } from "#lib/log/log";
import prValidate from "#server/middleware/prudence-validate";
import MONGODB_KILL from "#services/mongo/db";
import { Random20Hex } from "#utils/misc";
import { GetTachiData } from "#utils/req-tachi-data";
import { FormatUserDoc } from "#utils/user";
import { Router } from "express";
import { p } from "prudence";
import { ALL_PERMISSIONS, type APIPermissions, type APITokenDocument } from "tachi-common";

import { RequireSelfRequestFromUser } from "../middleware";

const router: Router = Router({ mergeParams: true });

router.use(RequireSelfRequestFromUser);

/**
 * Retrieve this users API tokens.
 * This request MUST be performed with session-level auth.
 *
 * @name GET /api/v1/users/:userID/api-tokens
 */
router.get("/", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	const keys = await MONGODB_KILL["api-tokens"].find({
		userID: user.id,
	});

	return res.status(200).json({
		success: true,
		description: `Returned ${keys.length} keys.`,
		body: keys,
	});
});

/**
 * Create a new API token.
 *
 * @param clientID - Create a token that has the permissions implied from this client.
 * @param identifier - A user provided string to identify this API Key.
 * @param permissions - An array of strings dictating what permissions to create with.
 * This is incompatible with the first option.
 *
 * @name POST /api/v1/users/:userID/api-tokens/create
 */
router.post(
	"/create",
	prValidate({
		permissions: p.optional([p.isIn(Object.keys(ALL_PERMISSIONS))]),
		identifier: "*string",
		clientID: "*string",
	}),
	async (req, res) => {
		const body = req.safeBody as {
			clientID?: string;
			identifier?: string;
			permissions?: Array<APIPermissions>;
		};

		if (body.clientID !== undefined && body.permissions) {
			return res.status(400).json({
				success: false,
				description: `Cannot use ClientID creation and permissions creation at the same time!`,
			});
		}

		let permissions: Array<APIPermissions>;

		const user = GetTachiData(req, "requestedUser");

		let identifier: string;
		let fromAPIClient = null;

		if (body.clientID !== undefined) {
			const client = await MONGODB_KILL["api-clients"].findOne(
				{
					clientID: body.clientID,
				},
				{
					projection: {
						clientSecret: 0,
					},
				},
			);

			if (!client) {
				return res.status(404).json({
					success: false,
					description: `This client does not exist.`,
				});
			}

			const exists = await MONGODB_KILL["api-tokens"].findOne({
				userID: user.id,
				fromAPIClient: client.clientID,
			});

			if (exists) {
				return res.status(200).json({
					success: true,
					description: `Returned existing key`,
					body: exists,
				});
			}

			permissions = client.requestedPermissions;
			identifier = client.name;
			fromAPIClient = client.clientID;

			log.info(
				`Creating API Key for ${FormatUserDoc(user)} from ${client.name} specification.`,
			);
		} else if (body.permissions) {
			permissions = body.permissions;
			identifier = body.identifier ?? "Custom Token";

			log.info(`Creating API Key for ${FormatUserDoc(user)} with ${permissions.join(", ")}.`);
		} else {
			return res.status(400).json({
				success: false,
				description: `Invalid request, must specify either clientID or permissions.`,
			});
		}

		const permissionsObject = Object.fromEntries(permissions.map((e) => [e, true]));

		const apiTokenDocument: APITokenDocument = {
			identifier,
			permissions: permissionsObject,
			token: Random20Hex(),
			userID: user.id,
			fromAPIClient,
		};

		await MONGODB_KILL["api-tokens"].insert(apiTokenDocument);

		log.info(`Inserted new API Key for ${FormatUserDoc(user)}.`);

		return res.status(200).json({
			success: true,
			description: `Successfully created new API Token.`,
			body: apiTokenDocument,
		});
	},
);

/**
 * Delete this token.
 *
 * @name DELETE /api/v1/users/:userID/api-token/:token
 */
router.delete("/:token", async (req, res) => {
	const user = GetTachiData(req, "requestedUser");

	log.info(`received request from ${FormatUserDoc(user)} to delete token ${req.params.token}.`);

	const token = await MONGODB_KILL["api-tokens"].findOne({
		token: req.params.token,
		userID: user.id,
	});

	if (!token) {
		return res.status(404).json({
			success: false,
			description: `This key does not exist.`,
		});
	}

	await MONGODB_KILL["api-tokens"].remove({ token: req.params.token });

	log.info(`Deleted ${req.params.token}, which belonged to ${FormatUserDoc(user)}.`);

	return res.status(200).json({
		success: true,
		description: `Removed Token.`,
		body: {},
	});
});

export default router;
