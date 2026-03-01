import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Card from "#components/layout/page/Card";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import LinkButton from "#components/util/LinkButton";
import Muted from "#components/util/Muted";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { TargetsContext } from "#context/TargetsContext";
import { APIFetchV1 } from "#util/api";
import { GetGoalIDsFromQuest } from "#util/data";
import { FormatTime } from "#util/time";
import React, { useContext } from "react";
import { Button, Col } from "react-bootstrap";
import { type QuestDocument, type QuestlineDocument } from "tachi-common";

export default function Questline({
	questline,
	quests,
}: {
	questline: QuestlineDocument;
	quests?: Map<string, QuestDocument>;
}) {
	const { game, playtype } = questline;

	return (
		<Card
			header={
				<div>
					<h4>{questline.name}</h4>
					<Muted>{questline.quests.length} Quests</Muted>
				</div>
			}
		>
			{questline.desc}
			<Divider />

			{quests && (
				<>
					<Col className="offset-lg-3" lg={6} xs={12}>
						{questline.quests.map((questID) => {
							const quest = quests.get(questID);

							// shouldn't happen. hide it.
							if (!quest) {
								return null;
							}

							return (
								<div
									className="d-flex align-items-center my-4"
									key={questID}
									style={{
										verticalAlign: "middle",
									}}
								>
									<InnerQuestInfo quest={quest} />
								</div>
							);
						})}
					</Col>
					<Divider />
				</>
			)}

			{!quests && (
				<div className="d-flex w-100 justify-content-end">
					<LinkButton
						to={`/games/${game}/${playtype}/questlines/${questline.questlineID}`}
					>
						View Quests
					</LinkButton>
				</div>
			)}
		</Card>
	);
}

export function InnerQuestInfo({ quest }: { quest: QuestDocument }) {
	const { settings } = useLUGPTSettings();
	const { questSubs, reloadTargets } = useContext(TargetsContext);

	const { game, playtype } = quest;
	const questSub = questSubs.get(quest.questID);

	if (!questSub) {
		return (
			<>
				<div className="w-100 d-flex">
					<div>
						<Icon
							style={{ verticalAlign: "middle", fontSize: "0.4rem" }}
							type="circle"
						/>
					</div>

					<a className="text-decoration-none ms-2" href={`#${quest.questID}`}>
						{quest.name}
					</a>

					{settings && (
						<div className="ms-auto text-danger">
							<Button
								onClick={async () => {
									await APIFetchV1(
										`/users/${settings.userID}/games/${game}/${playtype}/targets/quests/${quest.questID}`,
										{ method: "PUT" },
										true,
										true,
									);

									reloadTargets();
								}}
								variant="outline-success"
							>
								Subscribe
							</Button>
						</div>
					)}
				</div>
			</>
		);
	}

	return (
		<>
			<div className="w-100 d-flex">
				<QuickTooltip
					tooltipContent={
						questSub.achieved
							? `Achieved on ${FormatTime(questSub.timeAchieved ?? 0)}`
							: questSub.lastInteraction
								? `Last raised on ${FormatTime(questSub.lastInteraction ?? 0)}`
								: `Freshly Assigned!`
					}
				>
					<div>
						{questSub.achieved ? (
							<Icon
								colour="success"
								regular
								style={{ verticalAlign: "middle" }}
								type="check-square"
							/>
						) : (
							<Icon
								colour="danger"
								regular
								style={{ verticalAlign: "middle" }}
								type="square"
							/>
						)}
					</div>
				</QuickTooltip>

				<a className="text-decoration-none ms-2" href={`#${quest.questID}`}>
					{quest.name}
				</a>

				{!questSub.achieved && (
					<div className="ms-auto text-danger">
						<span className="text-danger">{questSub.progress}</span>
						<Muted> / {GetGoalIDsFromQuest(quest).length}</Muted>
					</div>
				)}
			</div>
		</>
	);
}
