import type { GPTString, MONGO_ChartDocument } from "tachi-common";

import { GPT_SERVER_IMPLEMENTATIONS } from "#game-implementations/game-implementations";
import crypto from "crypto";

/**
 * Walk a dot-path like "data.notecount" into an object, returning the value
 * at that path or `undefined` if any segment is missing.
 */
function getAtPath(obj: Record<string, unknown>, path: string): unknown {
	let cur: unknown = obj;

	for (const segment of path.split(".")) {
		if (cur === null || cur === undefined || typeof cur !== "object") {
			return undefined;
		}

		cur = (cur as Record<string, unknown>)[segment];
	}

	return cur;
}

/**
 * Recursively sorts object keys so JSON.stringify produces a deterministic
 * string regardless of insertion order.
 */
function sortDeep(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(sortDeep);
	}

	if (typeof value === "object") {
		const sorted: Record<string, unknown> = {};

		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
		}

		return sorted;
	}

	return value;
}

/**
 * Compute a stable SHA-256 hex digest over the subset of chart fields that
 * affect score derivation for a given GPT.
 *
 * The checksum is deterministic: same field values always produce the same
 * hash, regardless of object key ordering.
 */
export function computeDerivationChecksum(
	chart: MONGO_ChartDocument,
	fields: Array<string>,
): string {
	const extracted: Record<string, unknown> = {};

	for (const field of [...fields].sort()) {
		extracted[field] = sortDeep(getAtPath(chart as unknown as Record<string, unknown>, field));
	}

	const payload = JSON.stringify(extracted);

	return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Compute the derivation checksum for a chart using the game's declared
 * `derivationRelevantFields`.
 */
export function computeDerivationChecksumForGPT(
	gpt: GPTString,
	chart: MONGO_ChartDocument,
): string {
	const impl = GPT_SERVER_IMPLEMENTATIONS[gpt];

	return computeDerivationChecksum(chart, impl.derivationRelevantFields);
}
