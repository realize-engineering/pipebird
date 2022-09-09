#!/bin/bash

if [ ! -f .env ]
then
    # Prisma expects a local .env file
    echo "DATABASE_URL=$(printenv DATABASE_URL)" > .env
    # TODO(cumason) refactor register_license.py -> register_license.ts and run as dockerfile build step
    # PIPEBIRD_MONITOR_SECRET_KEY is set by register_license.py
    echo "PIPEBIRD_MONITOR_SECRET_KEY=$(printenv PIPEBIRD_MONITOR_SECRET_KEY)" >> .env 

fi

npx prisma migrate deploy
npx prisma db push
npm run start:workers & 
NODE_ENV="production" exec node dist/server/index.js