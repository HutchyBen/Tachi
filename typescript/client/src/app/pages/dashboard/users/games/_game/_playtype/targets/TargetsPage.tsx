import useSetSubheader from "#components/layout/header/useSetSubheader";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import SelectLinkButton from "#components/util/SelectLinkButton";
import useUGPTBase from "#components/util/useUGPTBase";
import { type UGPT } from "#types/react";
import React from "react";
import { Col, Row } from "react-bootstrap";
import { Route, Switch } from "react-router-dom";
import { FormatGame, GameToGameGroup, GetGameGroupConfig } from "tachi-common";

import UGPTGoalsPage from "./UGPTGoalsPage";
import UGPTQuestsPage from "./UGPTQuestsPage";

export default function TargetsPage({ reqUser, game }: UGPT) {
	useSetSubheader(
		[
			"Users",
			reqUser.username,
			"Games",
			GetGameGroupConfig(GameToGameGroup(game)).name,
			"Goals & Quests",
		],
		[reqUser, game],
		`${reqUser.username}'s ${FormatGame(game)} Goals & Quests`,
	);

	const base = useUGPTBase({ reqUser, game });

	return (
		<Row>
			<Col className="text-center" xs={12}>
				<div className="btn-group d-flex justify-content-center">
					<SelectLinkButton to={`${base}/targets`}>
						<Icon type="scroll" /> Quests
					</SelectLinkButton>
					<SelectLinkButton to={`${base}/targets/goals`}>
						<Icon type="bullseye" /> Goals
					</SelectLinkButton>
				</div>
				<Divider />
			</Col>
			<Col xs={12}>
				<Switch>
					<Route exact path="/u/:userID/games/:game/targets/goals">
						<UGPTGoalsPage {...{ reqUser, game }} />
					</Route>
					<Route exact path="/u/:userID/games/:game/targets">
						<UGPTQuestsPage {...{ reqUser, game }} />
					</Route>
				</Switch>
			</Col>
		</Row>
	);
}
