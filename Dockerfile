FROM node:lts-slim

WORKDIR /app

COPY . /app/

RUN npm install

RUN npm run build

CMD [ "node", "/app/dist/index.js" ]
