import GoalSubInfo from "#components/targets/GoalSubInfo";
import SetNewGoalModal from "#components/targets/SetNewGoalModal";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { TargetsContext } from "#context/TargetsContext";
import { type GoalsOnChartReturn, type GoalsOnFolderReturn } from "#types/api-returns";
import { type UGPT } from "#types/react";
import { CreateGoalSubDataset, CreateUserMap } from "#util/data";
import React, { useContext, useReducer, useState } from "react";
import { Button, Col } from "react-bootstrap";
import { type MONGO_FolderDocument } from "tachi-common";

export default function FolderQuestsPage({
	folder,
	game,
	playtype,
	reqUser,
}: {
	folder: MONGO_FolderDocument;
} & UGPT) {
	const [refresh, forceRefresh] = useReducer((x) => x + 1, 0);
	const { reloadTargets } = useContext(TargetsContext);

	const { data, error } = useApiQuery<GoalsOnChartReturn>(
		`/users/${reqUser.id}/games/${game}/${playtype}/targets/on-folder/${folder.folderID}`,
		undefined,
		[refresh],
	);

	const [show, setShow] = useState(false);

	return (
		<div>
			<Col className="w-100 d-flex justify-content-center" xs={12}>
				<Button onClick={() => setShow(true)} variant="outline-success">
					Set New Folder Goal
				</Button>
			</Col>
			<Divider />
			{error && <ApiError error={error} />}
			{data ? (
				<FolderQuestsInner {...{ reqUser, game, playtype, folder, data }} />
			) : (
				<Loading />
			)}

			{show && (
				<SetNewGoalModal
					{...{ game, playtype, reqUser, show, setShow }}
					onNewGoalSet={() => {
						forceRefresh();
						reloadTargets();
					}}
					preData={folder}
				/>
			)}
		</div>
	);
}

function FolderQuestsInner({
	reqUser,
	game,
	playtype,
	folder,
	data,
}: {
	data: GoalsOnFolderReturn;
	folder: MONGO_FolderDocument;
} & UGPT) {
	const userMap = CreateUserMap([reqUser]);

	return (
		<GoalSubInfo
			dataset={CreateGoalSubDataset(data, userMap)}
			game={game}
			playtype={playtype}
		/>
	);
}
