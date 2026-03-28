import SupporterIcon from "#components/util/SupporterIcon";
import { type GamePT } from "#types/react";
import { ToAPIURL } from "#util/api";
import React from "react";
import { Link } from "react-router-dom";
import { type MONGO_UserDocument } from "tachi-common";

export default function UserCell({ user, game, playtype }: { user: MONGO_UserDocument } & GamePT) {
	return (
		<td
			className="fading-image-td-right"
			style={{
				backgroundRepeat: "no-repeat",
				backgroundSize: "cover",
				backgroundPosition: "center",
				["--image-url" as string]: `url(${ToAPIURL(`/users/${user.id}/pfp`)})`,
			}}
		>
			<Link
				className="text-decoration-none"
				to={`/u/${user.username}/games/${game}/${playtype}`}
			>
				{user.username}
				{user.isSupporter && (
					<>
						{" "}
						<SupporterIcon />
					</>
				)}
			</Link>
		</td>
	);
}
