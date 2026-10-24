FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb* ./

RUN bun install

COPY . .

# Generate the Prisma Client inside the supported Linux container environment.
RUN bunx prisma generate

EXPOSE 3000

CMD ["bun", "src/index.ts"]
