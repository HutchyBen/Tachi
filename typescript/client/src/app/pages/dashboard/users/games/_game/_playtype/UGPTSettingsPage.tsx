import { ErrorPage } from "#app/pages/ErrorPage";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import Card from "#components/layout/page/Card";
import UGPTStatContainer from "#components/user/UGPTStatContainer";
import UGPTStatCreator from "#components/user/UGPTStatCreator";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import Muted from "#components/util/Muted";
import { type UGPTData } from "#components/util/query/fetchUGPTData";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectButton from "#components/util/SelectButton";
import useQueryString from "#components/util/useQueryString";
import { UGPTContext } from "#context/UGPTContext";
import { TachiConfig } from "#lib/config";
import { type SetState, type UGPT } from "#types/react";
import { APIFetchV1 } from "#util/api";
import {
	FormatGPTProfileRatingName,
	FormatGPTScoreRatingName,
	FormatGPTSessionRatingName,
	ToFixedFloor,
	UppercaseFirst,
} from "#util/misc";
import deepmerge from "deepmerge";
import { useFormik } from "formik";
import React, { useContext, useEffect, useState } from "react";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	BMS_TABLES,
	FormatGameGroup,
	GetGameGroupConfig,
	GetGamePTConfig,
	GetScoreMetrics,
	type ShowcaseStatDetails,
	type TableDocument,
	type UGPTSettingsDocument,
	type UserDocument,
} from "tachi-common";

export default function UGPTSettingsPage({ reqUser, game, playtype }: UGPT) {
	const query = useQueryString();

	const [page, setPage] = useState<"manage" | "preferences" | "showcase">(
		query.get("showcase") ? "showcase" : "preferences",
	);
	const gameConfig = GetGameGroupConfig(game);

	useSetSubheader(
		["Users", reqUser.username, "Games", gameConfig.name, playtype, "Settings"],
		[reqUser],
		`${reqUser.username}'s ${FormatGameGroup(game, playtype)} Settings`,
	);

	const UGPT = { reqUser, game, playtype };

	const { loggedInData } = useContext(UGPTContext);
	if (!loggedInData) {
		return (
			<ErrorPage
				customMessage="You don't appear to have any settings for this game; have you played it?"
				statusCode={400}
			/>
		);
	}

	return (
		<Card className="col-12 offset-lg-2 col-lg-8" header="Settings">
			<div className="row">
				<div className="col-12 d-flex justify-content-center">
					<div className="btn-group">
						<SelectButton
							className="text-wrap"
							id="preferences"
							setValue={setPage}
							value={page}
						>
							<Icon type="cogs" /> Preferences
						</SelectButton>
						<SelectButton
							className="text-wrap"
							id="showcase"
							setValue={setPage}
							value={page}
						>
							<Icon type="bars" /> Showcase Stats
						</SelectButton>
						<SelectButton
							className="text-wrap"
							id="manage"
							setValue={setPage}
							value={page}
						>
							<Icon type="eraser" /> Manage Account
						</SelectButton>
					</div>
				</div>
				<div className="col-12">
					<Divider className="mt-4 mb-4" />
					{page === "preferences" ? (
						<PreferencesForm {...UGPT} loggedInData={loggedInData} />
					) : page === "showcase" ? (
						<ShowcaseForm {...UGPT} loggedInData={loggedInData} />
					) : (
						<ManageAccount {...UGPT} />
					)}
				</div>
			</div>
		</Card>
	);
}

function PreferencesForm({
	reqUser,
	game,
	playtype,
	loggedInData,
}: { loggedInData: UGPTData } & UGPT) {
	const { setLoggedInData } = useContext(UGPTContext);

	const settings = loggedInData.settings;

	const gptConfig = GetGamePTConfig(game, playtype);

	const formik = useFormik({
		initialValues: {
			preferredScoreAlg:
				settings!.preferences.preferredScoreAlg || gptConfig.defaultScoreRatingAlg,
			preferredProfileAlg:
				settings!.preferences.preferredProfileAlg || gptConfig.defaultProfileRatingAlg,
			preferredSessionAlg:
				settings!.preferences.preferredSessionAlg || gptConfig.defaultSessionRatingAlg,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			gameSpecific: settings!.preferences.gameSpecific as any,
			defaultTable: settings!.preferences.defaultTable,
			preferredDefaultEnum:
				settings!.preferences.preferredDefaultEnum ?? gptConfig.preferredDefaultEnum,
			preferredRanking: settings!.preferences.preferredRanking ?? "global",
		},
		onSubmit: async (values) => {
			const rj = await APIFetchV1<UserDocument>(
				`/users/${reqUser.id}/games/${game}/${playtype}/settings`,
				{
					method: "PATCH",
					body: JSON.stringify(values),
					headers: {
						"Content-Type": "application/json",
					},
				},
				true,
				true,
			);

			if (rj.success) {
				setLoggedInData({
					...loggedInData,
					settings: deepmerge(settings as UGPTSettingsDocument, { preferences: values }),
				});
			}
		},
	});

	const { data: tables, error } = useApiQuery<TableDocument[]>(
		`/games/${game}/${playtype}/tables?showInactive=true`,
	);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!tables) {
		return <Loading />;
	}

	const displayableTables = tables.filter(
		(e) => !e.inactive || settings?.preferences.defaultTable === e.tableID,
	);

	const formGroupClassNames = "d-flex flex-column";

	return (
		<Form className="d-flex flex-column gap-4" onSubmit={formik.handleSubmit}>
			{Object.keys(gptConfig.scoreRatingAlgs).length > 1 && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>Preferred Score Algorithm</Form.Label>
					<Form.Select
						id="preferredScoreAlg"
						onChange={formik.handleChange}
						value={formik.values.preferredScoreAlg}
					>
						{Object.keys(gptConfig.scoreRatingAlgs).map((e) => (
							<option key={e} value={e}>
								{FormatGPTScoreRatingName(game, playtype, e)}
							</option>
						))}
					</Form.Select>
					<Form.Text className="text-body-secondary">
						This configures the default rating algorithm to display for scores. This is
						used for things like score tables and PB tables.
					</Form.Text>
				</Form.Group>
			)}
			{Object.keys(gptConfig.sessionRatingAlgs).length > 1 && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>Preferred Session Algorithm</Form.Label>
					<Form.Select
						id="preferredSessionAlg"
						onChange={formik.handleChange}
						value={formik.values.preferredSessionAlg}
					>
						{Object.keys(gptConfig.sessionRatingAlgs).map((e) => (
							<option key={e} value={e}>
								{FormatGPTSessionRatingName(game, playtype, e)}
							</option>
						))}
					</Form.Select>
					<Form.Text className="text-body-secondary">
						This configures the default rating algorithm to display for sessions. This
						is used for things like session tables.
					</Form.Text>
				</Form.Group>
			)}
			{Object.keys(gptConfig.profileRatingAlgs).length > 1 && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>Preferred Profile Algorithm</Form.Label>
					<Form.Select
						id="preferredProfileAlg"
						onChange={formik.handleChange}
						value={formik.values.preferredProfileAlg}
					>
						{Object.keys(gptConfig.profileRatingAlgs).map((e) => (
							<option key={e} value={e}>
								{FormatGPTProfileRatingName(game, playtype, e)}
							</option>
						))}
					</Form.Select>
					<Form.Text className="text-body-secondary">
						This configures the default rating algorithm to display for profiles. This
						is used for things like leaderboards.
					</Form.Text>
				</Form.Group>
			)}
			<Form.Group className={formGroupClassNames}>
				<Form.Label>Preferred Folder Info</Form.Label>
				<Form.Select
					id="preferredDefaultEnum"
					onChange={formik.handleChange}
					value={formik.values.preferredDefaultEnum}
				>
					{GetScoreMetrics(gptConfig, "ENUM").map((e) => (
						<option key={e} value={e}>
							{UppercaseFirst(e)}
						</option>
					))}
				</Form.Select>
				<Form.Text className="text-body-secondary">
					What should {TachiConfig.NAME} default to showing you about folders?
				</Form.Text>
			</Form.Group>
			{settings.rivals.length !== 0 && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>Preferred Ranking</Form.Label>
					<Form.Select
						id="preferredRanking"
						onChange={formik.handleChange}
						value={formik.values.preferredRanking}
					>
						<option value="global">Global Rankings</option>
						<option value="rival">Rival Rankings</option>
					</Form.Select>
					<Form.Text className="text-body-secondary">
						What should {TachiConfig.NAME} default to when showing your score rankings?
					</Form.Text>
				</Form.Group>
			)}
			<Form.Group className={formGroupClassNames}>
				<Form.Label>Preferred Table</Form.Label>
				<Form.Select
					id="defaultTable"
					onChange={formik.handleChange}
					value={
						formik.values.defaultTable ??
						tables.find((x) => x.default)?.tableID ??
						displayableTables[0].tableID
					}
				>
					{displayableTables.map((table) => (
						<option key={table.tableID} value={table.tableID}>
							{table.title}
						</option>
					))}
				</Form.Select>
				<Form.Text className="text-body-secondary">
					What folders would you like to see by default?
				</Form.Text>
			</Form.Group>
			{game === "iidx" && (
				<>
					<Form.Group className={formGroupClassNames}>
						<Form.Check
							checked={formik.values.gameSpecific.display2DXTra}
							id="gameSpecific.display2DXTra"
							label="Display 2DX-tra Charts"
							name="gameSpecific.display2DXTra"
							onChange={formik.handleChange}
							type="checkbox"
						/>
						<Form.Text className="text-body-secondary">
							Display 2DX-tra charts on the song page.
						</Form.Text>
					</Form.Group>
					<Form.Group className={formGroupClassNames}>
						<Form.Label>BPI Target</Form.Label>
						<Form.Control
							id="gameSpecific.bpiTarget"
							max={100}
							min={0}
							name="gameSpecific.bpiTarget"
							onChange={formik.handleChange}
							step={5}
							type="number"
							value={formik.values.gameSpecific.bpiTarget}
						/>
						<Form.Text className="text-body-secondary">
							Set yourself a BPI target. {TachiConfig.NAME} will show how far away you
							are from it in the UI!
						</Form.Text>
					</Form.Group>
				</>
			)}
			{(game === "sdvx" || game === "usc") && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>VF6 Target</Form.Label>
					<Form.Control
						id="gameSpecific.vf6Target"
						max={0.5}
						min={0}
						name="gameSpecific.vf6Target"
						onChange={formik.handleChange}
						step={0.001}
						type="number"
						value={formik.values.gameSpecific.vf6Target}
					/>
					Expected Profile VF6{" "}
					{ToFixedFloor((formik.values.gameSpecific.vf6Target ?? 0) * 50, 2)}
					<Form.Text className="text-body-secondary">
						Set yourself a VF6 target. {TachiConfig.NAME} will show how far away you are
						from it in the UI!
						<br />
						Set this to 0 to disable the target.
					</Form.Text>
				</Form.Group>
			)}
			{game === "bms" && (
				<Form.Group className={formGroupClassNames}>
					<Form.Label>Preferred Tables</Form.Label>

					{BMS_TABLES.filter((e) => e.playtype === playtype).map((e) => (
						<Form.Check
							checked={
								formik.values.gameSpecific.displayTables?.includes(e.prefix) ??
								!e.notDefault
							}
							key={e.prefix}
							label={`(${e.prefix}) ${e.name}`}
							onChange={(event) => {
								const base: Array<string> =
									formik.values.gameSpecific.displayTables ??
									BMS_TABLES.filter(
										(e) => e.playtype === playtype && !e.notDefault,
									).map((e) => e.prefix);

								if (event.target.checked) {
									formik.setFieldValue("gameSpecific.displayTables", [
										...base,
										e.prefix,
									]);
								} else {
									formik.setFieldValue(
										"gameSpecific.displayTables",
										base.filter((a) => a !== e.prefix),
									);
								}
							}}
						/>
					))}

					<Form.Text className="text-body-secondary">
						What tables do you want to display in the UI? Use this to disable tables you
						don't really care for.
					</Form.Text>
				</Form.Group>
			)}
			<Button type="submit" variant="success">
				Save Changes
			</Button>
		</Form>
	);
}

function ShowcaseForm({
	reqUser,
	game,
	playtype,
	loggedInData,
}: { loggedInData: UGPTData } & UGPT) {
	const { setLoggedInData } = useContext(UGPTContext);

	const settings = loggedInData.settings;

	const [stats, setStats] = useState(settings!.preferences.stats);
	const [show, setShow] = useState(false);

	const SaveChanges = async () => {
		const r = await APIFetchV1<UGPTSettingsDocument>(
			`/users/${reqUser.id}/games/${game}/${playtype}/showcase`,
			{
				method: "PUT",
				body: JSON.stringify(stats),
				headers: { "Content-Type": "application/json" },
			},
			true,
			true,
		);

		if (r.success) {
			setLoggedInData({
				...loggedInData,
				settings: r.body,
			});
		}
	};

	const [isFirstPaint, setIsFirstPaint] = useState(true);

	useEffect(() => {
		if (isFirstPaint) {
			setIsFirstPaint(false);
		} else {
			SaveChanges();
		}
	}, [stats]);

	return (
		<div className="d-flex flex-column gap-4 align-items-center">
			{stats.length < 6 && (
				<div>
					<Button onClick={() => setShow(true)} variant="info">
						Add Statistic
					</Button>
				</div>
			)}
			<RenderCurrentStats {...{ reqUser, game, playtype, stats, setStats }} />
			<UGPTStatCreator
				game={game}
				onCreate={(stat) => {
					setStats([...stats, stat]);
				}}
				playtype={playtype}
				reqUser={reqUser}
				setShow={setShow}
				show={show}
			/>
		</div>
	);
}

function RenderCurrentStats({
	stats,
	setStats,
	reqUser,
	game,
	playtype,
}: {
	setStats: SetState<ShowcaseStatDetails[]>;
	stats: ShowcaseStatDetails[];
} & UGPT) {
	function RemoveStatAtIndex(index: number) {
		setStats(stats.filter((e, i) => i !== index));
	}

	if (stats.length === 0) {
		return (
			<div className="w-100 text-center">
				<Muted>You have no stats set, Why not set some?</Muted>
			</div>
		);
	}

	return (
		<Row className="w-100 row-gap-4" lg={{ cols: 2 }}>
			{stats.map((e, i) => (
				<Col className="d-flex flex-column gap-4" key={i}>
					<UGPTStatContainer game={game} playtype={playtype} reqUser={reqUser} stat={e} />
					<Button className="w-100" onClick={() => RemoveStatAtIndex(i)} variant="danger">
						Delete
					</Button>
				</Col>
			))}
		</Row>
	);
}

function ManageAccount({ reqUser, game, playtype }: UGPT) {
	const [password, setPassword] = useState("");
	const [deleting, setDeleting] = useState(false);

	return (
		<Row>
			<Col xs={12}>
				<h4>Delete Score</h4>
				If you have an invalid score, you can delete it by going to that score and clicking
				"Delete Score".
			</Col>
			<Col className="mt-8" xs={12}>
				<h4>Undo Import</h4>
				If you messed up an import, you can undo it by going to{" "}
				<Link to={`/u/${reqUser.username}/imports`}>your imports page</Link> and click
				"Revert Import".
			</Col>
			<Col className="mt-8" xs={12}>
				<h3>Completely Wipe Profile</h3>
				If you've <i>really</i> messed up, you can wipe your entire profile for{" "}
				{FormatGameGroup(game, playtype)}.
				<br />
				<Alert className="mt-4" style={{ fontSize: "1.5rem" }} variant="warning">
					It is very important to know that this is <b>NOT REVERSIBLE.</b> Wiping your
					profile will <b>COMPLETELY DELETE</b> all of your{" "}
					{FormatGameGroup(game, playtype)} scores from our server. We will not be able to
					retrieve them.
				</Alert>
				<br />
				<Form.Group>
					<Form.Label>Confirm Password</Form.Label>
					<Form.Control
						autoComplete="off"
						onChange={(e) => setPassword(e.target.value)}
						type="password"
						value={password}
					/>
				</Form.Group>
				<Button
					className="text-wrap w-100 mt-4"
					disabled={deleting}
					onClick={async () => {
						if (
							confirm(
								`You are really about to delete all of your ${FormatGameGroup(
									game,
									playtype,
								)} scores. This is your last chance to turn back.`,
							)
						) {
							setDeleting(true);

							const res = await APIFetchV1(
								`/users/${reqUser.id}/games/${game}/${playtype}`,
								{
									method: "DELETE",
									body: JSON.stringify({ "!password": password }),
									headers: {
										"Content-Type": "application/json",
									},
								},
								true,
								true,
							);

							setDeleting(false);

							if (res.success) {
								// bye!
								window.location.href = "/";
							}
						}
					}}
					variant="outline-danger"
				>
					Yes, I want to delete my {FormatGameGroup(game, playtype)} account.
				</Button>
				{deleting && (
					<>
						<Divider />
						<Loading />
						<div className="mt-4 text-center">
							This operation can take up to 5 minutes. The UI may time out. Please be
							patient.
						</div>
					</>
				)}
			</Col>
		</Row>
	);
}
