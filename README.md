# SleepNumber Stats

A Node.js/TypeScript application for collecting and storing SleepNumber bed statistics in InfluxDB.

## Features
- Collects nightly sleep data from SleepNumber API
- Stores data in InfluxDB

## Quick Start (Docker)

### Docker Run Example
```sh
docker run --rm --init \
  -v $(pwd)/config:/app/config \
  -e SLEEP_NUMBER_EMAIL=your@email.com \
  -e SLEEP_NUMBER_PASSWORD=yourpassword \
  -e INFLUXDB_URL=http://influxdb:8086 \
  -e INFLUXDB_TOKEN=your-influxdb-token \
  -e INFLUXDB_BUCKET=your-bucket \
  -e INFLUXDB_ORG=your-org \
  -e EMPTY_BUCKET=false \
  -e TZ=America/New_York \
  ghcr.io/claabs/sleepnumber-stats
```

### Docker Compose Example
```yaml
services:
  sleepnumber-stats:
    image: ghcr.io/claabs/sleepnumber-stats
    init: true
    environment:
      SLEEP_NUMBER_EMAIL: "your@email.com"
      SLEEP_NUMBER_PASSWORD: "yourpassword"
      INFLUXDB_URL: "http://influxdb:8086"
      INFLUXDB_TOKEN: "your-influxdb-token"
      INFLUXDB_BUCKET: "your-bucket"
      INFLUXDB_ORG: "your-org"
      EMPTY_BUCKET: "false"
      TZ: "America/New_York"
    volumes:
      - ./config:/app/config
    restart: unless-stopped
```

## Scheduling & Timezone
This container uses cron to schedule the program to run once a day at 10:15 AM according to the timezone set by the `TZ` environment variable. The app also runs immediately at container startup, then continues to run daily at the scheduled time.

- **TZ**: Set this to your desired timezone (e.g., `America/New_York`, `UTC`, `Europe/London`).
- The default is UTC if not set.

## Environment Variables
| Variable              | Description                                             | Required | Default |
|-----------------------|---------------------------------------------------------|----------|---------|
| SLEEP_NUMBER_EMAIL    | SleepNumber account email                               | Yes      |         |
| SLEEP_NUMBER_PASSWORD | SleepNumber account password                            | Yes      |         |
| INFLUXDB_URL          | InfluxDB server URL                                     | Yes      |         |
| INFLUXDB_TOKEN        | InfluxDB API token                                      | Yes      |         |
| INFLUXDB_BUCKET       | InfluxDB bucket name                                    | Yes      |         |
| INFLUXDB_ORG          | InfluxDB organization name                              | Yes      |         |
| EMPTY_BUCKET          | If 'true', deletes all data in the bucket before ingest | No       | false   |
| LOG_LEVEL             | Pino logger level (trace, debug, info, etc.)            | No       | info    |
| TZ                    | Timezone for scheduling (e.g., America/New_York)        | No       | UTC     |

## Persistent Data
- The `/app/config` volume stores authentication tokens and should be mounted to retain login state between runs.

