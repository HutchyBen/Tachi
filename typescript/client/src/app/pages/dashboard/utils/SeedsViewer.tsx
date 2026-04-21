import { useEffect } from "react";

const SEEDS_URL = import.meta.env.VITE_SEEDS_URL as string | undefined;

export default function SeedsViewer() {
	useEffect(() => {
		if (SEEDS_URL) {
			window.location.replace(SEEDS_URL);
		}
	}, []);

	return null;
}
