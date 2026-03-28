import RivalChartTable from "#components/tables/rivals/RivalChartTable";
import ApiError from "#components/util/ApiError";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import useUGPTBase from "#components/util/useUGPTBase";
import { UserContext } from "#context/UserContext";
import { type ChartRivalsReturn } from "#types/api-returns";
import { type RivalChartDataset } from "#types/tables";
import { NumericSOV } from "#util/sorts";
import React, { useContext } from "react";
import { Col } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	type GameGroup,
	GetGamePTConfig,
	type MONGO_ChartDocument,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";

export default function RivalCompare({
	chart,
	game,
}: {
	chart: MONGO_ChartDocument;
	game: GameGroup;
}) {
	const { user: currentUser } = useContext(UserContext);

	const playtype = chart.playtype;

	if (!currentUser) {
		return <div>You're not signed in. How did you even get to this page?</div>;
	}

	return <Inner chart={chart} currentUser={currentUser} game={game} playtype={playtype} />;
}

function Inner({
	currentUser,
	game,
	playtype,
	chart,
}: {
	chart: MONGO_ChartDocument;
	currentUser: MONGO_UserDocument;
	game: GameGroup;
	playtype: Playtype;
}) {
	const base = useUGPTBase({ reqUser: currentUser, game, playtype });

	const { data, error } = useApiQuery<ChartRivalsReturn>(
		`/users/${currentUser.id}/games/${game}/${playtype}/pbs/${chart.chartID}/rivals`,
	);

	if (!data) {
		return <Loading />;
	}

	if (error) {
		return <ApiError error={error} />;
	}

	if (data.rivals.length === 0) {
		return (
			<div className="w-100 text-center">
				You have no rivals set!
				<br />
				Why not <Link to={`${base}/rivals/manage`}>set some?</Link>
			</div>
		);
	}

	const gptConfig = GetGamePTConfig(game, playtype);

	const rivalDataset: RivalChartDataset = [...data.rivals, currentUser]
		.map((u) => ({
			...u,
			__related: {
				pb: data.pbs.find((p) => p.userID === u.id) ?? null,
			},
		}))
		.sort(
			NumericSOV(
				// @ts-expect-error this access is obviously legal
				(x) => x.__related.pb?.scoreData[gptConfig.defaultMetric] ?? -Infinity,
				true,
			),
		)
		.map((e, index) => ({
			...e,
			__related: {
				...e.__related,
				index,
			},
		}));

	return (
		<Col xs={12}>
			<RivalChartTable chart={chart} dataset={rivalDataset} game={game} />
		</Col>
	);
}
