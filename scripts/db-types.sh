#!/usr/bin/env bash
set -euo pipefail
temporary_file=$(mktemp lib/supabase/database.types.XXXXXX)
trap 'rm -f "$temporary_file"' EXIT
supabase gen types typescript --local --schema public > "$temporary_file"
mv "$temporary_file" lib/supabase/database.types.ts
