import Divider from "#components/util/Divider";
import Select from "#components/util/Select";
import { TachiConfig } from "#lib/config";
import { type SetState } from "#types/react";
import { type RawQuestDocument } from "#types/tachi";
import React, { useState } from "react";
import { Button, Col, Modal, Row } from "react-bootstrap";
import {
	FormatGame,
	type GameGroup,
	GetGameGroupConfig,
	LEGACY_GameGroupPTToGame,
	type LEGACY_GPTString,
	type LEGACY_Playtype,
	type V3Game,
} from "tachi-common";

export default function AddNewQuestModal({
	show,
	setShow,
	onCreate,
}: {
	onCreate: (rawQuest: RawQuestDocument) => void;
	setShow: SetState<boolean>;
	show: boolean;
}) {
	const [gpt, setGPT] = useState<LEGACY_GPTString | null>(null);

	return (
		<Modal onHide={() => setShow(false)} show={show} size="xl">
			<Modal.Header closeButton>
				<Modal.Title>Create New Quest</Modal.Title>
			</Modal.Header>
			<Modal.Body>
				<Row>
					<Col xs={12}>
						<Select
							allowNull
							className="w-100"
							setValue={setGPT}
							unselectedName="Select a game..."
							value={gpt}
						>
							{TachiConfig.GAME_GROUPS.flatMap((game) => {
								const gameConfig = GetGameGroupConfig(game);

								return gameConfig.playtypes.map((playtype) => (
									<option
										key={`${game}:${playtype}`}
										value={`${game}:${playtype}`}
									>
										{FormatGame(LEGACY_GameGroupPTToGame(game, playtype))}
									</option>
								));
							})}
						</Select>
						<Divider />
					</Col>
					<Col className="w-100 d-flex justify-content-center" xs={12}>
						<Button
							disabled={gpt === null}
							onClick={() => {
								if (!gpt) {
									return;
								}

								setShow(false);
								const [game, playtype] = gpt.split(":") as [
									GameGroup,
									LEGACY_Playtype,
								];
								const v3Game: V3Game = LEGACY_GameGroupPTToGame(game, playtype);
								onCreate({
									game: v3Game,
									name: "Untitled Quest",
									desc: "Please set a description.",
									rawQuestData: [],
								});
							}}
							variant="primary"
						>
							Add Quest
						</Button>
					</Col>
				</Row>
			</Modal.Body>
		</Modal>
	);
}
