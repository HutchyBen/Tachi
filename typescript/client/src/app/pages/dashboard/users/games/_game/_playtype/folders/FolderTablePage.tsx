import QuickTooltip from "#components/layout/misc/QuickTooltip";
import Card from "#components/layout/page/Card";
import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import Loading from "#components/util/Loading";
import Muted from "#components/util/Muted";
import useApiQuery from "#components/util/query/useApiQuery";
import SelectButton from "#components/util/SelectButton";
import { useBucket } from "#components/util/useBucket";
import useLUGPTSettings from "#components/util/useLUGPTSettings";
import { UserContext } from "#context/UserContext";
import { GPT_CLIENT_IMPLEMENTATIONS } from "#lib/game-implementations";
import { type FolderStatsInfo, type UGPTTableReturns } from "#types/api-returns";
import { APIFetchV1 } from "#util/api";
import { ChangeOpacity } from "#util/color-opacity";
import { ToFixedFloor, UppercaseFirst } from "#util/misc";
import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import { Link } from "react-router-dom";
import {
	type FolderDocument,
	type GameConfig,
	GetGameConfig,
	GetScoreMetricConf,
	GetScoreMetrics,
	type TableDocument,
	type UserDocument,
	type V3Game,
} from "tachi-common";

import folderTableStyles from "./FolderTablePage.module.scss";

interface Props {
	reqUser: UserDocument;
	game: V3Game;
}

export default function FolderTablePage({ reqUser, game }: Props) {
	const { data, error } = useApiQuery<TableDocument[]>(`/games/${game}/tables?showInactive=true`);

	const { settings } = useLUGPTSettings();

	const [tableID, setTableID] = useState("");
	const [tableMap, setTableMap] = useState(new Map());

	const table = useMemo(() => tableMap.get(tableID), [tableID, tableMap]);

	useEffect(() => {
		if (data) {
			const newMap = new Map();
			let foundDefault = false;

			for (const table of data) {
				newMap.set(table.tableID, table);

				// If the user has a preference
				if (settings?.preferences.defaultTable) {
					if (settings.preferences.defaultTable === table.tableID) {
						setTableID(table.tableID);
						foundDefault = true;
					}
					// Otherwise just use the provided default.
				}

				if (table.default && !foundDefault) {
					setTableID(table.tableID);
					foundDefault = true;
				}
			}
			setTableMap(newMap);

			if (!foundDefault) {
				console.warn(`No default table returned? Falling back to the first thing we saw.`);
				setTableID(data[0].tableID);
			}
		}
	}, [data]);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	const displayableTables = data.filter(
		(e) =>
			!e.inactive ||
			(settings?.preferences.defaultTable && settings.preferences.defaultTable === e.tableID),
	);

	return (
		<>
			<InputGroup size="lg">
				<InputGroup.Text>Table</InputGroup.Text>
				<Form.Select onChange={(e) => setTableID(e.target.value)} value={tableID}>
					{displayableTables.map((e) => (
						<option key={e.tableID} value={e.tableID}>
							{e.title}
						</option>
					))}
				</Form.Select>
			</InputGroup>
			<Divider />
			{table && <TableFolderViewer {...{ reqUser, game, table }} />}
		</>
	);
}

interface UGPTFolderStats {
	folder: FolderDocument;
	stats: FolderStatsInfo;
}

/** API `table.folders` is ascending (e.g. Level 1 … 12); show highest folder / level first in chart + table. */
function tableFolderSlugsDisplayOrder(table: TableDocument): string[] {
	return [...table.folders].reverse();
}

const FOLDER_ENUM_BAR_HEIGHT = "1.625rem";

/** In-bar `%` text only when the segment is at least this wide (measured in CSS pixels). */
const MIN_SEGMENT_WIDTH_PX_FOR_INLINE_LABEL = 30;

function FolderEnumProgressBar({
	stats,
	enumMetric,
	gameConfig,
	colours,
}: {
	colours: Record<string, string> | undefined;
	enumMetric: string;
	gameConfig: GameConfig;
	stats: FolderStatsInfo;
}) {
	const barRef = useRef<HTMLDivElement>(null);
	const [barWidthPx, setBarWidthPx] = useState(0);

	useLayoutEffect(() => {
		const el = barRef.current;
		if (!el) {
			return;
		}

		const update = () => {
			setBarWidthPx(el.getBoundingClientRect().width);
		};

		update();
		const ro = new ResizeObserver((entries) => {
			const w = entries[0]?.contentRect.width;
			if (w !== undefined) {
				setBarWidthPx(w);
			}
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
		};
	}, []);

	const conf = GetScoreMetricConf(gameConfig, enumMetric);
	if (conf.type !== "ENUM") {
		return null;
	}

	const total = stats.chartCount;
	const bucket = stats.stats[enumMetric] ?? {};

	const segments: Array<{ count: number; label: string; rawFill: string }> = [];
	let filled = 0;
	for (let vi = conf.values.length - 1; vi >= 0; vi--) {
		const v = conf.values[vi];
		const count = bucket[v] ?? 0;
		if (count > 0) {
			filled += count;
			segments.push({
				label: v,
				count,
				rawFill: colours?.[v] ?? "var(--bs-secondary-bg)",
			});
		}
	}

	if (total === 0) {
		return <Muted>—</Muted>;
	}

	const remainder = Math.max(0, total - filled);
	const remainderWidthPct = total > 0 ? (100 * remainder) / total : 0;

	return (
		<div
			className={`border overflow-hidden rounded-3 ${folderTableStyles.folderEnumBar}`}
			dir="ltr"
			lang="en"
			ref={barRef}
			style={{
				backgroundColor: "var(--bs-secondary-bg)",
				direction: "ltr",
				display: "block",
				height: FOLDER_ENUM_BAR_HEIGHT,
				minHeight: "1.25rem",
				unicodeBidi: "isolate",
				width: "100%",
			}}
		>
			<div
				style={{
					display: "flex",
					flexDirection: "row",
					height: "100%",
					width: "100%",
				}}
			>
				{segments.map((seg, segIndex) => {
					const pct = total > 0 ? (100 * seg.count) / total : 0;
					const fill = seg.rawFill.startsWith("var(")
						? seg.rawFill
						: ChangeOpacity(seg.rawFill, 0.92);
					const segmentWidthPx = barWidthPx > 0 ? (pct / 100) * barWidthPx : 0;
					const showInlinePct = segmentWidthPx >= MIN_SEGMENT_WIDTH_PX_FOR_INLINE_LABEL;
					const inlinePctText = `${Math.round(pct)}%`;

					return (
						<QuickTooltip
							key={seg.label}
							tooltipContent={
								<>
									<div>{seg.label}</div>
									<div>{ToFixedFloor(pct, 2)}%</div>
									<Muted>
										({seg.count} / {total})
									</Muted>
								</>
							}
						>
							<div
								className={`h-100 ${folderTableStyles.folderEnumBarSegment}`}
								style={{
									animationDelay: `${0.05 + segIndex * 0.055}s`,
									backgroundColor: fill,
									flex: "none",
									minWidth: seg.count ? "4px" : 0,
									width: `${pct}%`,
								}}
							>
								{showInlinePct && (
									<span className={folderTableStyles.folderEnumBarLabel}>
										{inlinePctText}
									</span>
								)}
							</div>
						</QuickTooltip>
					);
				})}
				{remainderWidthPct > 0 && (
					<div
						aria-hidden
						className={`h-100 ${folderTableStyles.folderEnumBarRemainder}`}
						style={{
							animationDelay: `${0.05 + segments.length * 0.055}s`,
							backgroundColor: "transparent",
							flex: "none",
							width: `${remainderWidthPct}%`,
						}}
					/>
				)}
			</div>
		</div>
	);
}

function TableFolderViewer({ reqUser, game, table }: { table: TableDocument } & Props) {
	const { data, error } = useApiQuery<UGPTTableReturns>(
		`/users/${reqUser.id}/games/${game}/tables/${table.tableID}`,
	);

	const bucket = useBucket(game);
	const [enumMetric, setEnumMetric] = useState(bucket);

	useEffect(() => {
		setEnumMetric(bucket);
	}, [bucket, table.tableID]);

	const [dataMap, setDataMap] = useState<Map<string, UGPTFolderStats>>(new Map());
	const [hasLoadedFolderMap, setHasLoadedFolderMap] = useState(false);

	useEffect(() => {
		if (data) {
			const statMap = new Map();
			for (const stat of data.stats) {
				statMap.set(stat.slug, stat);
			}

			const newMap = new Map();
			for (const folder of data.folders) {
				const stats = statMap.get(folder.slug)!;
				newMap.set(folder.slug, { folder, stats });
			}
			setDataMap(newMap);
			setHasLoadedFolderMap(true);
		}
	}, [data]);

	const gameConfig = useMemo(() => GetGameConfig(game), [game]);
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[game];

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data || !hasLoadedFolderMap) {
		return <Loading />;
	}

	return (
		<>
			<Card header="Overview">
				<div className="row">
					<div className="col-12 d-flex justify-content-center">
						<div className="btn-group">
							{GetScoreMetrics(gameConfig, "ENUM").map((e) => (
								<SelectButton
									id={e}
									key={e}
									setValue={setEnumMetric}
									value={enumMetric}
								>
									{/* @ts-expect-error enum icon keys align with score metrics */}
									<Icon type={gptImpl.enumIcons[e]} /> {UppercaseFirst(e)}s
								</SelectButton>
							))}
						</div>
					</div>
				</div>
			</Card>
			<Divider />
			<TableFolderList
				dataMap={dataMap}
				enumMetric={enumMetric}
				game={game}
				reqUser={reqUser}
				table={table}
			/>
		</>
	);
}

function TableFolderList({
	table,
	dataMap,
	enumMetric,
	reqUser,
	game,
}: {
	dataMap: Map<string, UGPTFolderStats>;
	enumMetric: string;
	table: TableDocument;
} & Props) {
	const gameConfig = useMemo(() => GetGameConfig(game), [game]);

	const enumColours = useMemo(
		() =>
			(
				GPT_CLIENT_IMPLEMENTATIONS[game].enumColours as
					| Record<string, Record<string, string>>
					| undefined
			)?.[enumMetric],
		[enumMetric, game],
	);

	const dataset = useMemo(() => {
		const arr = [];
		for (const folder of tableFolderSlugsDisplayOrder(table)) {
			const data = dataMap.get(folder);

			if (!data) {
				continue;
			}

			arr.push(data);
		}

		return arr;
	}, [dataMap, table]);

	const { user } = useContext(UserContext);

	return (
		<div className="mt-4">
			{dataset.length === 0 ? (
				<div className="text-center text-body-secondary py-5">No folders.</div>
			) : (
				dataset.map((data) => (
					<Link
						className={`${folderTableStyles.folderRow} bg-body-tertiary bg-opacity-25`}
						key={data.folder.slug}
						onClick={() => {
							if (user?.id === reqUser.id) {
								APIFetchV1(
									`/users/${reqUser.id}/games/${game}/folders/${data.folder.slug}/viewed`,
									{
										method: "POST",
									},
								);
							}
						}}
						to={`/u/${reqUser.username}/games/${game}/folders/${data.folder.slug}`}
					>
						<div className="d-flex flex-column flex-lg-row align-items-lg-center gap-2 gap-lg-3">
							<div
								className={`fw-semibold text-truncate ${folderTableStyles.folderRowTitle}`}
							>
								{data.folder.title}
							</div>
							<div className="flex-grow-1 min-w-0" style={{ minWidth: "10rem" }}>
								<FolderEnumProgressBar
									colours={enumColours}
									enumMetric={enumMetric}
									gameConfig={gameConfig}
									key={`${enumMetric}-${data.folder.slug}`}
									stats={data.stats}
								/>
							</div>
							<div
								className={`d-flex align-items-center ms-lg-auto ${folderTableStyles.folderRowChartMeta}`}
							>
								<span
									className={`text-body-secondary ${folderTableStyles.folderRowChartCount}`}
								>
									{data.stats.chartCount}
								</span>
								<Icon
									aria-hidden
									className="text-body-secondary opacity-75"
									type="chevron-right"
								/>
							</div>
						</div>
					</Link>
				))
			)}
		</div>
	);
}
