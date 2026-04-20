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
	type FolderDocument,
	type RecentlyViewedFolderDocument,
	type UserDocument,
} from "tachi-common";

import { FolderInfoComponent } from "./FolderSelectPage";

export default function RecentFoldersPage({ reqUser, game }: UGPT) {
	const { user } = useContext(UserContext);

	if (!user) {
		return <>Hey, you're not logged in. How did you get here!</>;
	}

	return <Inner game={game} reqUser={reqUser} user={user} />;
}

function Inner({ reqUser, game, user }: { user: UserDocument } & UGPT) {
	const { data, error } = useApiQuery<{
		folders: FolderDocument[];
		stats: FolderStatsInfo[];
		views: RecentlyViewedFolderDocument[];
	}>(`/users/${user.id}/games/${game}/folders/recent`);

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
				<Link to={`/u/${user.username}/games/${game}/folders`}>Go do that!</Link>
			</div>
		);
	}

	const dataset = [];

	for (const recent of data.views) {
		dataset.push({
			view: recent,
			folder: data.folders.find((x) => x.slug === recent.slug),
			stats: data.stats.find((x) => x.slug === recent.slug),
		});
	}

	return (
		<Row>
			{dataset.map((e) => {
				if (e.folder === undefined || e.stats === undefined) {
					return <>Failed to load folder {e.view.slug}. This is a bug. Report this!</>;
				}

				return (
					<FolderInfoComponent
						folder={e.folder}
						folderStats={e.stats}
						game={game}
						key={e.folder.slug}
						reqUser={reqUser}
					/>
				);
			})}
		</Row>
	);
}
