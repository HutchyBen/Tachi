import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Card from "#components/layout/page/Card";
import AddNewGoalForQuestModal from "#components/targets/AddNewGoalForQuestModal";
import Divider from "#components/util/Divider";
import EditableText from "#components/util/EditableText";
import Icon from "#components/util/Icon";
import Muted from "#components/util/Muted";
import { type GamePT } from "#types/react";
import { type RawQuestDocument, type RawQuestGoal, type RawQuestSection } from "#types/tachi";
import { ChangeAtPosition, CopyToClipboard, DeleteInPosition } from "#util/misc";
import React, { useState } from "react";
import { Button } from "react-bootstrap";
import { FormatGameGroup } from "tachi-common";

export default function EditableQuest({
	quest,
	onChange,
	onDelete,
}: {
	onChange: (rq: RawQuestDocument) => void;
	onDelete: () => void;
	quest: RawQuestDocument;
}) {
	return (
		<Card
			header={
				<div className="vstack gap-2">
					<EditableText
						as="h1"
						authorised
						initialText={quest.name}
						onSubmit={(name) =>
							onChange({
								...quest,
								name,
							})
						}
						placeholderText={quest.name || "Untitled Quest"}
					/>

					<EditableText
						authorised
						initialText={quest.desc}
						onSubmit={(desc) =>
							onChange({
								...quest,
								desc,
							})
						}
						placeholderText={quest.desc || "Please set a description."}
					/>

					<Muted>Game: {FormatGameGroup(quest.game, quest.playtype)}</Muted>
				</div>
			}
		>
			{quest.rawQuestData.map((e, i) => (
				<React.Fragment key={i}>
					<QuestSection
						game={quest.game}
						onChange={(newSection) =>
							onChange({
								...quest,
								rawQuestData: ChangeAtPosition(quest.rawQuestData, newSection, i),
							})
						}
						onDelete={() =>
							onChange({
								...quest,
								rawQuestData: DeleteInPosition(quest.rawQuestData, i),
							})
						}
						playtype={quest.playtype}
						section={e}
					/>
					<Divider />
				</React.Fragment>
			))}
			<div className="d-flex w-100 justify-content-center">
				<Button
					onClick={() =>
						onChange({
							...quest,
							rawQuestData: [
								...quest.rawQuestData,
								{
									title: "Untitled Section",
									desc: "",
									rawGoals: [],
								},
							],
						})
					}
					variant="outline-success"
				>
					<Icon type="plus" />
					Add New Quest Section
				</Button>
			</div>
			<Divider />
			<div className="d-flex w-100">
				<div className="me-auto">
					<QuickTooltip tooltipContent="Copy this quest to your clipboard in a pretty format.">
						<Button
							onClick={() => {
								CopyToClipboard(FormatQuest(quest));
							}}
							variant="outline-info"
						>
							Copy To Clipboard
						</Button>
					</QuickTooltip>
				</div>
				<div className="ms-auto">
					<Button
						onClick={() => {
							if (confirm("Are you absolutely sure you want to delete this quest?")) {
								onDelete();
							}
						}}
						variant="outline-danger"
					>
						<Icon noPad type="trash" />
					</Button>
				</div>
			</div>
		</Card>
	);
}

function QuestSection({
	section,
	game,
	playtype,
	onChange,
	onDelete,
}: {
	onChange: (newSection: RawQuestSection) => void;
	onDelete: () => void;
	section: RawQuestSection;
} & GamePT) {
	const [show, setShow] = useState(false);

	return (
		<>
			<div className="vstack gap-2">
				<EditableText
					as="h4"
					authorised
					initialText={section.title}
					onSubmit={(title) =>
						onChange({
							...section,
							title,
						})
					}
					placeholderText="Untitled Section"
				/>

				<EditableText
					authorised
					initialText={section.desc}
					onSubmit={(desc) =>
						onChange({
							...section,
							desc,
						})
					}
					placeholderText="No Description..."
				/>
			</div>
			<br />
			{section.rawGoals.length === 0 ? (
				<Muted>No Goals...</Muted>
			) : (
				<ul>
					{section.rawGoals.map((e, i) => (
						<InnerQuestSectionGoal
							game={game}
							key={i}
							onInnerGoalChange={(newRawGoal) =>
								onChange({
									...section,
									rawGoals: ChangeAtPosition(section.rawGoals, newRawGoal, i),
								})
							}
							onInnerGoalDelete={() => {
								onChange({
									...section,
									rawGoals: DeleteInPosition(section.rawGoals, i),
								});
							}}
							playtype={playtype}
							rawGoal={e}
						/>
					))}
				</ul>
			)}
			<br />
			<div className="w-100 d-flex mt-8">
				<Button onClick={() => setShow(true)} variant="outline-success">
					<Icon type="plus" /> Add Goal
				</Button>
				<Button
					className="ms-auto"
					onClick={() => {
						if (confirm("Are you absolutely sure you want to delete this section?")) {
							onDelete();
						}
					}}
					variant="outline-danger"
				>
					<Icon type="times" /> Delete Section
				</Button>
			</div>
			{show && (
				<AddNewGoalForQuestModal
					game={game}
					onCreate={(rawGoal) => {
						onChange({
							...section,
							rawGoals: [...section.rawGoals, rawGoal],
						});
					}}
					playtype={playtype}
					setShow={setShow}
					show={show}
				/>
			)}
		</>
	);
}

function InnerQuestSectionGoal({
	rawGoal,
	game,
	playtype,
	onInnerGoalChange,
	onInnerGoalDelete,
}: {
	onInnerGoalChange: (newRawGoal: RawQuestGoal) => void;
	onInnerGoalDelete: () => void;
	rawGoal: RawQuestGoal;
} & GamePT) {
	const [show, setShow] = useState(false);

	return (
		<li className="quest-goal">
			<div className="w-100 d-flex">
				<div className="me-auto">{rawGoal.goal.name}</div>

				<div className="ms-auto d-flex flex-nowrap">
					<div className="text-hover-white">
						<Icon onClick={() => setShow(true)} type="pencil-alt" />
					</div>
					<div className="ms-2 text-hover-white">
						<Icon
							onClick={() => {
								if (
									confirm(
										`Are you sure you want to remove the goal "${rawGoal.goal.name}"?`,
									)
								) {
									onInnerGoalDelete();
								}
							}}
							type="trash"
						/>
					</div>
				</div>
			</div>
			{rawGoal.note && <Muted>{rawGoal.note}</Muted>}
			{show && (
				<AddNewGoalForQuestModal
					game={game}
					initialState={rawGoal}
					onCreate={(newRawGoal) => {
						onInnerGoalChange(newRawGoal);
					}}
					playtype={playtype}
					setShow={setShow}
					show={show}
				/>
			)}
		</li>
	);
}

function FormatQuest(quest: RawQuestDocument) {
	let str = `# QUEST: ${quest.name}
${quest.desc}
(Game: ${FormatGameGroup(quest.game, quest.playtype)})`;

	for (const section of quest.rawQuestData) {
		str += `\n\n### ${section.title}`;

		if (section.desc) {
			str += `\n${section.desc}`;
		}

		str += "\n";

		for (const goal of section.rawGoals) {
			str += `\n-- ${goal.goal.name}`;

			if (goal.note) {
				str += `\n${goal.note}`;
			}
		}
	}

	return str;
}
