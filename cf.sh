#!/bin/sh
# Just a quick script so I can remember to build / upload to cloudflare pages

pnpm run build

pnpm exec wrangler deploy --assets=./.svelte-kit/cloudflare/
