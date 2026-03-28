FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Port is usually 8080 for Cloud Run, but grammy polling doesn't strictly need a port.
# However, Cloud Run requires a listening port.
EXPOSE 8080

CMD ["npm", "start"]
