import Card from "#components/layout/page/Card";
import ComparePBsTable from "#components/tables/rivals/ComparePBsTable";
import ProfilePicture from "#components/user/ProfilePicture";
import UGPTRatingsTable from "#components/user/UGPTStatsOverview";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import UserSelectModal from "#components/util/modal/UserSelectModal";
import useApiQuery from "#components/util/query/useApiQuery";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import UserIcon from "#components/util/UserIcon";
import { UserContext } from "#context/UserContext";
import { type UGPTFolderReturns, type UGPTStatsReturn } from "#types/api-returns";
import { type GamePT } from "#types/react";
import { type ComparePBsDataset } from "#types/tables";
import { CreateSongMap } from "#util/data";
import React, { useContext, useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import Stack from "react-bootstrap/Stack";
import { Link } from "react-router-dom";
import { type MONGO_FolderDocument, type MONGO_UserDocument } from "tachi-common";

export default function RivalCompareFolderPage({
	reqUser,
	game,
	playtype,
	folder,
}: {
	folder: MONGO_FolderDocument;
	reqUser: MONGO_UserDocument;
} & GamePT) {
	const { settings } = useLUGPTSettings();
	const { user } = useContext(UserContext);

	const [selectedUser, setSelectedUser] = useState<MONGO_UserDocument | null>(null);
	const [show, setShow] = useState(false);

	// honestly don't care if this errors or not
	const { data, error } = useApiQuery<Array<MONGO_UserDocument>>(
		`/users/${settings?.userID}/games/${game}/${playtype}/rivals`,
		undefined,
		// [settings?.rivals.join(",")]
	);

	if (!data && !error) {
		return <Loading />;
	}

	let suggestUsers = data ?? [];

	// if the user viewing this page is logged in and *is not*
	// the person this page is for
	// show them in the suggestions.
	if (user && user.id !== reqUser.id && data) {
		suggestUsers = [...suggestUsers, user];
	}

	return (
		<div>
			<Card header="Pick a user to compare against...">
				{suggestUsers.length > 0 && (
					<>
						<Col className="d-flex justify-content-center flex-wrap" xs={12}>
							{suggestUsers.map((e) => (
								<UserIcon game={game} key={e.id} playtype={playtype} user={e}>
									<Button
										onClick={() => setSelectedUser(e)}
										variant={
											selectedUser?.id === e.id ? "secondary" : "primary"
										}
									>
										Compare Against
									</Button>
								</UserIcon>
							))}
						</Col>

						<Divider />
					</>
				)}

				<UserSelectModal
					callback={(user) => {
						setSelectedUser(user);
						setShow(false);
					}}
					excludeMsg="Can't pick the same user!"
					excludeSet={[reqUser.id]}
					setShow={setShow}
					show={show}
					url={`/games/${game}/${playtype}/players`}
				/>
				<Button
					className={suggestUsers.length === 0 ? "d-flex mx-auto" : ""}
					onClick={() => setShow(true)}
					variant={selectedUser ? "secondary" : "primary"}
				>
					Pick{suggestUsers.length > 0 ? " Other" : ""} User
				</Button>
			</Card>
			{selectedUser !== null && folder !== null && (
				<>
					<Divider />
					<FolderCompare
						folder={folder}
						game={game}
						playtype={playtype}
						reqUser={reqUser}
						withUser={selectedUser}
					/>
				</>
			)}
		</div>
	);
}

function FolderCompare({
	reqUser,
	game,
	playtype,
	withUser,
	folder,
}: {
	folder: MONGO_FolderDocument;
	reqUser: MONGO_UserDocument;
	withUser: MONGO_UserDocument;
} & GamePT) {
	const { data: baseData, error: baseError } = useApiQuery<UGPTFolderReturns>(
		`/users/${reqUser.id}/games/${game}/${playtype}/folders/${folder.folderID}`,
	);

	const { data: compareData, error: compareError } = useApiQuery<UGPTFolderReturns>(
		`/users/${withUser.id}/games/${game}/${playtype}/folders/${folder.folderID}`,
	);

	const [shouldIncludeNotPlayed, setShouldIncludeNotPlayed] = useState(false);

	const dataset = useMemo(() => {
		// i *LOVE* the rules of hooks! they're so convenient!
		if (!baseData || !compareData) {
			return [];
		}

		const basePBLookup = new Map(baseData.pbs.map((e) => [e.chartID, e]));
		const comparePBLookup = new Map(compareData.pbs.map((e) => [e.chartID, e]));

		const songMap = CreateSongMap(baseData.songs);

		let ds: ComparePBsDataset = baseData.charts.map((chart) => ({
			chart,
			base: basePBLookup.get(chart.chartID) ?? null,
			compare: comparePBLookup.get(chart.chartID) ?? null,
			song: songMap.get(chart.songID)!,
		}));

		if (!shouldIncludeNotPlayed) {
			ds = ds.filter((e) => e.base && e.compare);
		}

		return ds;
	}, [shouldIncludeNotPlayed, baseData, compareData]);

	if (baseError) {
		return <ApiError error={baseError} />;
	}
	if (compareError) {
		return <ApiError error={compareError} />;
	}

	if (!compareData || !baseData) {
		return <Loading />;
	}

	return (
		<Stack gap={4}>
			<Row lg={{ cols: 2 }} xs={{ cols: 1 }}>
				<UserCard game={game} playtype={playtype} user={reqUser} />
				<UserCard game={game} playtype={playtype} user={withUser} />
			</Row>
			{/* <CompareCard
				dataset={dataset}
				baseUsername={reqUser.username}
				otherUsername={withUser.username}
			/> */}
			<Form.Check
				checked={shouldIncludeNotPlayed}
				label="Include charts without plays?"
				onChange={() => setShouldIncludeNotPlayed(!shouldIncludeNotPlayed)}
			/>
			<hr className="m-0" />
			<ComparePBsTable
				baseUser={reqUser.username}
				compareUser={withUser.username}
				dataset={dataset}
				game={game}
				playtype={playtype}
			/>
		</Stack>
	);
}

function UserCard({ user, game, playtype }: { user: MONGO_UserDocument } & GamePT) {
	const { data, error } = useApiQuery<UGPTStatsReturn>(
		`/users/${user.username}/games/${game}/${playtype}`,
	);

	if (error) {
		return <ApiError error={error} />;
	}

	return (
		<Col className="d-grid">
			<Card cardBodyClassName="d-flex flex-column gap-4 flex-lg-row align-items-center justify-content-between">
				<div className="d-flex flex-column">
					<Link
						className="fw-bold fs-4 text-center text-lg-start"
						to={`/u/${user.username}/games/${game}/${playtype}`}
					>
						{user.username}
					</Link>
					<ProfilePicture user={user} />
				</div>
				<Col lg={7} sm={6} xl={6} xs={12}>
					{data ? <UGPTRatingsTable ugs={data.gameStats} /> : <Loading />}
				</Col>
			</Card>
		</Col>
	);
}
