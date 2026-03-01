import Card from "#components/layout/page/Card";
import SeedsTable, { SeedsDiffTable } from "#components/tables/seeds/SeedsTable";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import SelectButton from "#components/util/SelectButton";
import { ColourConfig } from "#lib/config";
import { type Revision } from "#types/git";
import { ChangeOpacity } from "#util/color-opacity";
import { JoinJSX } from "#util/misc";
import { DiffSeeds, LoadSeeds } from "#util/seeds";
import { StrSOV } from "#util/sorts";
import React, { useEffect, useMemo, useState } from "react";
import { Button, Col } from "react-bootstrap";
import { type AllDatabaseSeeds } from "tachi-common";

export default function SeedsStateViewer({
	baseRev,
	headRev,
	view,
}: {
	baseRev: Revision;
	headRev: Revision | null;
	view: "DIFF" | "FULL";
}) {
	const [baseData, setBaseData] = useState<Partial<AllDatabaseSeeds> | null>(null);

	// typescript lets me get away with insane enums like this, so damnit i will.
	// "LOADING" is different to headData being null (not picked), unlike baseRev, which cannot be null.
	const [headData, setHeadData] = useState<"LOADING" | Partial<AllDatabaseSeeds> | null>(null);

	useEffect(() => {
		(async () => {
			// enter loading...
			setBaseData(null);
			const data = await LoadSeeds(baseRev.repo, baseRev.c.sha);

			setBaseData(data);
		})();
	}, [baseRev]);

	useEffect(() => {
		(async () => {
			// enter loading...
			setHeadData("LOADING");

			if (headRev === null) {
				setHeadData(null);
				return;
			}

			const data = await LoadSeeds(headRev.repo, headRev.c.sha);

			setHeadData(data);
		})();
	}, [headRev]);

	if (baseData === null || headData === "LOADING") {
		return (
			<Col xs={12}>
				<div className="d-flex justify-content-center">
					<div>
						<Loading />
						<br />
						Reading data...
					</div>
				</div>
			</Col>
		);
	}

	if (headData !== null) {
		return <SeedsDiffState baseData={baseData} headData={headData} />;
	}

	if (view === "DIFF") {
		if (baseRev.c.parents.length === 0) {
			// no parents, diff against the empty set.
			return <SeedsDiffState baseData={baseData} headData={{}} />;
		} else if (baseRev.c.parents.length > 1) {
			// more than one parent, i have no idea what to do?
			return (
				<div>
					This commit has multiple parents. Diffing against this isn't supported yet,
					sorry.
					<code>{baseRev.c.parents.join(", ")}</code>
				</div>
			);
		}

		return <SeedsDiffParentState baseRev={baseRev} seedsData={baseData} />;
	}

	return <SeedsAbsoluteState seedsData={baseData} />;
}

function SeedsDiffParentState({
	seedsData,
	baseRev,
}: {
	baseRev: Revision;
	seedsData: Partial<AllDatabaseSeeds>;
}) {
	const [parentData, setParentData] = useState<Partial<AllDatabaseSeeds> | null>(null);

	useEffect(() => {
		(async () => {
			// loading...
			setParentData(null);

			const data = await LoadSeeds(baseRev.repo, baseRev.c.parents[0].sha.trim());

			setParentData(data);
		})();
	}, [baseRev]);

	if (parentData === null) {
		return (
			<Col xs={12}>
				<div className="d-flex justify-content-center">
					<div>
						<Loading />
						<br />
						Comparing against previous state... (This takes a bit.)
					</div>
				</div>
			</Col>
		);
	}

	return <SeedsDiffState baseData={parentData} headData={seedsData} />;
}

function SeedsAbsoluteState({ seedsData }: { seedsData: Partial<AllDatabaseSeeds> }) {
	const files = Object.keys(seedsData).sort(StrSOV((k) => k)) as Array<keyof AllDatabaseSeeds>;

	const [file, setFile] = useState(files[0]);

	return (
		<>
			<Col xs={12}>
				<Card header="Collections">
					<div className="d-flex flex-wrap" style={{ justifyContent: "space-around" }}>
						{files.map((e) => (
							<div className="my-2" key={e}>
								<SelectButton id={e} setValue={setFile} value={file}>
									{e} ({seedsData[e]?.length ?? 0})
								</SelectButton>
							</div>
						))}
					</div>
				</Card>
			</Col>
			<Col xs={12}>
				<Divider />
				<h1 className="text-center">{file}</h1>
				<Divider />
				<SeedsTable data={seedsData} file={file} />
			</Col>
		</>
	);
}

function SeedsDiffState({
	baseData,
	headData,
}: {
	baseData: Partial<AllDatabaseSeeds>;
	headData: Partial<AllDatabaseSeeds>;
}) {
	const seedsDiff = useMemo(() => DiffSeeds(baseData, headData), [baseData, headData]);

	const files = Object.keys(seedsDiff).sort(StrSOV((k) => k)) as Array<keyof AllDatabaseSeeds>;

	// don't display anything with 0 diffs.
	const filesWithDiffs = files.filter((e) => seedsDiff[e]?.length !== 0);

	const [file, setFile] = useState<keyof AllDatabaseSeeds | null>(filesWithDiffs[0] ?? null);

	return (
		<Col xs={12}>
			<Card header="Changes">
				<div className="d-flex flex-wrap" style={{ justifyContent: "space-around" }}>
					{filesWithDiffs.length > 0 ? (
						filesWithDiffs.map((e) => {
							let added = 0;
							let modified = 0;
							let deleted = 0;

							for (const diff of seedsDiff[e]!) {
								switch (diff.type) {
									case "ADDED":
										added++;
										break;
									case "DELETED":
										deleted++;
										break;
									case "MODIFIED":
										modified++;
										break;
								}
							}

							const display = [];

							if (added) {
								display.push(<span className="text-success">+{added}</span>);
							}

							if (modified) {
								display.push(<span className="text-warning">~{modified}</span>);
							}

							if (deleted) {
								display.push(<span className="text-danger">-{deleted}</span>);
							}

							return (
								<div className="my-2" key={e}>
									<Button
										onClick={() => setFile(e)}
										style={
											file === e
												? {
														backgroundColor: ChangeOpacity(
															ColourConfig.primary,
															0.6,
														),
													}
												: {}
										}
										variant={file === e ? "primary" : "secondary"}
									>
										{e}
										{display.length > 0 && (
											<>
												<br />({JoinJSX(display, <span> | </span>)})
											</>
										)}
									</Button>
								</div>
							);
						})
					) : (
						<div>There are no changes between these two commits.</div>
					)}
				</div>
			</Card>
			{file && (
				<Col xs={12}>
					<Divider />
					<h1 className="text-center">{file}</h1>
					<Divider />
					<SeedsDiffTable
						baseData={baseData}
						diffs={seedsDiff[file] ?? []}
						file={file}
						headData={headData}
					/>
				</Col>
			)}
		</Col>
	);
}
