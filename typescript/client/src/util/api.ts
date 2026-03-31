import { type SuccessfulAPIResponse, type UnsuccessfulAPIResponse } from "tachi-common";

import { HumaniseError } from "./humanise-error";
import { SendErrorToast, SendSuccessToast } from "./toaster";

const BASE_OPTIONS = {
	credentials: "include",
};

const BASE_URL = import.meta.env.VITE_SERVER_URL ?? "";
const CDN_URL = import.meta.env.VITE_CDN_URL;

if (!CDN_URL) {
	throw new Error(`Cannot run -- no VITE_CDN_URL provided?`);
}

export function ToAPIURL(url: string) {
	if (url[0] !== "/") {
		url = `/${url}`;
	}

	return `${BASE_URL}/api/v1${url}`;
}

/**
 * When `VITE_SERVER_URL` is unset, `ToAPIURL` is same-origin relative. On the Vite dev
 * server, a plain `/api/v1/...` link would hit the SPA and reload `index.html` in a loop.
 * For "open in browser" help links, force an absolute backend URL in local dev.
 */
export function ToAbsoluteAPIURLForHelpLink(url: string) {
	const u = ToAPIURL(url);
	if (u.startsWith("http://") || u.startsWith("https://")) {
		return u;
	}
	if (import.meta.env.VITE_IS_LOCAL_DEV) {
		return `http://127.0.0.1:8080${u}`;
	}
	return u;
}

export function ToCDNURL(url: string) {
	if (url[0] !== "/") {
		url = `/${url}`;
	}

	return `${CDN_URL}${url}`;
}

export function ToServerURL(url: string) {
	if (url[0] !== "/") {
		url = `/${url}`;
	}

	return `${BASE_URL}${url}`;
}

export type APIFetchV1Return<T> = {
	statusCode: number;
} & (SuccessfulAPIResponse<T> | UnsuccessfulAPIResponse);

export type UnsuccessfulAPIFetchResponse = { statusCode: number } & UnsuccessfulAPIResponse;

export async function APIFetchV1<T = unknown>(
	url: string,
	options: RequestInit = {},
	displaySuccess = false,
	displayFailure = false,
): Promise<APIFetchV1Return<T>> {
	const mergedOptions = Object.assign({}, BASE_OPTIONS, options);

	try {
		const res = await fetch(ToAPIURL(url), mergedOptions);

		const rj = await res.json();

		if (!rj.success) {
			console.warn(rj);
		} else {
			console.debug(rj.description);
		}

		if (!rj.success && displayFailure) {
			// probably a prudence error...
			if (rj.description.includes("[K:")) {
				SendErrorToast(HumaniseError(rj.description));
			} else {
				SendErrorToast(rj.description);
			}
		}

		if (displaySuccess && rj.success) {
			SendSuccessToast(rj.description);
			// toast success
		}

		return { ...rj, statusCode: res.status };
	} catch (err) {
		console.error(err);
		throw err;
	}
}
