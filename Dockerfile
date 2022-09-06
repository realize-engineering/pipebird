FROM node:16 AS build

WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build

FROM node:16-slim
WORKDIR /app
RUN apt-get update
RUN apt-get install -y openssl
COPY ./migrate.sh ./migrate.sh
COPY package.json ./package.json
COPY schema.prisma ./schema.prisma
COPY migrations ./migrations
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
ARG DATABASE_URL 
ENV DATABASE_URL $DATABASE_URL
RUN chmod +x ./migrate.sh
ENTRYPOINT ["./migrate.sh"]
