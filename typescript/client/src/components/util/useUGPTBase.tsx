import { type UGPT } from "#types/react";
import { useMemo } from "react";

export default function useUGPTBase({ reqUser, game }: UGPT) {
	return useMemo(() => `/u/${reqUser.username}/games/${game}`, [reqUser, game]);
}
