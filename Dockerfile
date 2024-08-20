# For frontend
FROM node:lts-alpine


WORKDIR /app

COPY ./frontend/package*.json ./

RUN npm install

COPY ./frontend/. .

RUN npm run build
