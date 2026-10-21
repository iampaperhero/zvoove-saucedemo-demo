# The pinned Playwright's image: its browsers match the client, WebKit included (ADR 0004).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

# The tests write reports next to the sources.
WORKDIR /app

# WORKDIR is root-owned; the tests run as pwuser.
RUN chown pwuser:pwuser /app

# Dependencies first, so the layer is reused when only the tests change.
COPY --chown=pwuser:pwuser package.json package-lock.json ./

# Exactly what the lock file pins.
RUN npm ci

COPY --chown=pwuser:pwuser . .

# Not root: root needs --no-sandbox.
USER pwuser

# The config's CI settings: one worker, no test.only.
ENV CI=true

# Chromium, both users; run with --env-file .env, and -e BROWSER=all for every browser.
CMD ["npx", "playwright", "test"]
