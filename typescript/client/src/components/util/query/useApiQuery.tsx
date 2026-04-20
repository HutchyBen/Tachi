import { APIFetchV1, type UnsuccessfulAPIFetchResponse } from "#util/api";
import { type QueryKey, useQuery } from "react-query";
import { type SuccessfulAPIResponse } from "tachi-common";

export function UnfuckURLsV3GameToV2Format(url: string) {
	return url;
}

export default function useApiQuery<T>(
	url: string | string[],
	options?: RequestInit,
	additionalDeps?: QueryKey,
	skip = false,
) {
	const deps = [];

	if (Array.isArray(url)) {
		url = url.map((u) => UnfuckURLsV3GameToV2Format(u));
	} else {
		url = UnfuckURLsV3GameToV2Format(url);
	}

	if (additionalDeps) {
		deps.push(...additionalDeps);
	}

	if (Array.isArray(url)) {
		deps.push(...url);
	} else {
		deps.push(url);
	}

	return useQuery<T, UnsuccessfulAPIFetchResponse>(
		deps,
		async () => {
			if (Array.isArray(url)) {
				const results = await Promise.all(url.map((u) => APIFetchV1(u, options)));

				if (!results.every((r) => r.success)) {
					throw results;
				}

				return results.map((e) => (e as SuccessfulAPIResponse).body) as unknown as T;
			}

			const res = await APIFetchV1<T>(url, options);

			if (!res.success) {
				console.log(`Threw res`, res);
				throw res;
			}

			return res.body;
		},
		{
			retry: false,
			enabled: !skip,
		},
	);
}
