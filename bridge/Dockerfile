FROM node:22-bookworm

WORKDIR /app

COPY package.json package.json
COPY tsconfig.json tsconfig.json
COPY src src

RUN corepack enable && pnpm install && pnpm build

EXPOSE 18080

CMD ["node", "dist/server.js"]
