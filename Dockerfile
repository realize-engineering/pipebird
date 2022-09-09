FROM node:16 AS build

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

FROM node:16-slim
WORKDIR /app
RUN apt-get update
RUN apt-get install -y openssl
RUN apt-get install netcat -y
COPY ./start.sh ./start.sh
COPY package.json ./package.json
COPY schema.prisma ./schema.prisma
COPY migrations ./migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN chmod +x ./start.sh
CMD ["./start.sh"]
