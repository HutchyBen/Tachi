import { ACTION_CreateOAuth2AuthCode } from "#actions/create-oauth2-auth-code";
import { ANON_ACTION_OAuthTokenExchange } from "#anon-actions/oauth-token-exchange";
import prValidate from "#server/middleware/prudence-validate";
import { Router } from "express";
import { p } from "prudence";

const router: Router = Router({ mergeParams: true });

/**
 * Converts an auth code into a valid API key that is returned.
 *
 * @note The params here are deliberately snake cased as that's what
 * the digitalocean examples for oauth2 do. I have no idea whether that's
 * part of the spec or not, but it probably is.
 *
 * @param client_id - The id for the client requesting a token.
 * @param client_secret - The secret for the client.
 * @param grant_type - Only exactly "authorization_code" is supported at the moment.
 * @param redirect_uri - Must be the exact redirectUri registered with this client.
 * @param code - The code to convert into an API token.
 *
 * @name POST /api/v1/oauth/token
 */
router.post(
	"/token",
	prValidate({
		client_id: "string",
		client_secret: "string",
		grant_type: p.is("authorization_code"),
		redirect_uri: "string",
		code: "string",
	}),
	async (req, res) => {
		const body = req.safeBody as {
			client_id: string;
			client_secret: string;
			code: string;
			grant_type: "authorization_code";
			redirect_uri: string;
		};

		const apiDoc = await ANON_ACTION_OAuthTokenExchange(
			{ ip: req.ip },
			{
				client_id: body.client_id,
				client_secret: body.client_secret,
				grant_type: body.grant_type,
				redirect_uri: body.redirect_uri,
				code: body.code,
			},
		);

		return res.status(200).json({
			success: true,
			description: `Successfully authenticated.`,
			body: apiDoc,
		});
	},
);

/**
 * Creates an authorization code for this user (inferred from session).
 *
 * @name POST /api/v1/oauth/create-code
 */
router.post("/create-code", async (req, res) => {
	if (!req.session.tachi?.user) {
		return res.status(401).json({
			success: false,
			description: `You are not authenticated.`,
		});
	}

	const user = req.session.tachi.user;
	const taker = { ip: req.ip, acct: { id: user.id, username: user.username } };

	const doc = await ACTION_CreateOAuth2AuthCode(taker, {});

	return res.status(200).json({
		success: true,
		description: `Successfully created code.`,
		body: doc,
	});
});

export default router;
