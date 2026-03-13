import { log } from "#lib/logger/log.js";
import supertest from "supertest";

import server from "../server/server";

log.verbose("Creating Mock Server Connection...");
const connection = server.listen();

log.verbose("Connecting to Supertest...");
const mockApi = supertest(connection);

export function CloseServerConnection() {
	return new Promise<void>((resolve, reject) => {
		connection.close((err) => {
			if (err) {
				reject(err);
				return;
			}

			resolve();
		});
	});
}

export default mockApi;
