import { ExpectedErr } from "bliss";

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

import { type Response } from "express";

export function actionErrorToResponse(res: Response, err: unknown) {
	if (ExpectedErr.is(err)) {
		return res.status(err.code).json({
			success: false,
			description: err.reason,
		});
	}

	return res.status(500).json({
		success: false,
		description: "An internal server error has occured.",
	});
}
