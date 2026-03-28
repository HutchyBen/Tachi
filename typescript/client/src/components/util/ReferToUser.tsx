import { UserContext } from "#context/UserContext";
import React, { useContext } from "react";
import { type MONGO_UserDocument } from "tachi-common";

export default function ReferToUser({ reqUser }: { reqUser: MONGO_UserDocument }) {
	const { user } = useContext(UserContext);

	return <>{user?.id === reqUser.id ? "You have" : `${reqUser.username} has`}</>;
}
