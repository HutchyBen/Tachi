import Card from "#components/layout/page/Card";
import ExternalLink from "#components/util/ExternalLink";
import Icon from "#components/util/Icon";
import useApiQuery from "#components/util/query/useApiQuery";
import { TachiConfig } from "#lib/config";
import { ONE_DAY } from "#util/constants/time";
import React, { useEffect, useState } from "react";
import { type integer, type MONGO_UserDocument } from "tachi-common";

export default function SupportBanner({ user }: { user: MONGO_UserDocument }) {
	const { data, error } = useApiQuery<{ scores: integer; sessions: integer }>(
		`/users/${user.id}/stats`,
	);

	const [show, setShow] = useState(localStorage.getItem("SHOW_SUPPORT_TACHI") === "true");

	useEffect(() => {
		localStorage.setItem("SHOW_SUPPORT_TACHI", `${show}`);
	}, [show]);

	// thank you
	if (user.isSupporter) {
		return (
			<div className="d-flex w-100 justify-content-center flex-column align-items-center">
				<div>❤️❤️❤️ Thank you for supporting {TachiConfig.NAME}. ❤️❤️❤️</div>
			</div>
		);
	}

	if (!data) {
		return <></>;
	}

	if (error) {
		return <></>;
	}

	if (data.scores < 1_000) {
		return <></>;
	}

	// too soon to bother
	if (Date.now() - user.joinDate < ONE_DAY * 7) {
		return <></>;
	}

	if (!show) {
		return (
			<div
				className="d-flex w-100 justify-content-center flex-column align-items-center"
				onClick={() => setShow(true)}
			>
				<div>Support us? ❤️</div>
				<div>
					<Icon type="chevron-down" />
				</div>
			</div>
		);
	}

	return (
		<Card
			className="mb-8"
			footer={
				<div className="d-flex w-100 justify-content-center" onClick={() => setShow(false)}>
					<Icon type="chevron-up" />
				</div>
			}
			header={
				<span style={{ fontSize: "1.55rem" }}>
					You've set {data.scores} scores and had {data.sessions} sessions, wew!
				</span>
			}
		>
			<span style={{ fontSize: "1.15rem" }}>
				{TachiConfig.NAME} is a passion project, and is primarily developed by one person.
				<br />
				Since you're enjoying the site so much, maybe you'd want to support me? :3
				<br />
				<br />
				If you want to support development, you can donate to my{" "}
				<ExternalLink href="https://ko-fi.com/zkrising">Ko-Fi</ExternalLink>, if you
				indicate your account name in the donation, you'll get a shiny name on the site!
				<br />
				I'm working on some new projects in secret. Maybe I'll post some updates on there :P
				<br />
				<br />
				Alternatively, you can star or contribute to the fully-open-source{" "}
				<ExternalLink href="https://github.com/zkldi/Tachi">GitHub Repo</ExternalLink>. This
				makes me look cool to employers!
			</span>
		</Card>
	);
}
