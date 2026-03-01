import { useProfileRatingAlg } from "#components/util/useScoreRatingAlg";
import { type GamePT } from "#types/react";
import { FormatGPTProfileRatingName } from "#util/misc";
import React from "react";
import { Link } from "react-router-dom";
import { type GPTString, type integer, type ProfileRatingAlgorithms } from "tachi-common";

export default function RankingData({
	rankingData,
	game,
	userID,
	playtype,
}: {
	rankingData: Record<ProfileRatingAlgorithms[GPTString], { outOf: integer; ranking: number }>;
	userID: integer;
} & GamePT) {
	const alg = useProfileRatingAlg(game, playtype);

	// weird react edge case where rankingData and alg desynchronise.
	if (!(alg in rankingData)) {
		return <>Loading...</>;
	}

	const extendData = [];

	for (const k in rankingData) {
		const key = k as ProfileRatingAlgorithms[GPTString];

		if (key !== alg) {
			extendData.push(
				<div className="col-12" key={key}>
					<small className="text-body-secondary">
						{FormatGPTProfileRatingName(game, playtype, key)}: #
						{rankingData[key].ranking}/{rankingData[key].outOf}
					</small>
				</div>,
			);
		}
	}

	return (
		<div className="row text-center">
			<div className="col-12">
				<h4>
					Ranking
					{extendData.length
						? ` (${FormatGPTProfileRatingName(game, playtype, alg)})`
						: ""}
				</h4>
			</div>
			<div className="col-12">
				<Link
					className="text-decoration-none"
					to={`/u/${userID}/games/${game}/${playtype}/leaderboard`}
				>
					<strong className="display-4">#{rankingData[alg].ranking}</strong>
				</Link>
				<span className="text-body-secondary">/{rankingData[alg].outOf}</span>
			</div>
			{extendData}
		</div>
	);
}

export function LazyRankingData({ ranking, outOf }: { outOf: integer; ranking: integer }) {
	return (
		<div className="row text-center">
			<div className="col-12">
				<h4>Ranking</h4>
			</div>
			<div className="col-12">
				<strong className="display-4">#{ranking}</strong>
				<span className="text-body-secondary">/{outOf}</span>
			</div>
		</div>
	);
}
