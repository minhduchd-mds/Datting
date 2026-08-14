FROM node:24-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY test ./test
RUN npx tsc -p tsconfig.json && node --test dist/test/*.test.js

FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "dist/src/index.js"]
