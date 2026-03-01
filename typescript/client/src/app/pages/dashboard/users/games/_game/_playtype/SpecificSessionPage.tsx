import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import SessionOverview from "#components/sessions/SessionOverview";
import ApiError from "#components/util/ApiError";
import DebugContent from "#components/util/DebugContent";
import Divider from "#components/util/Divider";
import EditableText from "#components/util/EditableText";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { UserContext } from "#context/UserContext";
import { UserSettingsContext } from "#context/UserSettingsContext";
import { type SessionReturns } from "#types/api-returns";
import { type UGPT } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { CreateChartMap, CreateScoreIDMap, CreateSongMap } from "#util/data";
import React, { useContext, useMemo, useState } from "react";
import { Badge, Button, Col, Row } from "react-bootstrap";
import { Redirect, useParams } from "react-router-dom";
import { GetGameGroupConfig } from "tachi-common";

export default function SpecificSessionPage({ reqUser, game, playtype }: UGPT) {
	const { sessionID } = useParams<{ sessionID: string }>();

	const { data, error } = useApiQuery<SessionReturns>(`/sessions/${sessionID}`);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	if (
		data.user.id !== reqUser.id ||
		game !== data.session.game ||
		playtype !== data.session.playtype
	) {
		return (
			<Redirect
				to={`/u/${data.user.username}/games/${data.session.game}/${data.session.playtype}/sessions/${sessionID}`}
			/>
		);
	}

	return <SessionPage {...{ data, game, playtype, reqUser }} />;
}

function SessionPage({ data, game, playtype }: { data: SessionReturns } & UGPT) {
	const { settings } = useContext(UserSettingsContext);

	const [sessionData, setSessionData] = useState(data);
	const { session, user, charts, scores, songs } = sessionData;

	const { user: loggedInUser } = useContext(UserContext);

	useSetSubheader(
		[
			"Users",
			user.username,
			"Games",
			GetGameGroupConfig(game).name,
			playtype,
			"Sessions",
			session.name,
		],
		[session.name, game, playtype, user],
		`${user.username}: ${session.name}`,
	);

	const songMap = CreateSongMap(songs);
	const chartMap = CreateChartMap(charts);
	const scoreMap = CreateScoreIDMap(scores);

	const scoreDataset = useMemo(() => {
		const d = [];

		for (const sci of data.scoreInfo) {
			const score = scoreMap.get(sci.scoreID);

			if (!score) {
				console.error(`No score for scoreID ${sci.scoreID}, but one was in session?`);
				continue;
			}

			const chart = chartMap.get(score.chartID);
			const song = songMap.get(score.songID);

			if (!chart || !song) {
				console.error(`No chart for ${score.chartID} (${score.songID})?`);
				continue;
			}

			d.push({
				...score,
				__related: {
					chart,
					song,
					index: 0,
					user,
				},
			});
		}

		return d;
	}, [sessionData]);

	const [highlight, setHighlight] = useState(session.highlight);

	const isAuthorised =
		loggedInUser && (loggedInUser.authLevel === 3 || loggedInUser.id === user.id);

	const updateSession = (sessionData: SessionReturns) => {
		APIFetchV1(
			`/sessions/${sessionData.session.sessionID}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					name: sessionData.session.name,
					desc: sessionData.session.desc,
					highlight: sessionData.session.highlight,
				}),
			},
			true,
			true,
		);
	};

	return (
		<Row className="justify-content-center">
			<Col className="text-center" xs={12}>
				<div className="d-flex flex-column gap-2 flex-wrap justify-content-center align-items-center">
					<EditableText
						as="h1"
						authorised={isAuthorised || false}
						className="enable-rfs"
						initialText={session.name || ""}
						onSubmit={(name) => {
							const newSession: SessionReturns = {
								...sessionData,
								session: {
									...sessionData.session,
									name,
								},
							};

							setSessionData(newSession);

							updateSession(newSession);
						}}
						placeholderText={session.name || "Untitled Session"}
					/>

					<EditableText
						authorised={isAuthorised || false}
						className="fs-5"
						initialText={session.desc || ""}
						onSubmit={(desc) => {
							const newSession: SessionReturns = {
								...sessionData,
								session: {
									...sessionData.session,
									desc,
								},
							};

							setSessionData(newSession);

							updateSession(newSession);
						}}
						placeholderText={session.desc || "No Description..."}
					/>
				</div>
				{session.highlight && (
					<Badge
						bg="warning"
						className="ms-2"
						style={{
							lineHeight: "15px",
						}}
					>
						Highlight!
					</Badge>
				)}

				<Divider className="mt-8 mb-4" />
				{user.id === loggedInUser?.id && (
					<>
						{highlight ? (
							<Button
								onClick={async () => {
									setHighlight(false);
									session.highlight = false;

									await APIFetchV1(
										`/sessions/${session.sessionID}`,
										{
											method: "PATCH",
											headers: {
												"Content-Type": "application/json",
											},
											body: JSON.stringify({
												highlight: false,
											}),
										},
										true,
										true,
									);
								}}
								variant="outline-danger"
							>
								<Icon type="star" /> Un-Highlight Session
							</Button>
						) : (
							<Button
								onClick={async () => {
									setHighlight(true);
									session.highlight = true;

									await APIFetchV1(
										`/sessions/${session.sessionID}`,
										{
											method: "PATCH",
											headers: {
												"Content-Type": "application/json",
											},
											body: JSON.stringify({
												highlight: true,
											}),
										},
										true,
										true,
									);
								}}
								variant="outline-warning"
							>
								<Icon regular type="star" /> Highlight Session
							</Button>
						)}
						<Divider />
					</>
				)}
			</Col>
			<SessionOverview
				reqUser={data.user}
				scoreDataset={scoreDataset}
				sessionData={sessionData}
				setSessionData={setSessionData}
			/>
			{settings?.preferences.developerMode && (
				<Col xs={12}>
					<Divider />
					<Card header="Debug Content">
						<DebugContent data={sessionData} />
					</Card>
				</Col>
			)}
		</Row>
	);
}
