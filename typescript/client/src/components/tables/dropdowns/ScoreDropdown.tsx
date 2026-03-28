import DebugContent from "#components/util/DebugContent";
import HasDevModeOn from "#components/util/HasDevModeOn";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectButton from "#components/util/SelectButton";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { UserContext } from "#context/UserContext";
import { type GoalsOnChartReturn, type UGPTChartPBComposition } from "#types/api-returns";
import { type GamePT, type SetState } from "#types/react";
import React, { useContext, useReducer, useState } from "react";
import {
	type MONGO_ChartDocument,
	type MONGO_PBScoreDocument,
	type MONGO_ScoreDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
	UserAuthLevels,
} from "tachi-common";

import DeleteScoreBtn from "./components/DeleteScoreBtn";
import DocComponentCreator, { type DocumentComponentType } from "./components/DocumentComponent";
import DropdownStructure from "./components/DropdownStructure";
import PBCompare from "./components/PBCompare";
import PlayHistory from "./components/PlayHistory";
import RivalCompare from "./components/RivalCompare";
import TargetInfo from "./components/TargetInfo";
import { GPTDropdownSettings } from "./GPTDropdownSettings";

export interface ScoreState {
	highlight: boolean;
	setHighlight: SetState<boolean>;
}

export interface ScoreDropdownProps {
	score: MONGO_PBScoreDocument | MONGO_ScoreDocument;
	scoreState: ScoreState;
}

export default function ScoreDropdown({
	game,
	playtype,
	user,
	chart,
	song,
	scoreState,
	thisScore,
	defaultView = "moreInfo",
	onScoreUpdate,
}: {
	chart: MONGO_ChartDocument;
	defaultView?: "debug" | "history" | "manage" | "moreInfo" | "rivals" | "targets" | "vsPB";
	onScoreUpdate?: (sc: MONGO_ScoreDocument) => void;
	scoreState: ScoreState;
	song: MONGO_SongDocument;
	thisScore: MONGO_ScoreDocument;
	user: MONGO_UserDocument;
} & GamePT) {
	const DocComponent: DocumentComponentType = (props) =>
		DocComponentCreator({
			renderScoreInfo: false,
			...props,
			...GPTDropdownSettings(game, playtype),
		});

	const [view, setView] = useState(defaultView);
	const { user: currentUser } = useContext(UserContext);
	const { settings } = useLUGPTSettings();

	const { data, error } = useApiQuery<UGPTChartPBComposition>(
		`/users/${user.id}/games/${game}/${playtype}/pbs/${chart.chartID}?getComposition=true`,
	);

	const { error: histError, data: histData } = useApiQuery<MONGO_ScoreDocument[]>(
		`/users/${user.id}/games/${game}/${playtype}/scores/${chart.chartID}`,
	);

	const [shouldRefresh, forceRefresh] = useReducer((state) => state + 1, 0);

	const { error: targetError, data: targetData } = useApiQuery<GoalsOnChartReturn>(
		`/users/${currentUser?.id ?? ""}/games/${game}/${playtype}/targets/on-chart/${
			chart.chartID
		}`,
		undefined,
		[shouldRefresh],
		// when a user isn't logged in, skip ever making this request.
		currentUser === null,
	);

	if (error) {
		return <>An error has occurred. Whoops.</>;
	}

	if (!data) {
		return (
			<div className="d-flex align-items-center" style={{ height: "200px" }}>
				<Loading />
			</div>
		);
	}

	let body;

	if (view === "history") {
		body = (
			<PlayHistory
				chart={chart}
				data={histData}
				error={histError}
				game={game}
				playtype={playtype}
			/>
		);
	} else if (view === "debug") {
		body = <DebugContent data={data} />;
	} else if (view === "moreInfo") {
		body = (
			<DocComponent
				chart={chart}
				onScoreUpdate={onScoreUpdate}
				pbData={data}
				score={thisScore as any}
				scoreState={scoreState}
			/>
		);
	} else if (view === "vsPB") {
		body = <PBCompare data={data} DocComponent={DocComponent} scoreState={scoreState} />;
	} else if (view === "manage") {
		body = <DeleteScoreBtn score={thisScore} />;
	} else if (view === "targets") {
		if (currentUser) {
			body = (
				<TargetInfo
					chart={chart}
					data={targetData}
					error={targetError}
					game={game}
					onGoalSet={forceRefresh}
					playtype={playtype}
					reqUser={currentUser}
					song={song}
				/>
			);
		} else {
			body = <>not possible, shouldn't've got here.</>;
		}
	} else if (view === "rivals") {
		body = <RivalCompare chart={chart} game={game} />;
	}

	return (
		<DropdownStructure
			buttons={
				<>
					<SelectButton id="moreInfo" setValue={setView} value={view}>
						<Icon type="chart-bar" /> This Score
					</SelectButton>
					<SelectButton id="vsPB" setValue={setView} value={view}>
						<Icon type="trophy" /> Chart PB
					</SelectButton>
					<SelectButton id="history" setValue={setView} value={view}>
						<Icon type="history" /> Play History{histData && ` (${histData.length})`}
					</SelectButton>
					{currentUser?.id === user.id && (
						<SelectButton id="targets" setValue={setView} value={view}>
							<Icon type="scroll" /> Goals & Quests
							{targetData && ` (${targetData.goals.length})`}
						</SelectButton>
					)}
					{currentUser?.id === user.id && settings?.rivals && (
						<SelectButton id="rivals" setValue={setView} value={view}>
							<Icon type="users" /> Rivals
						</SelectButton>
					)}
					{(currentUser?.id === user.id ||
						currentUser?.authLevel === UserAuthLevels.ADMIN) && (
						<SelectButton id="manage" setValue={setView} value={view}>
							<Icon type="trash" /> Delete Score
						</SelectButton>
					)}
					<HasDevModeOn>
						<SelectButton id="debug" setValue={setView} value={view}>
							<Icon type="bug" /> Debug Info
						</SelectButton>
					</HasDevModeOn>
				</>
			}
		>
			{body}
		</DropdownStructure>
	);
}
