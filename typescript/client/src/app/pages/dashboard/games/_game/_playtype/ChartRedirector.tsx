import { ErrorPage } from "#app/pages/ErrorPage";
import Loading from "#components/util/Loading";
import useApiQuery from "#components/util/query/useApiQuery";
import { type GamePT } from "#types/react";
import { CreateChartLink } from "#util/data";
import React from "react";
import { Redirect, useParams } from "react-router-dom";
import { type ChartDocument, type SongDocument } from "tachi-common";

// Redirects a user from /charts/:chartID to the correct /songs/:songID/:difficulty
// url
export default function ChartRedirector({ game, playtype }: GamePT) {
	const { chartID } = useParams<{ chartID: string }>();

	const { data, error } = useApiQuery<{
		chart: ChartDocument;
		song: SongDocument;
	}>(`/games/${game}/${playtype}/charts/${chartID}`);

	if (error) {
		return <ErrorPage customMessage={error.description} statusCode={error.statusCode} />;
	}

	if (!data) {
		return <Loading />;
	}

	return <Redirect to={CreateChartLink(data.chart, game)} />;
}
