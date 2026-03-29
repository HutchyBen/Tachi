import useSetSubheader from "#components/layout/header/useSetSubheader";
import { TachiConfig } from "#lib/config";
import { APIFetchV1 } from "#util/api";
import React, { useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { FormatGameGroup, type GameGroup, GetGameGroupConfig } from "tachi-common";

export default function AdminOperationsPage() {
	useSetSubheader(["Admin", "Operations"]);

	const [announcementTitle, setAnnouncementTitle] = useState("");
	const [announcementGame, setAnnouncementGame] = useState<"" | GameGroup>("");
	const [announcementPlaytype, setAnnouncementPlaytype] = useState("");

	const [folderId, setFolderId] = useState("");

	const [resyncBody, setResyncBody] = useState("{}");
	const [recalcBody, setRecalcBody] = useState("{}");

	const [supporterUser, setSupporterUser] = useState("");

	const announcementGameConfig = announcementGame ? GetGameGroupConfig(announcementGame) : null;

	return (
		<Row className="g-4">
			<Col lg={6}>
				<Card className="h-100">
					<Card.Header>Site announcement</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="announcement-title">
							<Form.Label>Title</Form.Label>
							<Form.Control
								onChange={(e) => setAnnouncementTitle(e.target.value)}
								type="text"
								value={announcementTitle}
							/>
						</Form.Group>
						<Form.Group className="mb-3" controlId="announcement-game">
							<Form.Label>Game (optional)</Form.Label>
							<Form.Select
								onChange={(e) => {
									const v = e.target.value;
									setAnnouncementGame(v === "" ? "" : (v as GameGroup));
									setAnnouncementPlaytype("");
								}}
								value={announcementGame === "" ? "" : announcementGame}
							>
								<option value="">— Site-wide —</option>
								{TachiConfig.GAMES.map((g) => (
									<option key={g} value={g}>
										{g}
									</option>
								))}
							</Form.Select>
						</Form.Group>
						{announcementGameConfig && (
							<Form.Group className="mb-3" controlId="announcement-playtype">
								<Form.Label>Playtype (optional)</Form.Label>
								<Form.Select
									onChange={(e) => setAnnouncementPlaytype(e.target.value)}
									value={announcementPlaytype}
								>
									<option value="">—</option>
									{announcementGameConfig.playtypes.map((pt) => (
										<option key={pt} value={pt}>
											{FormatGameGroup(announcementGame as GameGroup, pt)}
										</option>
									))}
								</Form.Select>
							</Form.Group>
						)}
						<Button
							disabled={!announcementTitle.trim()}
							onClick={() => {
								const body: Record<string, unknown> = {
									title: announcementTitle.trim(),
								};
								if (announcementGame) {
									body.game = announcementGame;
								}
								if (announcementGame && announcementPlaytype) {
									body.playtype = announcementPlaytype;
								}
								void APIFetchV1(
									`/admin/announcement`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify(body),
									},
									true,
									true,
								);
							}}
							variant="primary"
						>
							Send announcement
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card className="h-100">
					<Card.Header>Supporter status</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="supporter-user">
							<Form.Label>Username or user ID</Form.Label>
							<Form.Control
								onChange={(e) => setSupporterUser(e.target.value)}
								placeholder="e.g. zkldi or 1"
								type="text"
								value={supporterUser}
							/>
						</Form.Group>
						<div className="d-flex flex-wrap gap-2">
							<Button
								disabled={!supporterUser.trim()}
								onClick={() =>
									void APIFetchV1(
										`/admin/supporter/${encodeURIComponent(supporterUser.trim())}`,
										{ method: "POST" },
										true,
										true,
									)
								}
								variant="primary"
							>
								Grant supporter
							</Button>
							<Button
								disabled={!supporterUser.trim()}
								onClick={() =>
									void APIFetchV1(
										`/admin/supporter/${encodeURIComponent(supporterUser.trim())}`,
										{ method: "DELETE" },
										true,
										true,
									)
								}
								variant="outline-danger"
							>
								Revoke supporter
							</Button>
						</div>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card>
					<Card.Header>Rebuild folder chart lookup (Postgres)</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="folder-id">
							<Form.Label>Folder ID (optional)</Form.Label>
							<Form.Control
								onChange={(e) => setFolderId(e.target.value)}
								placeholder="Leave empty to rebuild all folders"
								type="text"
								value={folderId}
							/>
						</Form.Group>
						<Button
							onClick={() => {
								const body: { folderId?: string } = {};
								if (folderId.trim()) {
									body.folderId = folderId.trim();
								}
								void APIFetchV1(
									`/admin/rebuild-folder-chart-lookup`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify(body),
									},
									true,
									true,
								);
							}}
							variant="primary"
						>
							Rebuild
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card>
					<Card.Header>Reprocess all goals</Card.Header>
					<Card.Body>
						<p className="text-body-secondary small">
							Re-runs goal and quest processing for every user game profile. Heavy
							operation.
						</p>
						<Button
							onClick={() =>
								void APIFetchV1(
									`/admin/reprocess-all-goals`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({}),
									},
									true,
									true,
								)
							}
							variant="warning"
						>
							Reprocess all goals
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card>
					<Card.Header>Resync PBs</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="resync-json">
							<Form.Label>JSON body</Form.Label>
							<Form.Control
								as="textarea"
								onChange={(e) => setResyncBody(e.target.value)}
								placeholder='{} or { "userIDs": [1, 2], "filter": { ... } }'
								rows={5}
								style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
								value={resyncBody}
							/>
						</Form.Group>
						<Button
							onClick={() => {
								let parsed: unknown = {};
								try {
									parsed = JSON.parse(resyncBody) as unknown;
								} catch {
									alert("Invalid JSON.");
									return;
								}
								void APIFetchV1(
									`/admin/resync-pbs`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify(parsed),
									},
									true,
									true,
								);
							}}
							variant="primary"
						>
							Resync PBs
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card>
					<Card.Header>Recalc scores</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="recalc-json">
							<Form.Label>Mongo filter (JSON object)</Form.Label>
							<Form.Control
								as="textarea"
								onChange={(e) => setRecalcBody(e.target.value)}
								placeholder="{}"
								rows={5}
								style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
								value={recalcBody}
							/>
						</Form.Group>
						<Button
							onClick={() => {
								let parsed: unknown = {};
								try {
									parsed = JSON.parse(recalcBody) as unknown;
								} catch {
									alert("Invalid JSON.");
									return;
								}
								void APIFetchV1(
									`/admin/recalc`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify(parsed),
									},
									true,
									true,
								);
							}}
							variant="primary"
						>
							Recalc
						</Button>
					</Card.Body>
				</Card>
			</Col>
		</Row>
	);
}
