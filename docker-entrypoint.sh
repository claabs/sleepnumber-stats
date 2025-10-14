#!/bin/sh

set -e

node --experimental-transform-types /app/src/entrypoint-config.ts

set -a
. "/app/.sleepnumber_env"
set +a

# If RUN_ON_STARTUP is set, run it once before setting up the schedule
echo "Run on startup: ${RUN_ON_STARTUP}"
if [ "$RUN_ON_STARTUP" = "true" ]; then
    node --experimental-transform-types /app/src/index.ts
fi

# If runOnce is not set, schedule the process
echo "Run once: ${RUN_ONCE}"
if [ "$RUN_ONCE" = "false" ]; then
    echo "Setting cron schedule as ${CRON_SCHEDULE}"
    # Add the command to the crontab
    echo "${CRON_SCHEDULE} node --experimental-transform-types /app/src/index.ts" >> $HOME/crontab
    # Run the cron process. The container should halt here and wait for the schedule.
    supercronic -no-reap -passthrough-logs $HOME/crontab
fi
echo "Exiting..."