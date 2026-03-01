import ApiError from "#components/util/ApiError";
import Divider from "#components/util/Divider";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { TachiConfig } from "#lib/config";
import { type UGPT } from "#types/react";
import { type GPTUtility } from "#types/ugpt";
import { CopyToClipboard } from "#util/misc";
import React from "react";
import { Alert, Button, Col, Row } from "react-bootstrap";

function Component({ game, playtype, reqUser }: UGPT) {
	const { data, error } = useApiQuery<string>(
		`/users/${reqUser.id}/games/${game}/${playtype}/eamusement-csv`,
	);

	if (error) {
		return <ApiError error={error} />;
	}

	if (!data) {
		return <Loading />;
	}

	return (
		<Row>
			<Col xs={12}>
				<Alert variant="warning">
					Hey! Please be aware that this format is <strong>lossy</strong>. You should use
					this to integrate with other tools that only support eamusement CSVs.
					<br />
					Tachi offers more fully fledged score exporting if you're looking to actually
					get your scores elsewhere.
				</Alert>
				<Divider />
			</Col>
			<Col xs={12}>
				<textarea
					className="w-100 font-monospace"
					readOnly
					style={{ height: "400px" }}
					value={data}
				/>
				<Divider />
				<div className="d-flex w-100 justify-content-center" style={{ gap: "10px" }}>
					<Button onClick={() => CopyToClipboard(data)} variant="outline-info">
						Copy to Clipboard
					</Button>
					<a
						className="btn btn-outline-primary"
						download={`iidx-eam-${reqUser.username}.csv`}
						href={`data:text/plain,${encodeURIComponent(data)}`}
					>
						Download
					</a>
				</div>
			</Col>
		</Row>
	);
}

export const IIDXEamusementExportTool: GPTUtility = {
	name: `e-amusement CSV Export`,
	urlPath: "eam-csv-export",
	description: `Export your ${TachiConfig.NAME} scores into e-amusement format.`,
	component: Component,
	personalUseOnly: true,
};
