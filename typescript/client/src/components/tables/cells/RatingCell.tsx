import { FormatScoreRating } from "#util/misc";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

export default function RatingCell({
	score,
	rating,
}: {
	rating: keyof MONGO_ScoreDocument["calculatedData"];
	score: MONGO_PBScoreDocument | MONGO_ScoreDocument;
}) {
	const value = score.calculatedData[rating];

	return <td>{FormatScoreRating(score.game, score.playtype, rating, value)}</td>;
}
