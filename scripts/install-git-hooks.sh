#!/usr/bin/env sh
set -e
root="$(git rev-parse --show-toplevel)"
src="$root/scripts/git-hooks/post-commit"
dst="$root/.git/hooks/post-commit"

if [ ! -f "$src" ]; then
  echo "Missing hook source: $src" >&2
  exit 1
fi

cp "$src" "$dst"
chmod +x "$dst"
echo "Installed post-commit hook -> $dst"
echo "Every local commit will auto-run: git push origin <current-branch>"
