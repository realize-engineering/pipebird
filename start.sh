#!/bin/bash

if [ ! -f .env ]
then
    # Prisma expects a local .env file
    echo "DATABASE_URL=$(printenv DATABASE_URL)" > .env
    # TODO(cumason) refactor register_license.py -> register_license.ts and run as dockerfile build step
    # PIPEBIRD_MONITOR_SECRET_KEY is set by register_license.py
    echo "PIPEBIRD_MONITOR_SECRET_KEY=$(printenv PIPEBIRD_MONITOR_SECRET_KEY)" >> .env 
fi

wait_for_temporal() {
    until nc -z temporal 7233; do
        echo 'API waiting for Temporal to startup.'
        sleep 1
    done
    echo 'Temporal ready.'
}

wait_for_postgresql() {
    until nc -z db 5432; do
        echo 'API waiting for psql to startup.'
        sleep 1
    done
    echo 'PostgreSQL ready.'
}

wait_for_temporal
wait_for_postgresql

npx prisma migrate deploy
npx prisma db push
npm run start:workers & 
NODE_ENV="production" exec node dist/server/index.js
