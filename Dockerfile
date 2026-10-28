# The ad-room server (server/main.ts) for Cloud Run. The site itself is deployed by Vercel.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_PUBLIC_DATA_SOURCE=firebase
COPY package.json package-lock.json ./
# tsx runs the TypeScript sources directly, so dev dependencies are needed.
RUN npm ci --include=dev --ignore-scripts && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY server ./server
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/main.ts"]
