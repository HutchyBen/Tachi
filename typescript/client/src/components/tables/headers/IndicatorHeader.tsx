import { type FolderDataset, type PBDataset, type ScoreDataset } from "#types/tables";
import { NumericSOV } from "#util/sorts";
import React from "react";
import { type MONGO_PBScoreDocument, type MONGO_ScoreDocument } from "tachi-common";

import { type Header } from "../components/TachiTable";

const IndicatorHeader: Header<PBDataset[0] | ScoreDataset[0]> = [
	"Indicators",
	"Id.",
	NumericSOV<MONGO_PBScoreDocument | MONGO_ScoreDocument>((x) => Number(x.highlight)),
	() => <td style={{ maxWidth: 5, padding: 0 }}></td>,
];

export const FolderIndicatorHeader: Header<FolderDataset[0]> = [
	"Indicators",
	"Id.",
	NumericSOV<FolderDataset[0]>((x) => Number(x.__related.pb?.highlight)),
	() => <td style={{ maxWidth: 5, padding: 0 }}></td>,
];

export const EmptyHeader: Header<unknown> = ["Empty", "Empty", null, () => <td />];

export default IndicatorHeader;
