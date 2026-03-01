import ClassBadge from "#components/game/ClassBadge";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import MiniTable from "#components/tables/components/MiniTable";
import GentleLink from "#components/util/GentleLink";
import LinkButton from "#components/util/LinkButton";
import LoadingWrapper from "#components/util/LoadingWrapper";
import { useProfileRatingAlg } from "#components/util/useScoreRatingAlg";
import { type GPTLeaderboard, type UGPTLeaderboardAdjacent } from "#types/api-returns";
import { type GamePT, type SetState, type UGPT } from "#types/react";
import { APIFetchV1, type UnsuccessfulAPIFetchResponse } from "#util/api";
import { ChangeOpacity } from "#util/color-opacity";
import { FormatGPTProfileRating, FormatGPTProfileRatingName, IsNotNullish } from "#util/misc";
import { StrSOV } from "#util/sorts";
import React, { useState } from "react";
import { useQuery } from "react-query";
import {
	type Classes,
	COLOUR_SET,
	FormatGameGroup,
	GetGameGroupConfig,
	GetGamePTConfig,
	type GPTString,
	type integer,
	type ProfileRatingAlgorithms,
	type UserDocument,
	type UserGameStats,
} from "tachi-common";

interface LeaderboardsData {
	stats: UGPTLeaderboardAdjacent;
	leaderboard: GPTLeaderboard;
}

export default function LeaderboardsPage({ reqUser, game, playtype }: UGPT) {
	const gameConfig = GetGameGroupConfig(game);
	useSetSubheader(
		["Users", reqUser.username, "Games", gameConfig.name, playtype, "Leaderboard"],
		[reqUser, game, playtype],
		`${reqUser.username}'s ${FormatGameGroup(game, playtype)} Leaderboard`,
	);

	const defaultRating = useProfileRatingAlg(game, playtype);
	const [alg, setAlg] = useState(defaultRating);

	const url = `/users/${reqUser.id}/games/${game}/${playtype}/leaderboard-adjacent?alg=${alg}`;

	const { data, error } = useQuery<LeaderboardsData, UnsuccessfulAPIFetchResponse>(
		url,
		async () => {
			const res = await APIFetchV1<UGPTLeaderboardAdjacent>(url);

			if (!res.success) {
				throw res;
			}

			const lRes = await APIFetchV1<GPTLeaderboard>(
				`/games/${game}/${playtype}/leaderboard?limit=3&alg=${alg}`,
			);

			if (!lRes.success) {
				throw lRes;
			}

			return {
				stats: res.body,
				leaderboard: lRes.body,
			};
		},
	);

	return (
		<LoadingWrapper {...{ dataset: data, error }}>
			<LeaderboardsPageContent {...{ reqUser, game, playtype, data: data!, alg, setAlg }} />
		</LoadingWrapper>
	);
}

function LeaderboardsPageContent({
	reqUser,
	game,
	playtype,
	data,
	alg,
}: {
	alg: ProfileRatingAlgorithms[GPTString];
	data: LeaderboardsData;
	reqUser: UserDocument;
	setAlg: SetState<ProfileRatingAlgorithms[GPTString]>;
} & GamePT) {
	const { stats, leaderboard } = data;

	const gptConfig = GetGamePTConfig(game, playtype);

	const userMap = new Map<integer, UserDocument>();

	for (const u of stats.users) {
		userMap.set(u.id, u);
	}

	for (const u of leaderboard.users) {
		userMap.set(u.id, u);
	}

	// hack - we aren't returned from this api call for some reason.
	userMap.set(reqUser.id, reqUser);

	const bestNearbyUser = stats.thisUsersRanking.ranking - stats.above.length - 1;

	function LeaderboardRow({ s, i }: { i: integer; s: UserGameStats }) {
		return (
			<tr
				style={{
					backgroundColor:
						reqUser.id === s.userID ? ChangeOpacity(COLOUR_SET.gold, 0.15) : undefined,
					height: reqUser.id === s.userID ? "50px" : undefined,
				}}
			>
				<td>
					<strong>#{i}</strong>
					{reqUser.id === s.userID && (
						<small className="text-body-secondary">
							/{stats.thisUsersRanking.outOf}
						</small>
					)}
				</td>
				<td>
					<GentleLink
						to={`/u/${userMap.get(s.userID)!.username}/games/${game}/${playtype}`}
					>
						{userMap.get(s.userID)?.username}
					</GentleLink>
				</td>
				<td>
					{IsNotNullish(s.ratings[alg])
						? FormatGPTProfileRating(game, playtype, alg, s.ratings[alg]!)
						: "No Data."}
				</td>
				{/* temp */}
				<td>
					{Object.entries(s.classes).length
						? Object.entries(s.classes)
								.sort(StrSOV((x) => x[0]))
								.map(
									([k, v]) =>
										v && (
											<ClassBadge
												classSet={k as Classes[GPTString]}
												classValue={v}
												game={game}
												key={`${k}:${v}`}
												playtype={playtype}
											/>
										),
								)
						: "No Classes"}
				</td>
			</tr>
		);
	}

	return (
		<Card
			cardBodyClassName="overflow-x-auto d-flex flex-column justify-content-center p-4"
			footer={
				<LinkButton className="float-end" to={`/games/${game}/${playtype}/leaderboards`}>
					View Global Leaderboards
				</LinkButton>
			}
			header={"Leaderboard"}
		>
			<MiniTable
				className="text-center"
				headers={[
					"Position",
					"User",
					FormatGPTProfileRatingName(game, playtype, alg),
					"Classes",
				]}
			>
				<>
					{bestNearbyUser >= 1 &&
						leaderboard.gameStats
							.slice(0, bestNearbyUser)
							.map((s, i) => <LeaderboardRow i={i + 1} key={s.userID} s={s} />)}
					{bestNearbyUser > 4 && (
						<tr style={{ lineHeight: "0.5rem" }}>
							<td colSpan={4}>...</td>
						</tr>
					)}
					{[...stats.above, stats.thisUsersStats, ...stats.below].map((s, i) => (
						<LeaderboardRow
							i={stats.thisUsersRanking.ranking - stats.above.length + i}
							key={s.userID}
							s={s}
						/>
					))}
				</>
			</MiniTable>
		</Card>
	);
}
