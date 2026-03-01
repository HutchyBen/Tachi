import useSetSubheader from "#components/layout/header/useSetSubheader";
import Questline from "#components/targets/Questline";
import Quest from "#components/targets/quests/Quest";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { type QuestlineReturn } from "#types/api-returns";
import { type GamePT } from "#types/react";
import { CreateGoalMap } from "#util/data";
import { CreateQuestMap } from "#util/misc";
import React from "react";
import { Col, Row } from "react-bootstrap";
import { Link, useParams } from "react-router-dom";
import { GetGameGroupConfig } from "tachi-common";

export default function QuestlinePage({ game, playtype }: GamePT) {
	const { questlineID } = useParams<{ questlineID: string }>();

	const { data, error } = useApiQuery<QuestlineReturn>(
		`/games/${game}/${playtype}/targets/questlines/${questlineID}`,
	);

	useSetSubheader(
		[
			"Games",
			GetGameGroupConfig(game).name,
			playtype,
			"Quests",
			data ? data.questline.name : "Loading...",
		],
		[game, playtype, data],
		data ? data.questline.name : "Loading...",
	);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const goalMap = CreateGoalMap(data.goals);

	const questMap = CreateQuestMap(data.quests);

	return (
		<Row>
			<Col xs={12}>
				<Link to={`/games/${game}/${playtype}/quests`}>Go back to all questlines...</Link>
				<Divider />
				<Questline questline={data.questline} quests={questMap} />
				<Divider />
			</Col>
			{data.questline.quests.map((questID) => {
				const quest = questMap.get(questID);

				if (!quest) {
					// shouldn't happen, but paste over it.
					return null;
				}

				return (
					<Col
						className="offset-lg-2 my-4 quest-anchor"
						id={quest.questID}
						key={quest.questID}
						lg={8}
						xs={12}
					>
						<Quest collapsible goals={goalMap} quest={quest} />
					</Col>
				);
			})}
		</Row>
	);
}
