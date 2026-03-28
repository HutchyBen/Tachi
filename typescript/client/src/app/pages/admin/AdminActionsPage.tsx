import useSetSubheader from "#components/layout/header/useSetSubheader";
import useApiQuery from "#components/util/query/useApiQuery";
import { ADMIN_PAGE_SIZE } from "#lib/adminConstants";
import { MillisToSince } from "#util/time";
import React from "react";
import { Badge, Button, Form, Table } from "react-bootstrap";
import { Link, useHistory, useLocation } from "react-router-dom";

type ActionRow = {
	app: string;
	input: unknown;
	ip: string | null;
	kind: string;
	output: unknown | null;
	result: "BAD" | "GOOD" | "THROW";
	row_id: string;
	ts_end: string;
	ts_start: string;
	user_id: number | null;
	username: string | null;
};

type ActionsResponse = {
	actions: {
		items: ActionRow[];
		page: number;
		pageSize: number;
		total: number;
	};
	filters: { kind?: string; username?: string };
};

function durationMs(start: string, end: string): string {
	const ms = Date.parse(end) - Date.parse(start);
	if (Number.isNaN(ms)) {
		return "—";
	}
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

function resultVariant(result: string): "danger" | "secondary" | "success" | "warning" {
	if (result === "GOOD") {
		return "success";
	}
	if (result === "BAD") {
		return "warning";
	}
	if (result === "THROW") {
		return "danger";
	}
	return "secondary";
}

function JsonCell({ label, value }: { label: string; value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="text-body-secondary">—</span>;
	}
	const json = JSON.stringify(value, null, 2);
	return (
		<details>
			<summary className="small text-body-secondary">{label}</summary>
			<pre
				className="small mb-0 mt-1 p-2 bg-body-secondary rounded"
				style={{ maxWidth: "20rem" }}
			>
				{json}
			</pre>
		</details>
	);
}

export default function AdminActionsPage() {
	useSetSubheader(["Admin", "Actions"]);
	const location = useLocation();
	const history = useHistory();
	const apiUrl = `/admin/actions${location.search}`;

	const { data, error, isLoading } = useApiQuery<ActionsResponse>(apiUrl);

	if (error) {
		return <p className="text-danger">Failed to load actions.</p>;
	}

	if (isLoading || !data) {
		return <p className="text-body-secondary">Loading…</p>;
	}

	const { actions, filters } = data;
	const totalPages = Math.ceil(actions.total / ADMIN_PAGE_SIZE);
	const currentPage = actions.page;

	function buildPageUrl(p: number) {
		const sp = new URLSearchParams(location.search);
		sp.set("page", String(p));
		return `/admin/actions?${sp.toString()}`;
	}

	function onFilterSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const sp = new URLSearchParams();
		sp.set("page", "0");
		const kind = fd.get("kind");
		if (typeof kind === "string" && kind.trim() !== "") {
			sp.set("kind", kind.trim());
		}
		const username = fd.get("username");
		if (typeof username === "string" && username.trim() !== "") {
			sp.set("username", username.trim());
		}
		history.push(`/admin/actions?${sp.toString()}`);
	}

	return (
		<div className="d-flex flex-column gap-3">
			<h2 className="h5">
				Actions <span className="badge bg-secondary">{actions.total.toLocaleString()}</span>
			</h2>

			<Form className="d-flex flex-wrap align-items-end gap-3" onSubmit={onFilterSubmit}>
				<Form.Group>
					<Form.Label className="small mb-0">Action kind</Form.Label>
					<Form.Control
						defaultValue={filters.kind ?? ""}
						name="kind"
						placeholder="e.g. SET_USER_SUPPORTER_STATUS"
						size="sm"
						type="text"
					/>
				</Form.Group>
				<Form.Group>
					<Form.Label className="small mb-0">Username</Form.Label>
					<Form.Control
						defaultValue={filters.username ?? ""}
						name="username"
						placeholder="Filter by username"
						size="sm"
						type="text"
					/>
				</Form.Group>
				<Button size="sm" type="submit" variant="primary">
					Filter
				</Button>
				<Link className="btn btn-sm btn-outline-secondary" to="/admin/actions">
					Clear
				</Link>
			</Form>

			<div className="table-responsive">
				<Table hover size="sm" striped>
					<thead>
						<tr>
							<th>Time</th>
							<th>Duration</th>
							<th>Kind</th>
							<th>Result</th>
							<th>User</th>
							<th>IP</th>
							<th>Input</th>
							<th>Output</th>
						</tr>
					</thead>
					<tbody>
						{actions.items.length === 0 ? (
							<tr>
								<td className="text-body-secondary" colSpan={8}>
									No actions found.
								</td>
							</tr>
						) : (
							actions.items.map((action) => (
								<tr key={action.row_id}>
									<td className="small text-nowrap">
										{MillisToSince(Date.parse(action.ts_start))}
									</td>
									<td className="font-monospace small">
										{durationMs(action.ts_start, action.ts_end)}
									</td>
									<td className="small">{action.kind}</td>
									<td>
										<Badge bg={resultVariant(action.result)}>
											{action.result}
										</Badge>
									</td>
									<td>
										{action.username ? (
											<Link to={`/u/${action.username}`}>
												{action.username}
											</Link>
										) : (
											<span className="text-body-secondary">—</span>
										)}
									</td>
									<td className="font-monospace small">{action.ip ?? "—"}</td>
									<td>
										<JsonCell label="Input" value={action.input} />
									</td>
									<td>
										<JsonCell label="Output" value={action.output} />
									</td>
								</tr>
							))
						)}
					</tbody>
				</Table>
			</div>

			{totalPages > 1 && (
				<div className="d-flex align-items-center gap-3">
					{currentPage > 0 && (
						<Link
							className="btn btn-sm btn-outline-primary"
							to={buildPageUrl(currentPage - 1)}
						>
							← Prev
						</Link>
					)}
					<span className="small text-body-secondary">
						Page {currentPage + 1} of {totalPages}
					</span>
					{currentPage < totalPages - 1 && (
						<Link
							className="btn btn-sm btn-outline-primary"
							to={buildPageUrl(currentPage + 1)}
						>
							Next →
						</Link>
					)}
				</div>
			)}
		</div>
	);
}
