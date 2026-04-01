FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY server/ ./server/
COPY shared/ ./shared/
COPY client/ ./client/
EXPOSE 8080
CMD ["node", "server/index.js"]
