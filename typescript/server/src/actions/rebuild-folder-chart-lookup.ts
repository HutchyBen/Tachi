import { MakeAction } from "#lib/actions/actions.js";
import { rebuildFolderChartLookup } from "#lib/folders/rebuild-folder-chart-lookup.js";
import DB from "#services/pg/db.js";
import { IsUserAdmin } from "#utils/user.js";
import { ExpectedErr } from "bliss";

export const ACTION_RebuildFolderChartLookup = MakeAction(
	"REBUILD_FOLDER_CHART_LOOKUP",
	async (taker, { folderId }) => {
		if (!(await IsUserAdmin(taker.acct.id))) {
			throw new ExpectedErr(403, "You are not authorized to perform this action.");
		}

		return rebuildFolderChartLookup(DB, { folderId });
	},
);
