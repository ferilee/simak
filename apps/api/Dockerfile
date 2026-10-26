# API berjalan di atas Bun (runtime); npm tetap pengelola paket monorepo di mesin pengembangan.
FROM oven/bun:1
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN bun install
COPY apps/api apps/api
COPY packages packages
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["bun", "run", "src/index.ts"]
