#!/bin/bash
# Just a quick script so I can remember to build / upload to cloudflare pages

set -euxo pipefail

pnpm run build

pnpm exec wrangler deploy --assets=./.svelte-kit/cloudflare/
