import ProfilePicture from "#components/user/ProfilePicture";
import { type GamePT, type JustChildren } from "#types/react";
import React from "react";
import { Link } from "react-router-dom";
import { type UserDocument } from "tachi-common";

export default function UserIcon({
	user,
	children,
	game,
	playtype,
}: { user: UserDocument } & Partial<GamePT> & Partial<JustChildren>) {
	return (
		<div className="text-center p-8">
			<ProfilePicture toGPT={game && playtype ? { game, playtype } : undefined} user={user} />
			<h4 className="mt-2">
				<Link
					to={
						game && playtype
							? `/u/${user.username}/games/${game}/${playtype}`
							: `/u/${user.username}`
					}
				>
					{user.username}
				</Link>
			</h4>
			{children && <div className="d-flex justify-content-center">{children}</div>}
		</div>
	);
}
