import useSetSubheader from "#components/layout/header/useSetSubheader";
import { type UGPT } from "#types/react";
import React from "react";
import { Redirect, Route, Switch } from "react-router-dom";
import { FormatGame, GameToGameGroup, GetGameGroupConfig } from "tachi-common";

import FolderTablePage from "./FolderTablePage";
import SpecificFolderPage from "./SpecificFolderPage";

export default function FoldersMainPage({ reqUser, game }: UGPT) {
	useSetSubheader(
		[
			"Users",
			reqUser.username,
			"Games",
			GetGameGroupConfig(GameToGameGroup(game)).name,
			"Folders",
		],
		[reqUser, game],
		`${reqUser.username}'s ${FormatGame(game)} Folders`,
	);

	return (
		<div className="row">
			<div className="col-12">
				<Switch>
					<Route exact path="/u/:userID/games/:game/folders">
						<FolderTablePage {...{ reqUser, game }} />
					</Route>
					<Route
						exact
						path="/u/:userID/games/:game/folders/search"
						render={({ match }) => (
							<Redirect
								to={`/u/${match.params.userID}/games/${match.params.game}/folders`}
							/>
						)}
					/>
					<Route
						exact
						path="/u/:userID/games/:game/folders/recent"
						render={({ match }) => (
							<Redirect
								to={`/u/${match.params.userID}/games/${match.params.game}/folders`}
							/>
						)}
					/>
					<Route path="/u/:userID/games/:game/folders/:folderSlug">
						<SpecificFolderPage {...{ reqUser, game }} />
					</Route>
				</Switch>
			</div>
		</div>
	);
}
