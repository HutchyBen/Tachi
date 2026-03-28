import ApiError from "#components/util/ApiError";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { UserContext } from "#context/UserContext";
import { type FolderStatsInfo } from "#types/api-returns";
import { type UGPT } from "#types/react";
import React, { useContext } from "react";
import { Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	type MONGO_FolderDocument,
	type MONGO_UserDocument,
	type MONGO_RecentlyViewedFolderDocument,
} from "tachi-common";

import { FolderInfoComponent } from "./FolderSelectPage";

export default function RecentFoldersPage({ reqUser, game, playtype }: UGPT) {
	const { user } = useContext(UserContext);

	if (!user) {
		return <>Hey, you're not logged in. How did you get here!</>;
	}

	return <Inner game={game} playtype={playtype} reqUser={reqUser} user={user} />;
}

function Inner({ reqUser, game, playtype, user }: { user: MONGO_UserDocument } & UGPT) {
	const { data, error } = useApiQuery<{
		folders: MONGO_FolderDocument[];
		stats: FolderStatsInfo[];
		views: MONGO_RecentlyViewedFolderDocument[];
	}>(`/users/${user.id}/games/${game}/${playtype}/folders/recent`);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	if (data.folders.length === 0) {
		return (
			<div className="text-center">
				Looks like you've not recently interacted with any folders.{" "}
				<Link to={`/u/${user.username}/games/${game}/${playtype}/folders`}>
					Go do that!
				</Link>
			</div>
		);
	}

	const dataset = [];

	for (const recent of data.views) {
		dataset.push({
			view: recent,
			// Is it really O(n^2) if the input is capped at 4?
			folder: data.folders.find((x) => x.folderID === recent.folderID),
			stats: data.stats.find((x) => x.folderID === recent.folderID),
		});
	}

	return (
		<Row>
			{dataset.map((e) => {
				if (e.folder === undefined || e.stats === undefined) {
					return (
						<>Failed to load folder {e.view.folderID}. This is a bug. Report this!</>
					);
				}

				return (
					<FolderInfoComponent
						folder={e.folder}
						folderStats={e.stats}
						game={game}
						key={e.folder.folderID}
						playtype={playtype}
						reqUser={reqUser}
					/>
				);
			})}
		</Row>
	);
}
