import AddNewGoalForQuestModal from "#components/targets/AddNewGoalForQuestModal";
import DeleteGoalsModal from "#components/targets/DeleteGoalsModal";
import GoalSubInfo from "#components/targets/GoalSubInfo";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { TargetsContext } from "#context/TargetsContext";
import { type AllUGPTGoalsReturn } from "#types/api-returns";
import { type UGPT } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { CreateGoalSubDataset } from "#util/data";
import React, { useContext, useReducer, useState } from "react";
import { Button, Col } from "react-bootstrap";
import { Link } from "react-router-dom";
import { FormatGame } from "tachi-common";

export default function UGPTGoalsPage({ reqUser, game }: UGPT) {
	const [show, setShow] = useState(false);
	const [showDelete, setShowDelete] = useState(false);
	const { reloadTargets } = useContext(TargetsContext);
	const [refresh, refetchGoals] = useReducer((x) => x + 1, 0);

	const { data, error } = useApiQuery<AllUGPTGoalsReturn>(
		`/users/${reqUser.id}/games/${game}/targets/goals`,
		undefined,
		[refresh.toString()],
	);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const userMap = new Map([[reqUser.id, reqUser]]);

	const dataset = CreateGoalSubDataset(data, userMap);

	return (
		<div>
			<Col xs={12}>
				<Button
					className="mb-4 w-100"
					onClick={() => setShow(true)}
					size="lg"
					variant="outline-success"
				>
					<Icon type="bullseye" /> Add New Goal
				</Button>
				<Button
					className="mb-4 w-100"
					onClick={() => setShowDelete(true)}
					size="lg"
					variant="outline-danger"
				>
					<Icon type="trash" /> Delete Goals
				</Button>
				<div>
					Looking for goal recommendations?{" "}
					<Link to={`/games/${game}/quests`}>Check out {FormatGame(game)}'s Quests</Link>.
				</div>
				<Divider />
				<GoalSubInfo dataset={dataset} game={game} />
			</Col>
			{show && (
				<AddNewGoalForQuestModal
					game={game}
					noNote
					onCreate={async (rawGoal) => {
						await APIFetchV1(
							`/users/${reqUser.id}/games/${game}/targets/goals/add-goal`,
							{
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({
									criteria: rawGoal.goal.criteria,
									charts: rawGoal.goal.charts,
								}),
							},
							true,
							true,
						);

						refetchGoals();
						reloadTargets();
					}}
					setShow={setShow}
					show={show}
				/>
			)}
			{showDelete && (
				<DeleteGoalsModal
					dataset={dataset}
					onDelete={async (goalID) => {
						await APIFetchV1(
							`/users/${reqUser.id}/games/${game}/targets/goals/${goalID}`,
							{
								method: "DELETE",
							},
							true,
							true,
						);

						refetchGoals();

						reloadTargets();
					}}
					setShow={setShowDelete}
					show={showDelete}
				/>
			)}
		</div>
	);
}
