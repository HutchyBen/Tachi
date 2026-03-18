import "Justfile-gen"
import "Justfile-apps"
import "Justfile-db"
import "Justfile-misc"
import "Justfile-migrate"
import "Justfile-test"
import "Justfile-dataset"
import "Justfile-repo"

[private]
interactive:
	-@just --choose
