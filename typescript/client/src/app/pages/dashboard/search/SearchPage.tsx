import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import DifficultyCell from "#components/tables/cells/DifficultyCell";
import TitleCell from "#components/tables/cells/TitleCell";
import TachiTable from "#components/tables/components/TachiTable";
import { CascadingRatingValue } from "#components/tables/headers/ChartHeader";
import ProfilePicture from "#components/user/ProfilePicture";
import ApiError from "#components/util/ApiError";
import DebounceSearch from "#components/util/DebounceSearch";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import Muted from "#components/util/Muted";
import { useTachiSearch } from "#components/util/search/useTachiSearch";
import SelectButton from "#components/util/SelectButton";
import { UserContext } from "#context/UserContext";
import { ONE_MINUTE } from "#util/constants/time";
import { NumericSOV, StrSOV } from "#util/sorts";
import React, { useContext, useEffect, useState } from "react";
import { Badge, Col, Form, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	FormatGameGroup,
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	SplitGPT,
} from "tachi-common";

export default function SearchPage() {
	useSetSubheader("Search");

	const { user } = useContext(UserContext);

	const [search, setSearch] = useState("");
	const [hasPlayedGame, setHasPlayedGame] = useState(true);

	return (
		<Row>
			<Col xs={12}>
				<DebounceSearch
					autoFocus
					placeholder="Search songs, users..."
					setSearch={setSearch}
				/>
				{user && (
					<div className="w-100 mt-4 ms-1">
						<Form.Check
							checked={hasPlayedGame}
							label="Hide games you haven't played?"
							onChange={(e) => setHasPlayedGame(e.target.checked)}
						/>
					</div>
				)}
				<Divider />
			</Col>
			<Col xs={12}>
				<SearchResults hasPlayedGame={hasPlayedGame} search={search} />
			</Col>
		</Row>
	);
}

function SearchResults({ search, hasPlayedGame }: { hasPlayedGame: boolean; search: string }) {
	const { data, error } = useTachiSearch(search, hasPlayedGame);
	const [mode, setMode] = useState<"users" | GPTString | null>(null);

	useEffect(() => {
		if (data) {
			const thingsWithCharts = Object.entries(data.charts)
				.sort(StrSOV((x) => x[0]))
				.filter((k) => k[1].length > 0);

			if (thingsWithCharts.length > 0) {
				setMode(thingsWithCharts[0][0] as GPTString);
			} else if (data.users.length > 0) {
				setMode("users");
			} else {
				setMode(null);
			}
		} else {
			setMode(null);
		}
	}, [data, hasPlayedGame]);

	if (search === "") {
		return <></>;
	}

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const hasCharts = Object.values(data.charts).some((k) => k.length > 0);
	const hasUsers = data.users.length > 0;
	if (!hasCharts && !hasUsers) {
		return (
			<Row>
				<Col xs={12}>Found nothing. Sorry!</Col>
			</Row>
		);
	}

	return (
		<Row>
			<Col
				className="d-flex"
				lg={3}
				style={{
					flexWrap: "wrap",
					flexDirection: "column",
					gap: "2px",
				}}
				xs={12}
			>
				{Object.entries(data.charts)
					.sort(StrSOV((x) => x[0]))
					.map(([g, charts]) => {
						if (charts.length === 0) {
							return null;
						}

						const gpt = g as GPTString;

						const [game, playtype] = SplitGPT(gpt);

						return (
							<SelectButton id={gpt} key={gpt} setValue={setMode} value={mode}>
								{FormatGameGroup(game, playtype)}
								<Badge bg="secondary" className="ms-2 text-light">
									{charts.length}
								</Badge>
							</SelectButton>
						);
					})}

				{data.users.length > 0 && (
					<SelectButton
						disabled={data.users.length === 0}
						id="users"
						setValue={setMode}
						value={mode}
					>
						Users
						<Badge bg="secondary" className="ms-2">
							{data.users.length}
						</Badge>
					</SelectButton>
				)}

				<div className="d-block d-lg-none">
					<Divider />
				</div>
			</Col>
			{mode !== null && (
				<Col lg={9} xs={12}>
					{mode === "users" ? (
						<UsersView users={data.users} />
					) : (
						<ChartView charts={data.charts[mode]!} gpt={mode} />
					)}
				</Col>
			)}
		</Row>
	);
}

function ChartView({
	charts,
	gpt,
}: {
	charts: Array<{
		chart: MONGO_ChartDocument;
		playcount: integer;
		song: MONGO_SongDocument;
	}>;
	gpt: GPTString;
}) {
	const [game, playtype] = SplitGPT(gpt);

	return (
		<TachiTable
			dataset={charts}
			defaultReverseSort
			defaultSortMode="Site Playcount"
			entryName="Charts"
			headers={[
				["Chart", "Chart", (a, b) => CascadingRatingValue(game, a.chart, b.chart)],
				["Song Title", "Song", StrSOV((x) => x.song.title)],
				["Site Playcount", "Playcount", NumericSOV((x) => x.playcount)],
			]}
			rowFunction={(d) => (
				<tr>
					<DifficultyCell chart={d.chart} game={game} />
					<TitleCell chart={d.chart} game={game} song={d.song} />
					<td>{d.playcount}</td>
				</tr>
			)}
			searchFunctions={{
				title: (x) => x.song.title,
				artist: (x) => x.song.artist,
				playcount: (x) => x.playcount,
				difficulty: (x) => x.chart.difficulty,
				level: (x) => x.chart.levelNum,
			}}
		/>
	);
}

function UsersView({ users }: { users: Array<MONGO_UserDocument> }) {
	return (
		<Row>
			<div
				className="w-100 d-flex"
				style={{
					flexWrap: "wrap",
				}}
			></div>
			{users.map((user) => (
				<Col key={user.id} lg={6} xs={12}>
					<Card className="mb-4">
						<div className="d-flex h-100">
							<div>
								<ProfilePicture user={user} />
							</div>
							<div
								className="ms-4 d-flex w-100 h-100"
								style={{
									flexWrap: "wrap",
									flexDirection: "column",
								}}
							>
								<div>
									<h4>
										<Link
											className="text-decoration-none"
											to={`/u/${user.username}`}
										>
											{user.username}
										</Link>
									</h4>
								</div>
								<div>
									<Muted>{user.status ?? "I haven't set my status."}</Muted>
								</div>
								{Date.now() - user.lastSeen < ONE_MINUTE * 5 && (
									<div className="mt-2">
										<Badge bg="success">ONLINE</Badge>
									</div>
								)}
							</div>
						</div>
					</Card>
				</Col>
			))}
		</Row>
	);
}
