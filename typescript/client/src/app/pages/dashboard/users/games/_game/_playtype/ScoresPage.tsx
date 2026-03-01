import useSetSubheader from "#components/layout/header/useSetSubheader";
import PBTable from "#components/tables/pbs/PBTable";
import ScoreTable from "#components/tables/scores/ScoreTable";
import DebounceSearch from "#components/util/DebounceSearch";
import Icon from "#components/util/Icon";
import LoadingWrapper from "#components/util/LoadingWrapper";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectLinkButton from "#components/util/SelectLinkButton";
import usePreferredRanking from "#components/util/usePreferredRanking";
import useScoreRatingAlg from "#components/util/useScoreRatingAlg";
import useUGPTBase from "#components/util/useUGPTBase";
import { type GamePT, type SetState, type UGPT } from "#types/react";
import { FormatGPTScoreRatingName } from "#util/misc";
import React, { useState } from "react";
import { Col, Form, Row } from "react-bootstrap";
import { Route, Switch } from "react-router-dom";
import {
	type ChartDocument,
	FormatGameGroup,
	type GameGroup,
	GetGameGroupConfig,
	GetGamePTConfig,
	type GPTString,
	type PBScoreDocument,
	type ScoreDocument,
	type ScoreRatingAlgorithms,
	type SongDocument,
	type UnsuccessfulAPIResponse,
	type UserDocument,
} from "tachi-common";

export default function ScoresPage({
	reqUser,
	game,
	playtype,
}: {
	reqUser: UserDocument;
} & GamePT) {
	const gameConfig = GetGameGroupConfig(game);
	const gptConfig = GetGamePTConfig(game, playtype);

	const defaultRating = useScoreRatingAlg(game, playtype);

	const [alg, setAlg] = useState(defaultRating);

	useSetSubheader(
		["Users", reqUser.username, "Games", gameConfig.name, playtype, "Scores"],
		[reqUser],
		`${reqUser.username}'s ${FormatGameGroup(game, playtype)} Scores`,
	);

	const base = useUGPTBase({ reqUser, game, playtype });

	return (
		<Row xs={{ cols: 1 }}>
			<Col className="text-center">
				<div className="btn-group d-flex justify-content-center mb-4">
					<SelectLinkButton className="text-wrap" to={`${base}/scores`}>
						<Icon type="trophy" /> Best 100 PBs
					</SelectLinkButton>
					<SelectLinkButton className="text-wrap" to={`${base}/scores/history`}>
						<Icon type="history" /> Recent 100 Scores
					</SelectLinkButton>
					<SelectLinkButton className="text-wrap" to={`${base}/scores/most-played`}>
						<Icon type="mortar-pestle" /> Most Played
					</SelectLinkButton>
					<SelectLinkButton className="text-wrap" to={`${base}/scores/all`}>
						<Icon type="database" /> All PBs
					</SelectLinkButton>
				</div>
			</Col>
			<Col className="d-flex flex-column gap-4">
				<Switch>
					<Route exact path="/u/:userID/games/:game/:playtype/scores">
						<>
							{Object.keys(gptConfig.scoreRatingAlgs).length > 1 && (
								<AlgSelector {...{ alg, setAlg, game, playtype }} />
							)}
							<PBsOverview
								url={`/users/${reqUser.id}/games/${game}/${playtype}/pbs/best?alg=${alg}`}
								{...{ reqUser, game, playtype, alg }}
							/>
						</>
					</Route>
					<Route path="/u/:userID/games/:game/:playtype/scores/history">
						<ScoresOverview {...{ reqUser, game, playtype }} />
					</Route>
					<Route path="/u/:userID/games/:game/:playtype/scores/all">
						<PBsOverview
							game={game}
							indexCol={false}
							key="all-pbs"
							playtype={playtype}
							reqUser={reqUser}
							url={`/users/${reqUser.id}/games/${game}/${playtype}/pbs/all`}
						/>
					</Route>
					<Route path="/u/:userID/games/:game/:playtype/scores/most-played">
						<PBsOverview
							game={game}
							indexCol
							key="most-played-pbs"
							playtype={playtype}
							reqUser={reqUser}
							showPlaycount
							url={`/users/${reqUser.id}/games/${game}/${playtype}/most-played`}
						/>
					</Route>
				</Switch>
			</Col>
		</Row>
	);
}

function AlgSelector({
	game,
	playtype,
	alg,
	setAlg,
}: {
	alg: ScoreRatingAlgorithms[GPTString];
	setAlg: SetState<ScoreRatingAlgorithms[GPTString]>;
} & GamePT) {
	const gptConfig = GetGamePTConfig(game, playtype);
	return (
		<Form.Group className="d-flex flex-column gap-1">
			<div>Best 100 PBs according to</div>
			<Form.Select onChange={(e) => setAlg(e.target.value as any)} value={alg}>
				{Object.keys(gptConfig.scoreRatingAlgs).map((e) => (
					<option key={e} value={e}>
						{FormatGPTScoreRatingName(game, playtype, e)}
					</option>
				))}
			</Form.Select>
		</Form.Group>
	);
}

function useFetchPBs(url: string, reqUser: UserDocument) {
	const { data, error } = useApiQuery<{
		charts: ChartDocument[];
		pbs: PBScoreDocument[];
		songs: SongDocument[];
	}>(url);

	return {
		error: error as UnsuccessfulAPIResponse,
		data: data ? FormatData(data.pbs, data.songs, data.charts, reqUser) : undefined,
	};
}

function PBsOverview({
	reqUser,
	game,
	playtype,
	indexCol = true,
	showPlaycount = false,
	url,
	alg,
}: {
	alg?: ScoreRatingAlgorithms[GPTString];
	indexCol?: boolean;
	reqUser: UserDocument;
	showPlaycount?: boolean;
	url: string;
} & GamePT) {
	const [search, setSearch] = useState("");

	const { data, error } = useFetchPBs(url, reqUser);

	const preferredRanking = usePreferredRanking();

	return (
		<div className="row">
			<div className="col-12">
				<DebounceSearch placeholder="Search all PBs..." setSearch={setSearch} />
			</div>
			<div className="col-12 mt-4">
				{search === "" ? (
					<LoadingWrapper style={{ height: 500 }} {...{ error, dataset: data }}>
						<PBTable
							alg={alg}
							dataset={data!}
							defaultRankingViewMode={preferredRanking}
							game={game}
							indexCol={indexCol}
							playtype={playtype}
							showPlaycount={showPlaycount}
						/>
					</LoadingWrapper>
				) : (
					<PBsSearch {...{ reqUser, game, playtype, search }} />
				)}
			</div>
		</div>
	);
}

function FormatData<
	D extends PBScoreDocument | ScoreDocument,
	GPT extends GPTString = GPTString,
	G extends GameGroup = GameGroup,
>(d: D[], songs: SongDocument<G>[], charts: ChartDocument<GPT>[], reqUser: UserDocument) {
	const songMap = new Map();
	const chartMap = new Map();

	for (const song of songs) {
		songMap.set(song.id, song);
	}

	for (const chart of charts) {
		chartMap.set(chart.chartID, chart);
	}

	const data = d.map((e, i) => ({
		...e,
		__related: {
			song: songMap.get(e.songID),
			chart: chartMap.get(e.chartID),
			index: i,
			user: reqUser,
		},
	}));

	return data;
}

function useFetchScores(url: string, reqUser: UserDocument) {
	const { data, error } = useApiQuery<{
		charts: ChartDocument[];
		scores: ScoreDocument[];
		songs: SongDocument[];
	}>(url);

	return {
		error: error as UnsuccessfulAPIResponse,
		data: data ? FormatData(data.scores, data.songs, data.charts, reqUser) : undefined,
	};
}

function PBsSearch({
	reqUser,
	game,
	playtype,
	search,
	alg,
}: {
	alg?: ScoreRatingAlgorithms[GPTString];
	reqUser: UserDocument;
	search: string;
} & GamePT) {
	const { data, error } = useFetchPBs(
		`/users/${reqUser.id}/games/${game}/${playtype}/pbs?search=${search}`,
		reqUser,
	);

	return (
		<LoadingWrapper style={{ height: 500 }} {...{ error, dataset: data }}>
			<PBTable
				alg={alg}
				dataset={data!}
				game={game}
				indexCol={false}
				playtype={playtype as "DP" | "SP"}
			/>
		</LoadingWrapper>
	);
}

function ScoresOverview({ reqUser, game, playtype }: UGPT) {
	const [search, setSearch] = useState("");

	const { data, error } = useFetchScores(
		`/users/${reqUser.id}/games/${game}/${playtype}/scores/recent`,
		reqUser,
	);

	return (
		<div className="row">
			<div className="col-12">
				<DebounceSearch
					placeholder="Search all individual scores..."
					setSearch={setSearch}
					size="lg"
				/>
			</div>
			<div className="col-12 mt-4">
				{search === "" ? (
					<LoadingWrapper style={{ height: 500 }} {...{ dataset: data, error }}>
						<ScoreTable dataset={data!} game={game} playtype={playtype as any} />
					</LoadingWrapper>
				) : (
					<ScoresSearch {...{ reqUser, game, playtype, search }} />
				)}
			</div>
		</div>
	);
}

function ScoresSearch({
	reqUser,
	game,
	playtype,
	search,
}: { reqUser: UserDocument; search: string } & GamePT) {
	const { data, error } = useFetchScores(
		`/users/${reqUser.id}/games/${game}/${playtype}/scores?search=${search}`,
		reqUser,
	);

	return (
		<LoadingWrapper style={{ height: 500 }} {...{ error, dataset: data }}>
			<ScoreTable dataset={data!} game={game} playtype={playtype as any} />
		</LoadingWrapper>
	);
}
