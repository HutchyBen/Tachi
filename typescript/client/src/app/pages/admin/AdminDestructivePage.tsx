import useSetSubheader from "#components/layout/header/useSetSubheader";
import { TachiConfig } from "#lib/config";
import { APIFetchV1 } from "#util/api";
import React, { useMemo, useState } from "react";
import { Button, Card, Col, Form, Row } from "react-bootstrap";
import { type GameGroup, GetGameGroupConfig } from "tachi-common";

export default function AdminDestructivePage() {
	useSetSubheader(["Admin", "Destructive"]);

	const [deleteScoreId, setDeleteScoreId] = useState("");
	const [deleteSessionId, setDeleteSessionId] = useState("");

	const [ugptUserId, setUgptUserId] = useState("");
	const [ugptGame, setUgptGame] = useState<GameGroup>(TachiConfig.GAMES[0]);
	const ugptGameConfig = useMemo(() => GetGameGroupConfig(ugptGame), [ugptGame]);
	const [ugptPlaytype, setUgptPlaytype] = useState<string>(() =>
		GetGameGroupConfig(TachiConfig.GAMES[0]).playtypes[0],
	);

	const [destroyChartId, setDestroyChartId] = useState("");
	const [destroyChartGame, setDestroyChartGame] = useState<GameGroup>(TachiConfig.GAMES[0]);

	function confirmDelete(message: string): boolean {
		return window.confirm(message);
	}

	return (
		<Row className="g-4">
			<Col lg={6}>
				<Card className="border-danger">
					<Card.Header className="bg-danger bg-opacity-10 text-danger">Delete score</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="delete-score">
							<Form.Label>Score ID</Form.Label>
							<Form.Control
								onChange={(e) => setDeleteScoreId(e.target.value)}
								type="text"
								value={deleteScoreId}
							/>
						</Form.Group>
						<Button
							disabled={!deleteScoreId.trim()}
							onClick={() => {
								if (
									!confirmDelete(
										"Permanently delete this score? This cannot be undone.",
									)
								) {
									return;
								}
								void APIFetchV1(
									`/admin/delete-score`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ scoreID: deleteScoreId.trim() }),
									},
									true,
									true,
								);
							}}
							variant="danger"
						>
							Delete score
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card className="border-danger">
					<Card.Header className="bg-danger bg-opacity-10 text-danger">Delete session</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="delete-session">
							<Form.Label>Session ID</Form.Label>
							<Form.Control
								onChange={(e) => setDeleteSessionId(e.target.value)}
								type="text"
								value={deleteSessionId}
							/>
						</Form.Group>
						<Button
							disabled={!deleteSessionId.trim()}
							onClick={() => {
								if (
									!confirmDelete(
										"Permanently delete this session and its scores? This cannot be undone.",
									)
								) {
									return;
								}
								void APIFetchV1(
									`/admin/delete-session`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({ sessionID: deleteSessionId.trim() }),
									},
									true,
									true,
								);
							}}
							variant="danger"
						>
							Delete session
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card className="border-danger">
					<Card.Header className="bg-danger bg-opacity-10 text-danger">
						Destroy user game profile (UGPT)
					</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="ugpt-user">
							<Form.Label>User ID</Form.Label>
							<Form.Control
								onChange={(e) => setUgptUserId(e.target.value)}
								type="number"
								value={ugptUserId}
							/>
						</Form.Group>
						<Form.Group className="mb-3" controlId="ugpt-game">
							<Form.Label>Game</Form.Label>
							<Form.Select
								onChange={(e) => {
									const g = e.target.value as GameGroup;
									setUgptGame(g);
									const cfg = GetGameGroupConfig(g);
									setUgptPlaytype(cfg.playtypes[0]);
								}}
								value={ugptGame}
							>
								{TachiConfig.GAMES.map((g) => (
									<option key={g} value={g}>
										{g}
									</option>
								))}
							</Form.Select>
						</Form.Group>
						<Form.Group className="mb-3" controlId="ugpt-pt">
							<Form.Label>Playtype</Form.Label>
							<Form.Select
								onChange={(e) => setUgptPlaytype(e.target.value)}
								value={ugptPlaytype}
							>
								{ugptGameConfig.playtypes.map((pt) => (
									<option key={pt} value={pt}>
										{pt}
									</option>
								))}
							</Form.Select>
						</Form.Group>
						<Button
							disabled={!ugptUserId.trim()}
							onClick={() => {
								const uid = Number.parseInt(ugptUserId, 10);
								if (Number.isNaN(uid)) {
									alert("User ID must be a number.");
									return;
								}
								if (
									!confirmDelete(
										`Destroy all stats for user ${uid} (${ugptGame} ${ugptPlaytype})? This cannot be undone.`,
									)
								) {
									return;
								}
								void APIFetchV1(
									`/admin/destroy-ugpt`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({
											userID: uid,
											game: ugptGame,
											playtype: ugptPlaytype,
										}),
									},
									true,
									true,
								);
							}}
							variant="danger"
						>
							Destroy UGPT
						</Button>
					</Card.Body>
				</Card>
			</Col>

			<Col lg={6}>
				<Card className="border-danger">
					<Card.Header className="bg-danger bg-opacity-10 text-danger">Destroy chart</Card.Header>
					<Card.Body>
						<Form.Group className="mb-3" controlId="destroy-chart-game">
							<Form.Label>Game</Form.Label>
							<Form.Select
								onChange={(e) => setDestroyChartGame(e.target.value as GameGroup)}
								value={destroyChartGame}
							>
								{TachiConfig.GAMES.map((g) => (
									<option key={g} value={g}>
										{g}
									</option>
								))}
							</Form.Select>
						</Form.Group>
						<Form.Group className="mb-3" controlId="destroy-chart-id">
							<Form.Label>Chart ID</Form.Label>
							<Form.Control
								onChange={(e) => setDestroyChartId(e.target.value)}
								type="text"
								value={destroyChartId}
							/>
						</Form.Group>
						<Button
							disabled={!destroyChartId.trim()}
							onClick={() => {
								if (
									!confirmDelete(
										"Destroy this chart and all related scores and sessions? This cannot be undone.",
									)
								) {
									return;
								}
								void APIFetchV1(
									`/admin/destroy-chart`,
									{
										method: "POST",
										headers: { "Content-Type": "application/json" },
										body: JSON.stringify({
											chartID: destroyChartId.trim(),
											game: destroyChartGame,
										}),
									},
									true,
									true,
								);
							}}
							variant="danger"
						>
							Destroy chart
						</Button>
					</Card.Body>
				</Card>
			</Col>
		</Row>
	);
}
