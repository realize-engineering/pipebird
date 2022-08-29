#!/bin/bash

if [ ! -f .env ]
then
    # Prisma expects a local .env file
    echo "DATABASE_URL=$(printenv DATABASE_URL)" > .env
fi

npx prisma migrate deploy
npx prisma db push
npm start
