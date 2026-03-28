import { ACTION_CreateApiClient } from "#actions/create-api-client";
import { ACTION_DeleteApiClient } from "#actions/delete-api-client";
import { ACTION_ResetApiClientSecret } from "#actions/reset-api-client-secret";
import { ACTION_UpdateApiClient } from "#actions/update-api-client";
import { SELECT_API_CLIENT, ToAPIClientDocument } from "#lib/db-formats/api-client";
import prValidate from "#server/middleware/prudence-validate";
import DB from "#services/pg/db";
import { GetTachiData } from "#utils/req-tachi-data";
import { Router } from "express";
import { p } from "prudence";
import { ALL_PERMISSIONS, type APIPermissions } from "tachi-common";

import { GetClientFromID } from "./middleware";

const router: Router = Router({ mergeParams: true });

/**
 * Retrieve the clients you created. Must be performed with a session-level request.
 *
 * @warn This also returns the client_secrets! Those *have* to be kept secret.
 *
 * @name GET /api/v1/clients
 */
router.get("/", async (req, res) => {
	const user = req.session.tachi?.user;

	if (!user) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated (for a session-level request, atleast).`,
		});
	}

	const rows = await DB.selectFrom("priv_api_client")
		.select(SELECT_API_CLIENT)
		.where("author", "=", user.id)
		.execute();

	const clients = rows.map(ToAPIClientDocument);

	return res.status(200).json({
		success: true,
		description: `Returned ${clients.length} clients.`,
		body: clients,
	});
});

/**
 * Create a new API Client. Requires session-level auth.
 *
 * @param name - A string that identifies this client.
 * @param redirectUri - The redirectUri this client uses.
 * @param webhookUri - Optionally, a webhookUri to call with webhook events.
 * @param apiKeyTemplate - Optionally, a static format to apply when doing static auth.
 * @param apiKeyFilename - Optionally, a filename to automatically download the template to, when doing
 * static flow.
 * @param permissions - An array of APIPermissions this client is expected to use.
 *
 * @name POST /api/v1/clients/create
 */
router.post(
	"/create",
	prValidate({
		name: p.isBoundedString(3, 80),
		redirectUri: "?string",
		webhookUri: "?string",
		apiKeyTemplate: "?string",
		apiKeyFilename: "?string",
		permissions: [p.isIn(Object.keys(ALL_PERMISSIONS))],
	}),
	async (req, res) => {
		const user = req.session.tachi?.user;

		if (!user) {
			return res.status(401).json({
				success: false,
				description: `You are not authenticated.`,
			});
		}

		const body = req.safeBody as {
			apiKeyFilename: string | null;
			apiKeyTemplate: string | null;
			name: string;
			permissions: Array<APIPermissions>;
			redirectUri: string | null;
			webhookUri: string | null;
		};

		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const clientDoc = await ACTION_CreateApiClient(taker, {
			name: body.name,
			redirectUri: body.redirectUri,
			webhookUri: body.webhookUri,
			apiKeyTemplate: body.apiKeyTemplate,
			apiKeyFilename: body.apiKeyFilename,
			permissions: body.permissions,
		});

		return res.status(200).json({
			success: true,
			description: `Created a new API client.`,
			body: clientDoc,
		});
	},
);

/**
 * Retrieves information about the client at this ID.
 *
 * @name GET /api/v1/clients/:clientID
 */
router.get("/:clientID", GetClientFromID, (req, res) => {
	const client = GetTachiData(req, "apiClientDoc");

	return res.status(200).json({
		success: true,
		description: `Retrieved client ${client.name}.`,
		body: client,
	});
});

/**
 * Update an existing client. The requester must be the owner of this
 * client, and must also be making a session-level request.
 *
 * @param name - Change the name of this client.
 * @param webhookUri - Change a bound webhookUri for this client.
 * @param redirectUri - Change a bound redirectUri for this client.
 * @param apiKeyTemplate - Change the APIKeyTemplate for this client.
 * @param apiKeyFilename - Change the APIKeyFilename for this client.
 *
 * @name PATCH /api/v1/clients/:clientID
 */
router.patch(
	"/:clientID",
	prValidate({
		name: p.optional(p.isBoundedString(3, 80)),
		apiKeyTemplate: "?string",
		apiKeyFilename: p.optional(p.isBoundedString(3, 80)),
		webhookUri: "?string",
		redirectUri: "?string",
	}),
	async (req, res) => {
		const user = req.session.tachi?.user;

		if (!user) {
			return res.status(401).json({
				success: false,
				description: `You are not authenticated.`,
			});
		}

		const body = req.safeBody as {
			apiKeyFilename?: string | null;
			apiKeyTemplate?: string | null;
			name?: string;
			redirectUri?: string | null;
			webhookUri?: string | null;
		};

		const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

		const updatedClient = await ACTION_UpdateApiClient(taker, {
			clientID: req.params.clientID,
			...body,
		});

		return res.status(200).json({
			success: true,
			description: `Updated client.`,
			body: updatedClient,
		});
	},
);

/**
 * Resets the clientSecret for this client.
 * This will NOT invalidate any existing tokens, as per oauth2 spec.
 *
 * @name POST /api/v1/clients/:clientID/reset-secret
 */
router.post("/:clientID/reset-secret", async (req, res) => {
	const user = req.session.tachi?.user;

	if (!user) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const updatedClient = await ACTION_ResetApiClientSecret(taker, {
		clientID: req.params.clientID,
	});

	return res.status(200).json({
		success: true,
		description: `Reset secret.`,
		body: updatedClient,
	});
});

/**
 * Delete this client. Must be authorized at a session-request level.
 *
 * @name DELETE /api/v1/clients/:clientID
 */
router.delete("/:clientID", async (req, res) => {
	const user = req.session.tachi?.user;

	if (!user) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	await ACTION_DeleteApiClient(taker, { clientID: req.params.clientID });

	return res.status(200).json({
		success: true,
		description: `Deleted client ${req.params.clientID}.`,
		body: {},
	});
});

export default router;
