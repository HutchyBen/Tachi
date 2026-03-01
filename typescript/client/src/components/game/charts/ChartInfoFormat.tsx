import QuickTooltip from "#components/layout/misc/QuickTooltip";
import MiniTable from "#components/tables/components/MiniTable";
import ApiError from "#components/util/ApiError";
import ExternalLink from "#components/util/ExternalLink";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import Muted from "#components/util/Muted";
import useApiQuery from "#components/util/query/useApiQuery";
import { AllLUGPTStatsContext } from "#context/AllLUGPTStatsContext";
import { UserContext } from "#context/UserContext";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type GamePT } from "#types/react";
import { IsNotNullish } from "#util/misc";
import React, { useContext } from "react";
import { Col, Row } from "react-bootstrap";
import { Link } from "react-router-dom";
import {
	type ChartDocument,
	type FolderDocument,
	FormatDifficultySearch,
	type GameGroup,
	GetGameGroupConfig,
	GetGamePTConfig,
	GetGPTString,
	type SongDocument,
} from "tachi-common";

export default function ChartInfoFormat({
	song,
	chart,
	game,
	playtype,
}: { chart: ChartDocument; song: SongDocument } & GamePT) {
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(game, playtype)];

	const ratingSystems = gptImpl.ratingSystems;

	const { data, error } = useApiQuery<FolderDocument[]>(
		`/games/${game}/${playtype}/charts/${chart.chartID}/folders`,
	);

	const { user } = useContext(UserContext);
	const { ugs } = useContext(AllLUGPTStatsContext);

	if (error) {
		<ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const versions = Object.keys(GetGamePTConfig(game, playtype).versions);

	return (
		<Row
			className="text-center align-items-center"
			style={{
				paddingTop: "2.2rem",
				justifyContent: "space-evenly",
			}}
		>
			<Col lg={3} style={{ textAlign: "left" }} xs={12}>
				<h4>Appears In</h4>
				{data.length !== 0 ? (
					data
						.sort((a, b) => a.title.localeCompare(b.title))
						.sort((a, b) =>
							"versions" in a.data && "versions" in b.data
								? versions.indexOf(a.data.versions) -
									versions.indexOf(b.data.versions)
								: 0,
						)
						.map((e) => (
							<li key={e.folderID}>
								{user && ugs ? (
									<Link
										className="text-decoration-none"
										to={`/u/${user.username}/games/${game}/${playtype}/folders/${e.folderID}`}
									>
										{e.title}
									</Link>
								) : (
									<span>{e.title}</span>
								)}
							</li>
						))
				) : (
					<Muted>No folders...</Muted>
				)}
			</Col>
			<Col lg={4} xs={12}>
				<ChartInfoMiddle chart={chart} game={game} song={song} />
			</Col>
			<Col lg={3} xs={12}>
				{ratingSystems.length !== 0 &&
				ratingSystems.some((k) => IsNotNullish(k.toString(chart as any))) ? (
					<MiniTable colSpan={2} headers={["Ratings"]}>
						{ratingSystems.map((e) => {
							// @ts-expect-error bad types
							const strV = e.toString(chart);
							// @ts-expect-error bad types
							const numV = e.toNumber(chart);

							if (
								strV === null ||
								strV === undefined ||
								numV === null ||
								numV === undefined
							) {
								return null;
							}

							return (
								<tr key={e.name}>
									<td>{e.name}</td>
									<td>
										{strV} <Muted>({numV.toFixed(2)})</Muted>
										{/* @ts-expect-error utterly silly types */}
										{e.idvDifference(chart) && (
											<>
												<br />
												<QuickTooltip tooltipContent="Individual Difference - The difficulty of this varies massively between people!">
													<span>
														<Icon type="balance-scale-left" />
													</span>
												</QuickTooltip>
											</>
										)}
									</td>
								</tr>
							);
						})}
					</MiniTable>
				) : (
					<Muted>No tierlist info.</Muted>
				)}
			</Col>
		</Row>
	);
}

function ChartInfoMiddle({
	game,
	song,
	chart,
}: {
	chart: ChartDocument;
	game: GameGroup;
	song: SongDocument;
}) {
	if (game === "bms") {
		const bmsChart = chart as ChartDocument<"bms:7K" | "bms:14K">;

		return (
			<>
				<ExternalLink
					href={`https://bms-score-viewer.pages.dev/view?md5=${bmsChart.data.hashMD5}`}
				>
					View Chart
				</ExternalLink>
				<br />
				<ExternalLink
					href={`http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?&bmsmd5=${bmsChart.data.hashMD5}`}
				>
					View on LR2IR
				</ExternalLink>
			</>
		);
	} else if (game === "pms") {
		const pmsChart = chart as ChartDocument<"pms:Controller" | "pms:Keyboard">;

		return (
			<>
				<ExternalLink
					href={`http://www.dream-pro.info/~lavalse/LR2IR/search.cgi?&bmsmd5=${pmsChart.data.hashMD5}`}
				>
					View on LR2IR
				</ExternalLink>
			</>
		);
	}

	const gameConfig = GetGameGroupConfig(game);

	const diff = FormatDifficultySearch(chart, game);
	const gameName =
		game === "ongeki" ? "オンゲキ" : game === "maimaidx" ? "maimai" : gameConfig.name;
	const formattedTitle = song.title.replace(/-/gu, " ");

	let search = `${gameName} ${formattedTitle}`;

	if (diff !== null) {
		search += ` ${diff}`;
	}

	return (
		<>
			<ExternalLink
				href={`https://youtube.com/results?search_query=${encodeURIComponent(search)}`}
			>
				Search YouTube
			</ExternalLink>
			{"chartViewURL" in chart.data && (
				<>
					<br />
					<ExternalLink href={chart.data.chartViewURL}>Chart view</ExternalLink>
				</>
			)}
		</>
	);
}
