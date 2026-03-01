import Card from "#components/layout/page/Card";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import SelectButton from "#components/util/SelectButton";
import { useBucket } from "#components/util/useBucket";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GamePT } from "#types/react";
import { type FolderDataset } from "#types/tables";
import { UppercaseFirst } from "#util/misc";
import React, { useMemo, useState } from "react";
import {
	GetGamePTConfig,
	GetScoreEnumConfs,
	type GPTString,
	type UserDocument,
} from "tachi-common";

import FolderMinimap from "./FolderMinimap";
import FolderScoreAverages from "./FolderScoreAverages";
import FolderScoreDistributionChart from "./FolderScoreDistributionChart";

export default function FolderInfoHeader({
	game,
	playtype,
	reqUser,
	folderDataset,
	folderTitle,
}: {
	folderDataset: FolderDataset;
	folderTitle: string;
	reqUser: UserDocument;
} & GamePT) {
	const preferredDefaultEnum = useBucket(game, playtype);

	const [currentGraph, setCurrentGraph] = useState<string>(`${preferredDefaultEnum}-stats`);

	const enumGraphs = ["minimap", "stats"];

	const gptConfig = GetGamePTConfig(game, playtype);
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[`${game}:${playtype}` as GPTString];

	const enumConf = GetScoreEnumConfs(gptConfig);

	const [metric, type] = useMemo(() => currentGraph.split("-"), [currentGraph]);

	return (
		<Card header={`${reqUser.username}'s ${folderTitle} Breakdown`}>
			<div className="col-12 d-flex justify-content-center">
				<div className="btn-group">
					{enumGraphs.flatMap((g) =>
						Object.keys(enumConf).flatMap((en) => (
							<SelectButton
								className={
									g === "minimap" ? "d-none d-lg-block text-wrap" : "text-wrap"
								}
								id={`${en}-${g}`}
								key={`${en}-${g}`}
								setValue={setCurrentGraph}
								value={currentGraph}
							>
								{/* @ts-expect-error zzz */}
								<Icon type={gptImpl.enumIcons[en]} /> {UppercaseFirst(en)}{" "}
								{UppercaseFirst(g)}
							</SelectButton>
						)),
					)}
					<SelectButton
						className="text-wrap"
						id="score"
						setValue={setCurrentGraph}
						value={currentGraph}
					>
						<Icon type="sort" /> Score Averages
					</SelectButton>
				</div>
			</div>
			<div className="col-12">
				<Divider />
			</div>

			{type === "stats" ? (
				<FolderScoreDistributionChart
					folderDataset={folderDataset}
					game={game}
					playtype={playtype}
					view={metric}
				/>
			) : type === "minimap" ? (
				<FolderMinimap
					enumMetric={metric}
					folderDataset={folderDataset}
					game={game}
					playtype={playtype}
					reqUser={reqUser}
				/>
			) : (
				<FolderScoreAverages
					folderDataset={folderDataset}
					game={game}
					playtype={playtype}
					reqUser={reqUser}
				/>
			)}
		</Card>
	);
}
