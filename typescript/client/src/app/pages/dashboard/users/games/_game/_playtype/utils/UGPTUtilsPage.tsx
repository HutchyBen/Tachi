import { GetGPTUtils, GetGPTUtilsName } from "#components/gpt-utils/GPTUtils";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import Divider from "#components/util/Divider";
import LinkButton from "#components/util/LinkButton";
import { UserContext } from "#context/UserContext";
import { type UGPT } from "#types/react";
import React, { useContext } from "react";
import { Col, Row } from "react-bootstrap";
import { Link, Route, Switch } from "react-router-dom";
import { FormatGame, GameToGameGroup, GetGameGroupConfig } from "tachi-common";

export default function UGPTUtilsPage({ reqUser, game }: UGPT) {
	const { user } = useContext(UserContext);

	const isViewingOwnProfile = user?.id === reqUser.id;

	const utils = GetGPTUtils(game);
	const pageName = GetGPTUtilsName(game, isViewingOwnProfile);

	useSetSubheader(
		[
			"Users",
			reqUser.username,
			"Games",
			GetGameGroupConfig(GameToGameGroup(game)).name,
			pageName ?? "Utils",
		],
		[reqUser, game],
		`${reqUser.username}'s ${FormatGame(game)} ${pageName ?? "Utils"}`,
	);

	return (
		<Row>
			<Switch>
				<Route exact path="/u/:userID/games/:game/utils">
					{utils.map((util) => (
						<Col className="my-4" key={util.urlPath} lg={6} xs={12}>
							<Card
								footer={
									<div className="d-flex w-100 justify-content-end">
										<LinkButton
											to={`/u/${reqUser.username}/games/${game}/utils/${util.urlPath}`}
										>
											View
										</LinkButton>
									</div>
								}
								header={util.name}
							>
								{util.description}
							</Card>
						</Col>
					))}
				</Route>

				{utils.map((tool) => (
					<Route
						exact
						key={tool.urlPath}
						path={`/u/:userID/games/:game/utils/${tool.urlPath}`}
					>
						<Col className="mt-4" xs={12}>
							<Card
								footer={
									<Link
										className="text-body-secondary text-hover-white"
										to={`/u/${reqUser.username}/games/${game}/utils`}
									>
										&lt; Back to all tools...
									</Link>
								}
								header={tool.name}
							>
								{tool.description}
							</Card>
							<Divider />
						</Col>
						<Col xs={12}>{tool.component({ reqUser, game })}</Col>
					</Route>
				))}
			</Switch>
		</Row>
	);
}
