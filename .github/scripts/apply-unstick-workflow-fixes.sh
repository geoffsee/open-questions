#!/usr/bin/env bash
# Applies pending unstick workflow fixes. Requires a token with `workflows` scope
# (GITHUB_TOKEN from Actions has this; fine-grained PATs need Workflows: Read and write).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
templates="$root/.github/scripts/unstick-workflow-templates"
for name in dependabot-auto-merge update-outdated-prs nightly supervisor; do
  cp "$templates/$name.yml" "$root/.github/workflows/$name.yml"
done
echo "Copied unstick workflow templates into .github/workflows/"
