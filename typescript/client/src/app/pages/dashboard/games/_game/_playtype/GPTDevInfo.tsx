import ClassBadge from "#components/game/ClassBadge";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import MiniTable from "#components/tables/components/MiniTable";
import DebugContent from "#components/util/DebugContent";
import { type GamePT } from "#types/react";
import React from "react";
import {
	type Classes,
	FormatGame,
	GameToGameGroup,
	GetGameConfig,
	GetGameGroupConfig,
	type V3Game,
} from "tachi-common";

export default function GPTDevInfo({ game }: GamePT) {
	useSetSubheader(
		["Games", GetGameGroupConfig(GameToGameGroup(game)).name, "Dev Info"],
		[game],
		`${FormatGame(game)} Dev Info`,
	);

	const gameGroupConfig = GetGameConfig(game);

	return (
		<>
			<Card header="GPT Configuration">
				<DebugContent data={gameGroupConfig} />
			</Card>
			<Card className="mt-4" header="Class Badges">
				<div className="d-flex w-100 justify-content-center" style={{ gap: "30px" }}>
					{Object.entries(gameGroupConfig.classes).map(([classSet, conf]) => (
						<div key={classSet}>
							<MiniTable colSpan={2} headers={[classSet]}>
								{conf.values.map((e) => (
									<tr key={e.id}>
										<td>{e.id}</td>
										<td>
											<ClassBadge
												classSet={classSet as Classes[V3Game]}
												classValue={e.id}
												game={game}
											/>
										</td>
									</tr>
								))}
							</MiniTable>
						</div>
					))}
				</div>
			</Card>
		</>
	);
}
