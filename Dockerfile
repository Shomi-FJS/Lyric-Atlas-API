FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

EXPOSE 3000 8300

CMD ["node", "dist/server.js"]
