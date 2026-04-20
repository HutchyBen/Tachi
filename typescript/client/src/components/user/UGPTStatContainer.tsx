import Loading from "#components/util/Loading";
import { type UGPTPreferenceStatsReturn } from "#types/api-returns";
import { type UGPT } from "#types/react";
import { APIFetchV1 } from "#util/api";
import React from "react";
import { useQuery } from "react-query";
import { type integer, type ShowcaseStatDetails } from "tachi-common";

import { StatDisplay } from "./UGPTStatShowcase";

export default function UGPTStatContainer({
	stat,
	reqUser,
	game,
	shouldFetchCompareID,
}: { shouldFetchCompareID?: integer; stat: ShowcaseStatDetails } & UGPT) {
	const searchParams = new URLSearchParams();

	searchParams.set("mode", stat.mode);

	if (stat.mode === "folder") {
		searchParams.set("metric", stat.metric);
	}

	if (stat.mode === "chart") {
		searchParams.set("chartID", stat.chartID);
	} else if (stat.mode === "folder") {
		searchParams.set("folderSlug", Array.isArray(stat.slug) ? stat.slug.join(",") : stat.slug);
		searchParams.set("gte", stat.gte.toString());
	}

	const { data, error } = useQuery(
		`/users/${reqUser.id}/games/${game}/showcase/custom?${searchParams.toString()}`,
		async () => {
			const res = await APIFetchV1<UGPTPreferenceStatsReturn>(
				`/users/${reqUser.id}/games/${game}/showcase/custom?${searchParams.toString()}`,
			);

			if (!res.success) {
				throw new Error(res.description);
			}

			if (shouldFetchCompareID) {
				const res2 = await APIFetchV1<UGPTPreferenceStatsReturn>(
					`/users/${shouldFetchCompareID}/games/${game}/showcase/custom?${searchParams.toString()}`,
				);

				if (!res2.success) {
					throw new Error(res2.description);
				}

				return { data: res.body, compareData: res2.body };
			}

			return { data: res.body };
		},
	);

	if (error) {
		return <>{(error as any).description}</>;
	}

	if (!data) {
		return <Loading />;
	}

	return (
		<StatDisplay
			compareData={data.compareData}
			game={game}
			reqUser={reqUser}
			statData={data.data}
		/>
	);
}
