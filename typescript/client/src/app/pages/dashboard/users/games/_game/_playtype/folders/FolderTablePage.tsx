import { BarChartTooltip } from "#components/charts/ChartTooltip";
import Card from "#components/layout/page/Card";
import TachiTable from "#components/tables/components/TachiTable";
import ApiError from "#components/util/ApiError";
import DebugContent from "#components/util/DebugContent";
import Divider from "#components/util/Divider";
import Icon from "#components/util/Icon";
import LinkButton from "#components/util/LinkButton";
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
import { DEFAULT_BAR_PROPS } from "#util/charts";
import { ChangeOpacity } from "#util/color-opacity";
import { Reverse, ToFixedFloor, UppercaseFirst } from "#util/misc";
import { NumericSOV, StrSOV } from "#util/sorts";
import { ResponsiveBar } from "@nivo/bar";
import React, { useContext, useEffect, useMemo, useState } from "react";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import {
	type GameGroup,
	type GamePTConfig,
	GetGamePTConfig,
	GetGPTString,
	GetScoreMetricConf,
	GetScoreMetrics,
	type MONGO_FolderDocument,
	type MONGO_TableDocument,
	type MONGO_UserDocument,
	type Playtype,
} from "tachi-common";
import { type ConfEnumScoreMetric } from "tachi-common/types/metrics";

interface Props {
	reqUser: MONGO_UserDocument;
	game: GameGroup;
	playtype: Playtype;
}

export default function FolderTablePage({ reqUser, game, playtype }: Props) {
	const { data, error } = useApiQuery<MONGO_TableDocument[]>(
		`/games/${game}/${playtype}/tables?showInactive=true`,
	);

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
			{table && <TableFolderViewer {...{ reqUser, game, playtype, table }} />}
		</>
	);
}

interface UGPTFolderStats {
	folder: MONGO_FolderDocument;
	stats: FolderStatsInfo;
}

function TableFolderViewer({
	reqUser,
	game,
	playtype,
	table,
}: { table: MONGO_TableDocument } & Props) {
	const { data, error } = useApiQuery<UGPTTableReturns>(
		`/users/${reqUser.id}/games/${game}/${playtype}/tables/${table.tableID}`,
	);

	const [dataMap, setDataMap] = useState<Map<string, UGPTFolderStats>>(new Map());
	const [hasLoadedFolderMap, setHasLoadedFolderMap] = useState(false);

	useEffect(() => {
		if (data) {
			const statMap = new Map();
			for (const stat of data.stats) {
				statMap.set(stat.folderID, stat);
			}

			const newMap = new Map();
			for (const folder of data.folders) {
				const stats = statMap.get(folder.folderID)!;
				newMap.set(folder.folderID, { folder, stats });
			}
			setDataMap(newMap);
			setHasLoadedFolderMap(true);
		}
	}, [data]);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data || !hasLoadedFolderMap) {
		return <Loading />;
	}

	return (
		<>
			<TableBarChart dataMap={dataMap} table={table} />
			<Divider />
			<TableFolderTable
				dataMap={dataMap}
				game={game}
				playtype={playtype}
				reqUser={reqUser}
				table={table}
			/>
		</>
	);
}

function TableFolderTable({
	table,
	dataMap,
	reqUser,
	game,
	playtype,
}: {
	dataMap: Map<string, UGPTFolderStats>;
	table: MONGO_TableDocument;
} & Props) {
	const dataset = useMemo(() => {
		const arr = [];
		for (const folder of table.folders) {
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
		<TachiTable
			dataset={dataset}
			entryName="Folders"
			headers={[
				["Folder", "Folder", StrSOV((x) => x.folder.title)],
				["Chart Count", "Charts", NumericSOV((x) => x.stats.chartCount)],
				["Buttons", "Buttons"],
			]}
			pageLen={25}
			rowFunction={(data) => (
				<tr>
					<td>{data.folder.title}</td>
					<td>{data.stats.chartCount}</td>
					<td>
						<LinkButton
							className="btn-info"
							onClick={() => {
								if (user?.id === reqUser.id) {
									APIFetchV1(
										`/users/${reqUser.id}/games/${game}/${playtype}/folders/${data.folder.folderID}/viewed`,
										{ method: "POST" },
									);
								}
							}}
							to={`/u/${reqUser.username}/games/${game}/${playtype}/folders/${data.folder.folderID}`}
						>
							View Breakdown
						</LinkButton>
					</td>
				</tr>
			)}
			searchFunctions={{
				name: (x) => x.folder.title,
				title: (x) => x.folder.title,
				charts: (x) => x.stats.chartCount,
			}}
		/>
	);
}

function TableBarChart({
	table,
	dataMap,
}: {
	dataMap: Map<string, UGPTFolderStats>;
	table: MONGO_TableDocument;
}) {
	const gptConfig = GetGamePTConfig(table.game, table.playtype);
	const gptImpl = GPT_CLIENT_IMPLEMENTATIONS[GetGPTString(table.game, table.playtype)];

	const bucket = useBucket(table.game, table.playtype);

	const [enumMetric, setEnumMetric] = useState<string>(bucket);

	// @ts-expect-error hack!
	const colours = useMemo(() => gptImpl.enumColours[enumMetric], [enumMetric]);

	const dataset = useMemo(() => {
		const arr = [];

		for (const folderID of table.folders) {
			const data = dataMap.get(folderID)!;

			if (!data) {
				continue;
			}

			const realData = {
				__chartCount: data.stats.chartCount,
			};

			// this is a series of stupid hacks and i dont really care.
			for (const key in data.stats.stats[enumMetric]) {
				// @ts-expect-error stupid key stuff
				realData[key] = (100 * data.stats.stats[enumMetric][key]) / data.stats.chartCount;
				// @ts-expect-error stupid key stuff
				realData[`${key}-count`] = data.stats.stats[enumMetric][key];
			}

			arr.push({
				folder:
					data.folder.title.length > 10
						? `${data.folder.title.slice(0, 10)}...`
						: data.folder.title,
				...realData,
			});
		}

		return arr.reverse();
	}, [dataMap, enumMetric]);

	return (
		<Card header="Overview">
			<div className="row">
				<div className="col-12 d-flex justify-content-center">
					<div className="btn-group">
						{GetScoreMetrics(gptConfig, "ENUM").map((e) => (
							<SelectButton
								id={e}
								key={e}
								setValue={setEnumMetric}
								value={enumMetric}
							>
								{/* @ts-expect-error this access is legal zzz */}
								<Icon type={gptImpl.enumIcons[e]} /> {UppercaseFirst(e)}s
							</SelectButton>
						))}
					</div>
				</div>
				<div className="col-12">
					<Divider />
				</div>

				<div className="col-12">
					<div
						style={{
							height: dataset.length * 40,
						}}
					>
						<OverviewBarChart
							colours={colours}
							dataset={dataset}
							gptConfig={gptConfig}
							// This hack is necessary because otherwise nivo gets caught in a render loop and dies
							key={enumMetric}
							mode={enumMetric}
						/>
					</div>
				</div>
			</div>
		</Card>
	);
}

function OverviewBarChart({
	gptConfig,
	mode: metric,
	dataset,
	colours,
}: {
	colours: any;
	dataset: any;
	gptConfig: GamePTConfig;
	mode: string;
}) {
	const longestTitle = useMemo(
		() =>
			Math.min(
				dataset.map((e: any) => e.folder).sort(NumericSOV<string>((x) => x.length, true))[0]
					?.length ?? 0,
				10,
			),
		[dataset],
	);

	const conf = GetScoreMetricConf(gptConfig, metric) as ConfEnumScoreMetric<string>;

	return (
		<ResponsiveBar
			axisBottom={{
				tickSize: 5,
				tickPadding: 5,
				tickRotation: 0,
				legendPosition: "middle",
				legendOffset: 32,
				format: (v) => `${v}%`,
			}}
			borderColor={(k) => ChangeOpacity(colours[k.data.id], 0.4)}
			borderWidth={1}
			colors={(k) => ChangeOpacity(colours[k.id], 0.5)}
			data={dataset}
			enableGridX
			enableGridY={false}
			indexBy="folder"
			keys={Reverse(conf.values)}
			layout="horizontal"
			margin={{ left: 10 + longestTitle * 8, bottom: 50, top: 20, right: 20 }}
			maxValue={100}
			minValue={0}
			tooltip={(d) => (
				<BarChartTooltip barDatum={d}>
					<Muted>
						({(d.data as any)[`${d.id}-count`] ?? 0} / {d.data.__chartCount})
					</Muted>
				</BarChartTooltip>
			)}
			valueFormat={(v) => `${ToFixedFloor(v, 2)}%`}
			{...DEFAULT_BAR_PROPS}
			labelSkipHeight={undefined}
			labelSkipWidth={40}
		/>
	);
}
