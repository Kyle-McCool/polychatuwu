# Playwright base image ships Chromium + all system deps preinstalled, so the
# Kick Cloudflare-bypass and X scraper work in production. Image version MUST
# match the `playwright` npm version (1.60.0).
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app
ENV NODE_ENV=production

# install deps (tsx + ws + playwright are runtime deps)
COPY package.json ./
RUN npm install --omit=dev

COPY . .

# Railway/Render inject PORT; the server reads process.env.PORT
EXPOSE 8787
CMD ["npm", "start"]
