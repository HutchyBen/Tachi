- Got rid of "UserAuthLevel" **MOD** as it is unused _everywhere_.
- "api_token.token" is no longer nullable in DB
- All timestamps are becoming ISO8601 (TIMESTAMPTZ)
- "Service" tables are now called "svc_xxx" or "priv_svc_xxx" to indicate they are not really a tachi-ism
- Tables like "password-reset-codes" are renamed to "token" instead of "code" to be less ambiguous
- "fer-settings" has had its "cards" field split into a separate table that you must join against
- nested fields like socialmedia and userprefs have became individual columns on the database e.g. `sm_discord`, `pf_developer_mode`.


- Games are now the "unit of game" instead of the game+playtype nonsense that has pervaded tachi for nearly 6 years.

Everyone has had to put up with this needless complexity for a
long time because that's how the design just shook out when I was
writing Tachi 1 (and I didn't have the guts to change it in 2).
"Games" have only ever shared song data, and basically everything
has occured on a game+playtype combo. Changing this to just be
one thing will be unbelievably important, and will get rid of the
stupid "-Single" suffix needed allthroughout tachi.

This is a huge fucking change and will require thousands of lines
of code changes, but whatever. Break everything at the same time
you lunatic?

- "songs" are now one table instead of split across N tables

This was always a bad idea and moves query-level logic to
typescript-level logic and generally Just Fucking Sucks.
One major changes as a result of this is that song IDs are no
longer integers but instead long UUIDs. There is probably a way
of shortening this, same with chartID?

- Folder queries are just sql queries after the "WHERE" i.e. "WHERE $x"
- Got rid of "folder_chart_lookup" as the pre-caching isn't needed anymore, right?

- renamed "classOldValue" to "class_prev_value" in class_achievement

- got rid of "gptStrings" on imports (never used for anything ever)

- UserAuthLevel enum is now all lowercase

- "Appended" | "Created" in importdocument.sessions is now lowercase

(In general, enums have been kebabcased)

- "old" has been renamed to prev on importdocument.classAchievements

- no "isPrimary" on scores ???

- Lots of things are now part of the parent "Import" document instead of being copied to each score
