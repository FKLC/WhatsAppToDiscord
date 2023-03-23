# syntax=docker/dockerfile:1

FROM node:16-alpine
COPY . .
RUN npm i
CMD ["node", "src/index.js"]
