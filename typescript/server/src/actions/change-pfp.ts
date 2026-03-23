import { MakeAction } from "#lib/actions/actions.js";
import { CDNStoreOrOverwrite } from "#lib/cdn/cdn.js";
import { GetProfilePictureURL } from "#lib/cdn/url-format.js";
import DB from "#services/pg/db.js";
import { HashSHA256 } from "#utils/crypto.js";
import { ExpectedErr } from "bliss";

export const ACTION_ChangePfp = MakeAction(
	"CHANGE_PFP",
	async (taker, { "!fileBuffer": fileBuffer, fileMimetype }) => {
		const contentHash = HashSHA256(fileBuffer);

		if (
			fileMimetype === "image/jpeg" ||
			fileMimetype === "image/png" ||
			fileMimetype === "image/gif"
		) {
			await CDNStoreOrOverwrite(GetProfilePictureURL(taker.acct.id, contentHash), fileBuffer);
		} else {
			// GIF is deliberately not mentioned here
			// as it's an easter egg
			throw new ExpectedErr(400, "Invalid file - only JPG and PNG files are supported.");
		}

		await DB.updateTable("account")
			.set({ custom_pfp_location: contentHash })
			.where("id", "=", taker.acct.id)
			.execute();

		return { contentHash };
	},
);
