import useSetSubheader from "#components/layout/header/useSetSubheader";
import Icon from "#components/util/Icon";
import SelectLinkButton from "#components/util/SelectLinkButton";
import useUGPTBase from "#components/util/useUGPTBase";
import { AllLUGPTStatsContext } from "#context/AllLUGPTStatsContext";
import { UserContext } from "#context/UserContext";
import { type UGPT } from "#types/react";
import React, { useContext } from "react";
import { Route, Switch } from "react-router-dom";
import { FormatGame, GameToGameGroup, GetGameGroupConfig } from "tachi-common";

import FolderSelectPage from "./FolderSelectPage";
import FolderTablePage from "./FolderTablePage";
import RecentFoldersPage from "./RecentFoldersPage";
import SpecificFolderPage from "./SpecificFolderPage";

export default function FoldersMainPage({ reqUser, game }: UGPT) {
	const { user } = useContext(UserContext);
	const { ugs } = useContext(AllLUGPTStatsContext);

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

	const base = useUGPTBase({ reqUser, game });

	return (
		<div className="row">
			<div className="col-12 text-center">
				<div className="btn-group d-flex justify-content-center mb-8">
					{user && ugs?.find((x) => x.game === game) && (
						<SelectLinkButton className="text-wrap" to={`${base}/folders/recent`}>
							<Icon type="clock" />{" "}
							{user.id === reqUser.id
								? "Recent Folders"
								: "Your Recently Viewed Folders"}
						</SelectLinkButton>
					)}

					<SelectLinkButton className="text-wrap" to={`${base}/folders`}>
						<Icon type="table" /> Table Overview
					</SelectLinkButton>
					<SelectLinkButton className="text-wrap" to={`${base}/folders/search`}>
						<Icon type="search" /> Folder Select
					</SelectLinkButton>
				</div>
			</div>
			<div className="col-12">
				<Switch>
					<Route exact path="/u/:userID/games/:game/folders">
						<FolderTablePage {...{ reqUser, game }} />
					</Route>
					<Route exact path="/u/:userID/games/:game/folders/search">
						<FolderSelectPage {...{ reqUser, game }} />
					</Route>
					<Route exact path="/u/:userID/games/:game/folders/recent">
						<RecentFoldersPage {...{ reqUser, game }} />
					</Route>
					<Route path="/u/:userID/games/:game/folders/:folderSlug">
						<SpecificFolderPage {...{ reqUser, game }} />
					</Route>
				</Switch>
			</div>
		</div>
	);
}
