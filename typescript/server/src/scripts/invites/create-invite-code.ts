import { log } from "#lib/log/log";
import MONGODB_KILL from "#services/mongo/db";
import { Random20Hex } from "#utils/misc";
import { Command } from "commander";

const program = new Command();

program.option("-c, --code <code>", "The code for this invite.");

program.parse(process.argv);
const options = program.opts();

if (options.code === undefined) {
	options.code = Random20Hex();
}

const code = options.code as string;

MONGODB_KILL.invites
	.insert({
		code,
		createdBy: 1,
		consumed: false,
		createdAt: Date.now(),
		consumedBy: null,
		consumedAt: null,
	})
	.then(() => {
		log.info(() => {
			process.exit(0);
		}, `Created invite ${code}.`);
	})
	.catch((err: unknown) => {
		log.error({ err }, `Failed to create invite ${code}`);
	});
