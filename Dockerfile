FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY config ./config
COPY examples ./examples
USER node
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["report", "examples/employee-onboarding.yaml", "examples/invoice.yaml", "examples/sales-proposal.yaml", "examples/support-triage.yaml", "--out", "/tmp/report"]
