FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY index.js ./

ENV NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
