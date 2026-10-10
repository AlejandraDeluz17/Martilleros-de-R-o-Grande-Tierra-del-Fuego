FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN bun install --production
COPY src ./src
COPY public ./public
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
