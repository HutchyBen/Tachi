import { TachiConfig } from "#lib/config";
import { ToCDNURL } from "#util/api";
import React from "react";

export default function SiteWordmark({
	width = "256px",
	...props
}: React.ImgHTMLAttributes<HTMLImageElement>) {
	return (
		<img
			alt={TachiConfig.NAME}
			src={ToCDNURL("/logos/logo-wordmark.png")}
			width={width}
			{...props}
		/>
	);
}
