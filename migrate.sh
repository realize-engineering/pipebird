#!/bin/bash

if [ ! -f .env ]
then
    # Prisma expects a local .env file
    echo $DATABASE_URL
    echo "DATABASE_URL=$(printenv DATABASE_URL)" >> .env
    source .env
fi
echo $DATABASE_URL
echo "$(cat .env)"
echo "$(ls)"
ls
echo printenv
echo "HELLO WORLD!"

npx prisma migrate deploy
npx prisma db push
