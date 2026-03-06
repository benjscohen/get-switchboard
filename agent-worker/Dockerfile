FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
