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
import { FormatGameGroup, GetGameGroupConfig } from "tachi-common";

export default function UGPTUtilsPage({ reqUser, game, playtype }: UGPT) {
	const gameConfig = GetGameGroupConfig(game);
	const { user } = useContext(UserContext);

	const isViewingOwnProfile = user?.id === reqUser.id;

	const utils = GetGPTUtils(game, playtype);
	const pageName = GetGPTUtilsName(game, playtype, isViewingOwnProfile);

	useSetSubheader(
		["Users", reqUser.username, "Games", gameConfig.name, playtype, pageName ?? "Utils"],
		[reqUser, game, playtype],
		`${reqUser.username}'s ${FormatGameGroup(game, playtype)} ${pageName ?? "Utils"}`,
	);

	return (
		<Row>
			<Switch>
				<Route exact path="/u/:userID/games/:game/:playtype/utils">
					{utils.map((util) => (
						<Col className="my-4" key={util.urlPath} lg={6} xs={12}>
							<Card
								footer={
									<div className="d-flex w-100 justify-content-end">
										<LinkButton
											to={`/u/${reqUser.username}/games/${game}/${playtype}/utils/${util.urlPath}`}
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
						path={`/u/:userID/games/:game/:playtype/utils/${tool.urlPath}`}
					>
						<Col className="mt-4" xs={12}>
							<Card
								footer={
									<Link
										className="text-body-secondary text-hover-white"
										to={`/u/${reqUser.username}/games/${game}/${playtype}/utils`}
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
						<Col xs={12}>{tool.component({ reqUser, game, playtype })}</Col>
					</Route>
				))}
			</Switch>
		</Row>
	);
}
