import PlaytypeSelect from "#app/pages/dashboard/games/_game/PlaytypeSelect";
import FoldersMainPage from "#app/pages/dashboard/users/games/_game/_playtype/folders/FoldersMainPage";
import LeaderboardsPage from "#app/pages/dashboard/users/games/_game/_playtype/LeaderboardsPage";
import OverviewPage from "#app/pages/dashboard/users/games/_game/_playtype/OverviewPage";
import RivalsMainPage from "#app/pages/dashboard/users/games/_game/_playtype/rivals/RivalsMainPage";
import SessionsPage from "#app/pages/dashboard/users/games/_game/_playtype/SessionsPage";
import SpecificSessionPage from "#app/pages/dashboard/users/games/_game/_playtype/SpecificSessionPage";
import TargetsPage from "#app/pages/dashboard/users/games/_game/_playtype/targets/TargetsPage";
import UGPTSettingsPage from "#app/pages/dashboard/users/games/_game/_playtype/UGPTSettingsPage";
import UGPTUtilsPage from "#app/pages/dashboard/users/games/_game/_playtype/utils/UGPTUtilsPage";
import UserGamesPage from "#app/pages/dashboard/users/UserGamesPage";
import UserImportsPage from "#app/pages/dashboard/users/UserImportsPage";
import UserIntegrationsPage from "#app/pages/dashboard/users/UserIntegrationsPage";
import UserInvitesPage from "#app/pages/dashboard/users/UserInvitesPage";
import UserSettingsPage from "#app/pages/dashboard/users/UserSettingsPage";
import { ErrorPage } from "#app/pages/ErrorPage";
import RequireAuthAsUserParam from "#components/auth/RequireAuthAsUserParam";
import LayoutHeaderContainer from "#components/layout/LayoutHeaderContainer";
import { UGPTBottomNav, UGPTHeaderBody } from "#components/user/UGPTHeader";
import { UserBottomNav, UserHeaderBody } from "#components/user/UserHeader";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { BackgroundContext } from "#context/BackgroundContext";
import { TargetsContextProvider } from "#context/TargetsContext";
import { UGPTContextProvider } from "#context/UGPTContext";
import { UserContext } from "#context/UserContext";
import { UserSettingsContext } from "#context/UserSettingsContext";
import { type UGPTStatsReturn } from "#types/api-returns";
import { APIFetchV1, type APIFetchV1Return, ToAPIURL } from "#util/api";
import { IsSupportedGame, IsSupportedPlaytype } from "#util/asserts";
import React, { useContext, useEffect } from "react";
import { useQuery } from "react-query";
import { Redirect, Route, Switch, useHistory, useParams } from "react-router-dom";
import {
	FormatGameGroup,
	type GameGroup,
	GetGameGroupConfig,
	type Playtype,
	type UserDocument,
	type UserGameStats,
} from "tachi-common";

import ScoresPage from "../pages/dashboard/users/games/_game/_playtype/ScoresPage";
import UserPage from "../pages/dashboard/users/UserPage";

export default function UserRoutes() {
	const params = useParams<{ userID: string }>();
	const { userID } = useParams<{ userID: string }>();
	const history = useHistory();

	const { data: reqUser, error } = useApiQuery<UserDocument>(`/users/${params.userID}`);

	const { setBackground } = useContext(BackgroundContext);
	useEffect(() => {
		if (reqUser) {
			setBackground(ToAPIURL(`/users/${reqUser.id}/banner`));
		}

		return () => {
			setBackground(null);
		};
	}, [reqUser]);

	if (error && error.statusCode === 404) {
		return <ErrorPage customMessage="This user does not exist!" statusCode={404} />;
	}

	if (error) {
		return <ErrorPage customMessage={error.description} statusCode={error.statusCode} />;
	}

	if (!reqUser) {
		return null;
	}

	// redirect to the users actual name if using a user ID or "me"
	if (userID.match(/^([0-9]+|me)$/u)) {
		const split = history.location.pathname.match(/^(\/u)\/([0-9]+|me)(.*)$/u);

		if (!split) {
			return (
				<ErrorPage
					customMessage="I mean, this might be my fault. It might be yours. How the hell did you get here? (REPORT THIS!)"
					statusCode={404}
				/>
			);
		}

		const newPath = `${split[1]}/${reqUser.username}${split[3]}`;

		return <Redirect to={newPath} />;
	}

	return (
		<Switch>
			<Route path="/u/:userID">
				<Switch>
					<Route path="/u/:userID/games/:game">
						<UserGameRoutes reqUser={reqUser} />
					</Route>
					<UserProfileRoutes reqUser={reqUser} />
				</Switch>
			</Route>
		</Switch>
	);
}

function UserProfileRoutes({ reqUser }: { reqUser: UserDocument }) {
	const { settings } = useContext(UserSettingsContext);

	return (
		<>
			<LayoutHeaderContainer
				footer={<UserBottomNav baseUrl={`/u/${reqUser.username}`} reqUser={reqUser} />}
				header={
					settings?.preferences.developerMode
						? `${reqUser.username} (UID: ${reqUser.id})`
						: `${reqUser.username}'s Profile`
				}
			>
				<UserHeaderBody reqUser={reqUser} />
			</LayoutHeaderContainer>
			<Route exact path="/u/:userID">
				<UserPage reqUser={reqUser} />
			</Route>
			<Route exact path="/u/:userID/games">
				<UserGamesPage reqUser={reqUser} />
			</Route>
			<Route exact path="/u/:userID/settings">
				<RequireAuthAsUserParam>
					<UserSettingsPage reqUser={reqUser} />
				</RequireAuthAsUserParam>
			</Route>
			<Route path="/u/:userID/integrations">
				<RequireAuthAsUserParam>
					<UserIntegrationsPage reqUser={reqUser} />
				</RequireAuthAsUserParam>
			</Route>
			<Route path="/u/:userID/imports">
				<RequireAuthAsUserParam>
					<UserImportsPage reqUser={reqUser} />
				</RequireAuthAsUserParam>
			</Route>
			<Route exact path="/u/:userID/invites">
				<RequireAuthAsUserParam>
					<UserInvitesPage reqUser={reqUser} />
				</RequireAuthAsUserParam>
			</Route>
		</>
	);
}

function UserGameRoutes({ reqUser }: { reqUser: UserDocument }) {
	const { game } = useParams<{ game: string }>();

	if (!IsSupportedGame(game)) {
		return <ErrorPage customMessage={`The game ${game} is not supported.`} statusCode={400} />;
	}

	const gameConfig = GetGameGroupConfig(game);

	return (
		<Switch>
			<Route exact path="/u/:userID/games/:game">
				{gameConfig.playtypes.length === 1 ? (
					<Redirect
						to={`/u/${reqUser.username}/games/${game}/${gameConfig.playtypes[0]}`}
					/>
				) : (
					<PlaytypeSelect
						base={`/u/${reqUser.username}/games/${game}`}
						game={game}
						subheaderCrumbs={["Users", reqUser.username, "Games", gameConfig.name]}
						subheaderTitle={`${reqUser.username} ${gameConfig.name} Playtype Select`}
					/>
				)}
			</Route>

			<Route path="/u/:userID/games/:game/:playtype">
				<UGPTContextProvider>
					<TargetsContextProvider>
						<UserGamePlaytypeRoutes game={game} reqUser={reqUser} />
					</TargetsContextProvider>
				</UGPTContextProvider>
			</Route>
		</Switch>
	);
}

function UserGamePlaytypeRoutes({ reqUser, game }: { game: GameGroup; reqUser: UserDocument }) {
	const { playtype } = useParams<{ playtype: string }>();

	if (!IsSupportedPlaytype(game, playtype)) {
		return (
			<ErrorPage
				customMessage={`The playtype ${playtype} is not supported.`}
				statusCode={400}
			/>
		);
	}

	return <Inner game={game} playtype={playtype} reqUser={reqUser} />;
}

function Inner({
	reqUser,
	game,
	playtype,
}: {
	game: GameGroup;
	playtype: Playtype;
	reqUser: UserDocument;
}) {
	const { user } = useContext(UserContext);

	const { data, error } = useQuery<UGPTStatsReturn, APIFetchV1Return<UserGameStats>>(
		[reqUser.id, game, playtype],
		async () => {
			const res = await APIFetchV1<UGPTStatsReturn>(
				`/users/${reqUser.id}/games/${game}/${playtype}`,
			);

			if (!res.success) {
				console.error(res);
				throw res;
			}

			return res.body;
		},
		{ retry: 0 },
	);

	if (error?.statusCode === 404) {
		return <ErrorPage customMessage="This user has not played this game!" statusCode={404} />;
	}

	if (error) {
		return <ErrorPage statusCode={error.statusCode} />;
	}

	if (!data) {
		return <Loading />;
	}

	const stats = data;

	return (
		<>
			<LayoutHeaderContainer
				footer={
					<UGPTBottomNav
						baseUrl={`/u/${reqUser.username}/games/${game}/${playtype}`}
						game={game}
						isRequestedUser={reqUser.id === user?.id}
						playtype={playtype}
					/>
				}
				header={`${reqUser.username}'s ${FormatGameGroup(game, playtype)} Profile`}
			>
				<UGPTHeaderBody game={game} playtype={playtype} reqUser={reqUser} stats={stats} />
			</LayoutHeaderContainer>
			<Switch>
				<Route exact path="/u/:userID/games/:game/:playtype">
					<OverviewPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/scores">
					<ScoresPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/folders">
					<FoldersMainPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route exact path="/u/:userID/games/:game/:playtype/sessions">
					<SessionsPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/sessions/:sessionID">
					<SpecificSessionPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/rivals">
					<RivalsMainPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/targets">
					<TargetsPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route exact path="/u/:userID/games/:game/:playtype/leaderboard">
					<LeaderboardsPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<Route path="/u/:userID/games/:game/:playtype/utils">
					<UGPTUtilsPage game={game} playtype={playtype} reqUser={reqUser} />
				</Route>
				<RequireAuthAsUserParam>
					<Route exact path="/u/:userID/games/:game/:playtype/settings">
						<UGPTSettingsPage game={game} playtype={playtype} reqUser={reqUser} />
					</Route>
				</RequireAuthAsUserParam>
				<Route path="*">
					<ErrorPage statusCode={404} />
				</Route>
			</Switch>
		</>
	);
}
