# Caddy with the replace-response plugin.
#
# The stock caddy image can reverse-proxy TeddyCloud but cannot rewrite the response
# body. We need to insert a <link> + <script> before </head> of TeddyCloud's index.html
# so the Colada Builds theme loads over the stock UI (TeddyCloud has no custom-CSS hook
# of its own). The replace-response plugin adds that one capability; everything else is
# unchanged from the official image.
#
# Built automatically by `docker compose build caddy` (deploy.sh runs `up --build`).
FROM caddy:2-builder-alpine AS build
RUN xcaddy build --with github.com/caddyserver/replace-response

FROM caddy:2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
