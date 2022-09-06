#!/bin/bash

if [ ! -f .env ]
then
    # Prisma expects a local .env file
    echo "DATABASE_URL=$(printenv DATABASE_URL)" > .env
    # TODO(cumason) refactor register_license.py -> register_license.ts and run as dockerfile build step
    # PUBLIC_KEY is set by register_license.py
    echo "PUBLIC_KEY=$(printenv PUBLIC_KEY)" >> .env 

fi

npx prisma migrate deploy
npx prisma db push
NODE_ENV="production" exec node dist/server/index.js
