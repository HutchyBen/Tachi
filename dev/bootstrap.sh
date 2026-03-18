#!/bin/bash
# moves example .env files, generates certificates, etc.

set -eo pipefail

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

FORCE=0

while getopts "f" opt; do
	case $opt in
		f)
			FORCE=1
			;;
		*)
			echo "Invalid option: -$opt"
			exit 1
	esac
done

cd "$SCRIPT_DIR";
cd ..;

function setupShell {
	echo "Setting up fish..."
	fish dev/setup.fish
}

function mvExampleFiles {
	echo "Moving example config files into usable places..."

	cp --update=none typescript/client/example/.env typescript/client/.env

	cp --update=none typescript/server/example/conf.json5 typescript/server/conf.json5
	cp --update=none typescript/server/example/.env typescript/server/.env

	mkdir -p typescript/server/local-cdn
	cp -r --update=none typescript/server/example/default-cdn-contents/* typescript/server/local-cdn

	cp --update=none typescript/bot/example/conf.json5 typescript/bot/conf.json5
	cp --update=none typescript/bot/example/example.env typescript/bot/.env

	echo "Moved!"
}

function selfSignHTTPS {
	if [ -e typescript/server/cert/key.pem ] && [ -e typescript/server/cert/cert.pem ] && openssl x509 -checkend 0 -noout -in typescript/server/cert/cert.pem; then
		echo "HTTPS Certificates for local-dev server already exists and has not expired."
		return 0
	fi

	echo "Self-Signing HTTPS Certificates for local-dev server..."

	# This is for dev servers only! You should use this to
	# create a self-signed HTTPS certificate for local dev.
	# That is it. This is not secure.
	mkdir -p typescript/server/cert

	openssl req -x509 -newkey rsa:4096 -keyout typescript/server/cert/key.pem -out typescript/server/cert/cert.pem -sha256 -days 365 -nodes -subj "/C=AU/ST=TachiExample/L=TachiExample/O=TachiExample/CN=127.0.0.1" &> /dev/null

	echo "Created HTTPS Certificates!"
}

function bunInstall {
	echo "Installing dependencies..."

	if ! command -v bun &> /dev/null
	then
		echo "Couldn't find bun. Can't install dependencies. Install it from https://bun.sh."
		exit 1
	fi

	bun install

	echo "Installed dependencies."
}

function syncDatabaseWithSeeds {
	echo "Syncing database with seeds..."

	# TODO(zk)
	echo "[DISABLED] FOR NOW"
	return 0; 

	(
		cd typescript/server

		bun run load-seeds
	)

	echo "Synced."
}

# always setup the shell
setupShell
mvExampleFiles
selfSignHTTPS
bunInstall

if [ -e _SETUP_OK ] && [ $FORCE -eq 0 ]; then
	echo "Already bootstrapped."
	exit 0
fi

syncDatabaseWithSeeds

echo "Bootstrap Complete."

cat << EOF > _SETUP_OK
Tachi(v3) was setup here on $(date).

The existence of this file stops Tachi from running a setup again.
There's nothing harmful about this -- you can setup as much as you want!
We just don't want to necessarily setup *each* time we boot Tachi.

To setup again (in case you think something has gone wrong)
run 'just setup'.
EOF
