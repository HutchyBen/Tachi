import useSetSubheader from "#components/layout/header/useSetSubheader";
import TachiTable from "#components/tables/components/TachiTable";
import Loading from "#components/util/Loading";
import { APIFetchV1 } from "#util/api";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button } from "react-bootstrap";
import { GetGameGroupConfig, type GameGroup, type UserDocument } from "tachi-common";

type OrphanListItem = {
	orphanID: string;
	rowID: string;
	importType: string;
	gameGroup: string;
	timeInserted: number;
	message: string | null;
	summary: string | null;
};

type ListBody = { orphans: OrphanListItem[]; hasMore: boolean };

type ReprocessBody = {
	processed: number;
	removed: number;
	failed: number;
	success: number;
};

export default function UserOrphansPage({ reqUser }: { reqUser: UserDocument }) {
	useSetSubheader(
		["Users", reqUser.username, "Orphan scores"],
		[reqUser],
		`${reqUser.username}'s Orphan scores`,
	);

	const [orphans, setOrphans] = useState<OrphanListItem[]>([]);
	const [hasMore, setHasMore] = useState(false);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [reprocessBusy, setReprocessBusy] = useState(false);
	const [lastMessage, setLastMessage] = useState<string | null>(null);

	const fetchPage = useCallback(async (afterRowID: string | undefined, append: boolean) => {
		const params = new URLSearchParams({ limit: "50" });
		if (afterRowID) {
			params.set("after", afterRowID);
		}
		const res = await APIFetchV1<ListBody>(`/import/orphans?${params.toString()}`);
		if (!res.success) {
			setLastMessage(res.description);
			if (!append) {
				setOrphans([]);
				setHasMore(false);
			}
			return;
		}
		setLastMessage(null);
		setHasMore(res.body.hasMore);
		if (append) {
			setOrphans((prev) => [...prev, ...res.body.orphans]);
		} else {
			setOrphans(res.body.orphans);
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			setLoading(true);
			await fetchPage(undefined, false);
			if (!cancelled) {
				setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [fetchPage]);

	const onLoadMore = async () => {
		const last = orphans[orphans.length - 1];
		if (!last) {
			return;
		}
		setLoadingMore(true);
		await fetchPage(last.rowID, true);
		setLoadingMore(false);
	};

	const onReprocess = async () => {
		setReprocessBusy(true);
		setLastMessage(null);
		const res = await APIFetchV1<ReprocessBody>(
			"/import/orphans",
			{ method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
			true,
			true,
		);
		setReprocessBusy(false);
		if (res.success) {
			const { processed, failed, removed, success } = res.body;
			setLastMessage(
				`Reprocessed ${processed}: ${success} converted, ${failed} still unmatched, ${removed} removed as invalid.`,
			);
			setLoading(true);
			await fetchPage(undefined, false);
			setLoading(false);
		}
	};

	const onDelete = async (orphanID: string) => {
		if (!window.confirm(`Delete orphan ${orphanID}? This cannot be undone.`)) {
			return;
		}
		const res = await APIFetchV1(
			`/import/orphans/${encodeURIComponent(orphanID)}`,
			{ method: "DELETE" },
			true,
			true,
		);
		if (!res.success) {
			return;
		}
		setOrphans((prev) => prev.filter((o) => o.orphanID !== orphanID));
	};

	return (
		<div className="vstack gap-4">
			<div>
				<h4>Orphan scores</h4>
				<p className="mb-2">
					When an import cannot match a song or chart (SongOrChartNotFound), Tachi still stores
					that datapoint as an <strong>orphan</strong>. Orphans are retried automatically around{" "}
					<strong>00:01 UTC</strong> each day, or you can run a full reprocess below.
				</p>
				<p className="mb-0">
					Deleting an orphan only removes that queued datapoint; it does not revert an entire
					import.
				</p>
			</div>

			<div className="d-flex flex-wrap gap-2 align-items-center">
				<Button disabled={reprocessBusy} onClick={() => void onReprocess()} variant="primary">
					{reprocessBusy ? "Reprocessing…" : "Reprocess all my orphans now"}
				</Button>
			</div>

			{lastMessage && <Alert variant="info">{lastMessage}</Alert>}

			{loading ? (
				<Loading />
			) : orphans.length === 0 ? (
				<Alert variant="secondary">You have no orphan scores right now.</Alert>
			) : (
				<>
					<TachiTable
						dataset={orphans}
						entryName="Orphan scores"
						headers={[
							["Summary", "Summary"],
							["Import type", "Import type"],
							["Game", "Game"],
							["Time", "Time"],
							["Message", "Message"],
							["", "Actions"],
						]}
						rowFunction={(o) => (
							<tr key={o.orphanID}>
								<td>{o.summary ?? "—"}</td>
								<td>
									<code className="small">{o.importType}</code>
								</td>
								<td>
									{GetGameGroupConfig(o.gameGroup as GameGroup)?.name ?? o.gameGroup}
								</td>
								<td>{new Date(o.timeInserted).toLocaleString()}</td>
								<td className="small text-muted">{o.message ?? "—"}</td>
								<td>
									<Button
										onClick={() => void onDelete(o.orphanID)}
										size="sm"
										variant="outline-danger"
									>
										Delete
									</Button>
								</td>
							</tr>
						)}
					/>
					{hasMore && (
						<Button
							disabled={loadingMore}
							onClick={() => void onLoadMore()}
							variant="outline-secondary"
						>
							{loadingMore ? "Loading…" : "Load more"}
						</Button>
					)}
				</>
			)}
		</div>
	);
}
