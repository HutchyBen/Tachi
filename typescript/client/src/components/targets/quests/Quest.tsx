import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Card from "#components/layout/page/Card";
import Divider from "#components/util/Divider";
import GoalLink from "#components/util/GoalLink";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { TargetsContext } from "#context/TargetsContext";
import { UserContext } from "#context/UserContext";
import { type GamePT } from "#types/react";
import { APIFetchV1 } from "#util/api";
import { GetGoalIDsFromQuest } from "#util/data";
import { HumanisedJoinArray } from "#util/misc";
import { FormatTime } from "#util/time";
import React, { useContext, useState } from "react";
import { Badge, Button } from "react-bootstrap";
import {
	FormatGameGroup,
	type GoalDocument,
	type GoalSubscriptionDocument,
	type QuestDocument,
	type QuestSection,
} from "tachi-common";

export default function Quest({
	quest,
	goals,
	collapsible = false,
}: {
	collapsible?: boolean;
	goals: Map<string, GoalDocument>;
	quest: QuestDocument;
}) {
	const { user } = useContext(UserContext);
	const { questSubs, reloadTargets } = useContext(TargetsContext);
	const [subscribing, setSubscribing] = useState(false);

	const questSub = questSubs.get(quest.questID);
	const goalsInQuests = GetGoalIDsFromQuest(quest).length;

	// if this is collapsable, show it conditionally. otherwise, always show it.
	const [show, setShow] = useState(!collapsible);

	return (
		<Card
			header={
				<div>
					<h3>{quest.name}</h3>

					<div>{quest.desc}</div>
					<div className="mt-4">
						<Muted>Game: {FormatGameGroup(quest.game, quest.playtype)}</Muted>
					</div>

					{questSub && (
						<div className="w-100 mt-4">
							<h4>
								Progress:{" "}
								{questSub.achieved ? (
									<Badge bg="success">COMPLETE!</Badge>
								) : (
									<span>
										<span className="text-danger">{questSub.progress}</span>
										<Muted>/{goalsInQuests}</Muted>
									</span>
								)}
							</h4>
						</div>
					)}

					<div className="d-flex w-100 mt-4">
						{user &&
							(questSub ? (
								<Button
									className="ms-auto"
									disabled={subscribing}
									onClick={async () => {
										setSubscribing(true);

										await APIFetchV1(
											`/users/${user.id}/games/${quest.game}/${quest.playtype}/targets/quests/${quest.questID}`,
											{
												method: "DELETE",
											},
											true,
											true,
										);
										await reloadTargets();

										setSubscribing(false);
									}}
									variant="outline-danger"
								>
									{subscribing ? (
										"Unsubscribing..."
									) : (
										<>
											<Icon type="trash" /> Unsubscribe
										</>
									)}
								</Button>
							) : (
								<Button
									className="ms-auto"
									disabled={subscribing}
									onClick={async () => {
										setSubscribing(true);

										await APIFetchV1(
											`/users/${user.id}/games/${quest.game}/${quest.playtype}/targets/quests/${quest.questID}`,
											{
												method: "PUT",
											},
											true,
											true,
										);
										await reloadTargets();

										setSubscribing(false);
									}}
									variant="outline-success"
								>
									{subscribing ? (
										"Subscribing..."
									) : (
										<>
											<Icon type="scroll" /> Subscribe to Quest
										</>
									)}
								</Button>
							))}
					</div>
				</div>
			}
		>
			{show &&
				quest.questData.map((e, i) => (
					<React.Fragment key={i}>
						<QuestSectionComponent
							game={quest.game}
							goals={goals}
							playtype={quest.playtype}
							section={e}
						/>
						<Divider />
					</React.Fragment>
				))}

			{collapsible && (
				<div
					className="d-flex w-100 justify-content-center text-hover-white"
					onClick={() => setShow(!show)}
				>
					<Icon type={`chevron-${show ? "up" : "down"}`} />
				</div>
			)}
		</Card>
	);
}

function QuestSectionComponent({
	section,
	game,
	playtype,
	goals,
}: {
	goals: Map<string, GoalDocument>;
	section: QuestSection;
} & GamePT) {
	return (
		<div>
			<h5>{section.title}</h5>
			{section.desc && <div>{section.desc}</div>}
			<br />
			{section.goals.length === 0 ? (
				<Muted>No Goals...</Muted>
			) : (
				<div className="ps-6">
					{section.goals.map((e, i) => {
						const goal = goals.get(e.goalID);

						if (!goal) {
							return (
								<div key={i}>
									Unknown goal '{e.goalID}'. This should never happen.
								</div>
							);
						}

						return (
							<div className="pb-2" key={i}>
								<InnerQuestSectionGoal goal={goal} note={e.note} />
							</div>
						);
					})}
				</div>
			)}
			<br />
		</div>
	);
}

export function InnerQuestSectionGoal({
	goal,
	note,
	dependencies,
	goalSubOverride,
}: {
	dependencies?: string[];
	goal: GoalDocument;
	goalSubOverride?: GoalSubscriptionDocument;
	note?: string;
}) {
	const { goalSubs } = useContext(TargetsContext);

	const goalSub = goalSubOverride ?? goalSubs.get(goal.goalID);

	if (!goalSub) {
		return (
			<>
				<div className="w-100 d-flex">
					<div>
						<Icon
							style={{ verticalAlign: "middle", fontSize: "0.4rem" }}
							type="circle"
						/>
					</div>

					<GoalLink goal={goal} />
				</div>
				{note && <Muted>{note}</Muted>}
			</>
		);
	}

	return (
		<>
			<div className="w-100 d-flex">
				<QuickTooltip
					tooltipContent={
						goalSub.achieved
							? `Achieved on ${FormatTime(goalSub.timeAchieved)}`
							: goalSub.lastInteraction
								? `Last raised on ${FormatTime(goalSub.lastInteraction)}`
								: `Never Attempted.`
					}
				>
					<div>
						{goalSub.achieved ? (
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

				<GoalLink goal={goal} />

				{!goalSub.achieved && (
					<div className="ms-auto text-end text-danger">
						<span className="text-danger">{goalSub.progressHuman}</span>
						<Muted> / {goalSub.outOfHuman}</Muted>
					</div>
				)}
			</div>
			<div>
				{note && <Muted>{note}</Muted>}
				{dependencies && (
					<FormatGoalDependencies
						deps={dependencies}
						isStandalone={goalSub.wasAssignedStandalone}
					/>
				)}
			</div>
		</>
	);
}

function FormatGoalDependencies({ deps, isStandalone }: { deps: string[]; isStandalone: boolean }) {
	let str;
	if (isStandalone && deps.length === 0) {
		str = `You set this goal directly.`;
	} else if (isStandalone && deps.length > 0) {
		str = `You set this goal, but it's also in ${HumanisedJoinArray(deps, "and")}.`;
	} else if (deps.length === 0) {
		return null;
	} else {
		str = `From ${HumanisedJoinArray(deps, "and")}.`;
	}

	return <Muted>{str}</Muted>;
}
