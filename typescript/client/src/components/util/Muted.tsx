import { type JustChildren } from "#types/react";
import React from "react";

export default function Muted({ children }: JustChildren) {
	return <small className="text-body-secondary">{children}</small>;
}
