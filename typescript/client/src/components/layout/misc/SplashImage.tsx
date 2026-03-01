import { TachiConfig } from "#lib/config";
import { ToCDNURL } from "#util/api";
import React from "react";

export default function SplashImage() {
	return (
		<img
			alt={TachiConfig.NAME}
			src={ToCDNURL("/logos/logo-wordmark.png")}
			style={{ maxWidth: "50%" }}
			width="256px"
		/>
	);
}
