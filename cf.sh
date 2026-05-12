#!/bin/sh
# Just a quick script so I can remember to build / upload to cloudflare pages

npm run build

npx wrangler deploy --assets=./.svelte-kit/cloudflare/
