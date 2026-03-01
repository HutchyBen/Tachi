import { FormatScoreRating } from "#util/misc";
import React from "react";
import { type PBScoreDocument, type ScoreDocument } from "tachi-common";

export default function RatingCell({
	score,
	rating,
}: {
	rating: keyof ScoreDocument["calculatedData"];
	score: PBScoreDocument | ScoreDocument;
}) {
	const value = score.calculatedData[rating];

	return <td>{FormatScoreRating(score.game, score.playtype, rating, value)}</td>;
}
