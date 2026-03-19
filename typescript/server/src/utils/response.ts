import { type TachiAPIFailResponse } from "./types";

export function apiSuccess<T = never>(
	description: string,
	data: T,
): {
	body: T;
	description: string;
	success: true;
} {
	return {
		success: true,
		description: description,
		body: data,
	};
}

export function apiFail(description: string): {
	description: string;
} & TachiAPIFailResponse {
	return {
		description: description,
		success: false,
	};
}
