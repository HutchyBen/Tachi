import MONGODB_KILL from "#services/mongo/db";

export async function GetBlacklist() {
	return (await MONGODB_KILL["score-blacklist"].find({}, { projection: { scoreID: 1 } })).map(
		(e) => e.scoreID,
	);
}
