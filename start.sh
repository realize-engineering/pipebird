#!/bin/bash

if [ ! -f .env ]
then
    printenv > .env
fi

npx prisma migrate deploy
npx prisma db push
npm start
