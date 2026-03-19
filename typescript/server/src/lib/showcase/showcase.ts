import MONGODB_KILL from "#services/mongo/db";

/**
 * When a folder is removed, any showcase stats referring to that folder
 * need to be changed aswell.
 */
export function RemoveStaleFolderShowcaseStats(removedFolderIDs: Array<string>) {
	return MONGODB_KILL["game-settings"].update(
		{},
		{
			$pull: {
				"preferences.stats": {
					mode: "folder",
					folderID: { $in: removedFolderIDs },
				},
			},
		},
		{
			multi: true,
		},
	);
}
