import ImportFileInfo from "#components/imports/ImportFileInfo";
import useSetSubheader from "#components/layout/header/useSetSubheader";
import { TachiConfig } from "#lib/config";
import { p } from "prudence";
import React from "react";
import {
	type BatchManual,
	FormatGame,
	FormatPrError,
	GetGameGroupConfig,
	LEGACY_GameGroupPTToGame,
} from "tachi-common";
import { PR_BATCH_MANUAL } from "tachi-common/lib/schemas";

export default function BatchManualPage() {
	useSetSubheader(["Dashboard", "Import Scores", "Batch Manual"]);

	return (
		<ImportFileInfo
			acceptMime="application/json"
			importType="file/batch-manual"
			name="Batch Manual"
			parseFunction={(text: string) => {
				const data: BatchManual = JSON.parse(text);

				const gameGroupConfig = GetGameGroupConfig(data.meta.game);

				if (!gameGroupConfig) {
					throw new Error(
						`Invalid game ${data.meta.game}. Expected any of ${TachiConfig.GAME_GROUPS}.`,
					);
				}

				if (!gameGroupConfig.playtypes.includes(data.meta.playtype as any)) {
					throw new Error(
						`Invalid Playtype ${data.meta.playtype}. Expected any of ${gameGroupConfig.playtypes}.`,
					);
				}

				const game = LEGACY_GameGroupPTToGame(data.meta.game, data.meta.playtype);

				const err = p(data, PR_BATCH_MANUAL(game));

				if (err) {
					throw new Error(FormatPrError(err, "Invalid BATCH-MANUAL: "));
				}

				return {
					valid: true,
					info: {
						Game: FormatGame(game),
						Scores: data.scores.length,
					},
				};
			}}
		/>
	);
}
