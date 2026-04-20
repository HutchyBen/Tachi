import { LoadTableDocumentByLegacyIdForGame } from "#lib/db-formats/table";
import { GetEnumDistForFolders, GetFoldersFromTable } from "#lib/folders/folders";
import { withUserGameProfile } from "#lib/router/middleware";
import { success } from "#lib/router/typed-router";
import { API_V1_ROUTER } from "#server/router/api/v1/router";
import { ExpectedErr } from "bliss";

/**
 * Retrieves a users statistics on this table.
 *
 * @name GET /api/v1/users/:userID/games/:game/tables/:tableID
 */
API_V1_ROUTER.add(
	"GET /users/:userID/games/:game/tables/:tableID",
	withUserGameProfile,
	async ({ ctx, params }) => {
		const { requestedUser: user, game } = ctx;

		const table = await LoadTableDocumentByLegacyIdForGame(params.tableID, game);

		if (!table) {
			throw new ExpectedErr(404, `No table with ID ${params.tableID} exists.`);
		}

		const folders = await GetFoldersFromTable(table);
		const stats = await GetEnumDistForFolders(user.id, folders);

		return success(`Returned stats for ${folders.length} folders.`, { folders, stats, table });
	},
);
