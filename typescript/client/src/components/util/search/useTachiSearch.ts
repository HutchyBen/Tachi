import { APIFetchV1, type UnsuccessfulAPIFetchResponse } from "#util/api";
import { useEffect, useState } from "react";
import {
	type GPTString,
	type integer,
	type MONGO_ChartDocument,
	type MONGO_FolderDocument,
	type MONGO_SongDocument,
	type MONGO_UserDocument,
} from "tachi-common";

type SearchResults = {
	charts: {
		[GPT in GPTString]?: Array<{
			chart: MONGO_ChartDocument;
			playcount: integer;
			song: MONGO_SongDocument;
		}>;
	};
	folders: Array<MONGO_FolderDocument>;
	users: Array<MONGO_UserDocument>;
};

type ChartHashSearchReturns = {
	charts: {
		[GPT in GPTString]?: Array<{
			chart: MONGO_ChartDocument;
			playcount: integer;
			song: MONGO_SongDocument;
		}>;
	};
};

export function useTachiSearch(
	search: string,
	hasPlayedGame = false,
): {
	data: SearchResults | null;
	error: UnsuccessfulAPIFetchResponse | null;
} {
	const [data, setData] = useState<SearchResults | null>(null);
	const [error, setError] = useState<UnsuccessfulAPIFetchResponse | null>(null);

	useEffect(() => {
		if (search === "") {
			setData({
				charts: {},
				folders: [],
				users: [],
			});
			return;
		}

		// loadin...
		setData(null);

		const searches = [];

		searches.push(
			APIFetchV1<SearchResults>(
				`/search?search=${encodeURIComponent(search)}${
					hasPlayedGame ? "&hasPlayedGame=true" : ""
				}`,
			),
		);

		searches.push(
			APIFetchV1<ChartHashSearchReturns>(
				`/search/chart-hash?search=${encodeURIComponent(search)}`,
			),
		);

		Promise.all(searches)
			.then((results) => {
				const setValue: SearchResults = {
					users: [],
					charts: {},
					folders: [],
				};

				for (const result of results) {
					if (result.success === false) {
						console.error(result);
						return;
					}

					for (const [g, charts] of Object.entries(result.body.charts)) {
						const gpt = g as GPTString;

						if (setValue.charts[gpt]) {
							setValue.charts[gpt]!.push(...charts);
						} else {
							setValue.charts[gpt] = charts;
						}
					}

					if ("users" in result.body) {
						setValue.users.push(...(result.body.users as Array<MONGO_UserDocument>));
					}
				}

				setData(setValue);
			})
			.catch((err) => {
				console.error(err);
				setData(null);
				setError({
					statusCode: 500,
					description: "Failed to reach the API.",
					success: false,
				});
			});
	}, [search, hasPlayedGame]);

	return { data, error };
}
