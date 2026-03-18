import { expect } from "vitest";

export interface ParityClientOptions {
	/**
	 * Base URL of the running Tachi server, e.g. "http://localhost:8080".
	 * Do not include a trailing slash.
	 */
	baseUrl: string;

	/**
	 * Default headers sent with every request (e.g. Authorization).
	 */
	headers?: Record<string, string>;
}

type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST" | "PUT";

interface ParityResponse {
	status: number;
	body: unknown;
}

export interface ParityResult {
	v1: ParityResponse;
	v1mongo: ParityResponse;
}

export interface RequestOptions {
	/** JSON body to send (non-GET requests). */
	body?: unknown;
	/** Per-request headers, merged with the client defaults. */
	headers?: Record<string, string>;
	/** Query string appended verbatim, e.g. "?page=1&limit=10". */
	query?: string;
	/**
	 * Top-level keys to delete from both response bodies before comparing.
	 * Useful for non-deterministic fields like timestamps.
	 */
	ignoreFields?: string[];
}

async function fireRequest(
	url: string,
	method: HttpMethod,
	headers: Record<string, string>,
	body: unknown,
): Promise<ParityResponse> {
	const init: RequestInit = {
		method,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
	};

	if (method !== "GET" && body !== undefined) {
		init.body = JSON.stringify(body);
	}

	const response = await fetch(url, init);

	let responseBody: unknown;

	const contentType = response.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		responseBody = await response.json();
	} else {
		responseBody = await response.text();
	}

	return { status: response.status, body: responseBody };
}

function stripFields(value: unknown, fields: string[]): unknown {
	if (fields.length === 0 || typeof value !== "object" || value === null) {
		return value;
	}

	const copy = { ...value } as Record<string, unknown>;

	for (const field of fields) {
		delete copy[field];
	}

	return copy;
}

export class ParityRequest {
	private readonly clientOptions: ParityClientOptions;
	private readonly method: HttpMethod;
	private readonly path: string;
	private options: RequestOptions;

	constructor(
		clientOptions: ParityClientOptions,
		method: HttpMethod,
		path: string,
		options: RequestOptions = {},
	) {
		this.clientOptions = clientOptions;
		this.method = method;
		this.path = path;
		this.options = options;
	}

	withBody(body: unknown): this {
		this.options = { ...this.options, body };
		return this;
	}

	withHeaders(headers: Record<string, string>): this {
		this.options = { ...this.options, headers: { ...this.options.headers, ...headers } };
		return this;
	}

	withQuery(query: string): this {
		this.options = { ...this.options, query };
		return this;
	}

	/**
	 * Ignore these top-level keys in the response body when comparing.
	 * Useful for non-deterministic values like `serverTime`.
	 */
	ignoringFields(...fields: string[]): this {
		this.options = {
			...this.options,
			ignoreFields: [...(this.options.ignoreFields ?? []), ...fields],
		};
		return this;
	}

	/**
	 * Fire the request at both /api/v1 and /api/v1mongo and return the raw
	 * results without asserting anything. Useful when you need to inspect the
	 * responses before deciding what to assert.
	 */
	async fetch(): Promise<ParityResult> {
		const { baseUrl } = this.clientOptions;
		const { body, query = "", ignoreFields: _ignore } = this.options;

		const mergedHeaders = {
			...this.clientOptions.headers,
			...this.options.headers,
		};

		const suffix = `${this.path}${query}`;

		const [v1, v1mongo] = await Promise.all([
			fireRequest(`${baseUrl}/api/v1${suffix}`, this.method, mergedHeaders, body),
			fireRequest(`${baseUrl}/api/v1mongo${suffix}`, this.method, mergedHeaders, body),
		]);

		return { v1, v1mongo };
	}

	/**
	 * Fire the request at both /api/v1 and /api/v1mongo and assert that the
	 * status codes and response bodies are identical.
	 *
	 * Throws (via vitest's `expect`) if they differ.
	 */
	async check(): Promise<ParityResult> {
		const result = await this.fetch();
		const { ignoreFields = [] } = this.options;

		const suffix = `${this.path}${this.options.query ?? ""}`;

		expect(result.v1.status, `${this.method} ${suffix} — status code mismatch`).toEqual(
			result.v1mongo.status,
		);

		expect(
			stripFields(result.v1.body, ignoreFields),
			`${this.method} ${suffix} — response body mismatch`,
		).toEqual(stripFields(result.v1mongo.body, ignoreFields));

		return result;
	}
}

export class ParityClient {
	private readonly options: ParityClientOptions;

	constructor(options: ParityClientOptions) {
		this.options = options;
	}

	private request(method: HttpMethod, path: string, options?: RequestOptions): ParityRequest {
		return new ParityRequest(this.options, method, path, options);
	}

	get(path: string, options?: RequestOptions): ParityRequest {
		return this.request("GET", path, options);
	}

	post(path: string, options?: RequestOptions): ParityRequest {
		return this.request("POST", path, options);
	}

	put(path: string, options?: RequestOptions): ParityRequest {
		return this.request("PUT", path, options);
	}

	patch(path: string, options?: RequestOptions): ParityRequest {
		return this.request("PATCH", path, options);
	}

	delete(path: string, options?: RequestOptions): ParityRequest {
		return this.request("DELETE", path, options);
	}
}

/**
 * Create a parity client pointed at a running Tachi server.
 *
 * @example
 * const api = createParityClient({ baseUrl: "http://localhost:8080" });
 *
 * // With default auth:
 * const authedApi = createParityClient({
 *   baseUrl: "http://localhost:8080",
 *   headers: { Authorization: "Bearer my-api-token" },
 * });
 */
export function createParityClient(options: ParityClientOptions): ParityClient {
	return new ParityClient(options);
}
