-- One MYT card integration row per account (upsert target for UPDATE_MYT_CARD_INFO).
ALTER TABLE "priv_svc_myt_card_info"
	ADD CONSTRAINT "priv_svc_myt_card_info_user_id_key" UNIQUE ("user_id");
