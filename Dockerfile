FROM node:lts-slim

WORKDIR /app

COPY package*.json /app/

RUN npm install

COPY keys.json /app/
COPY bot.js /app/
COPY nfetch.js /app/

CMD [ "node", "/app/bot.js" ]
