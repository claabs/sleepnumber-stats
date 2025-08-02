# SleepNumber Stats


A Node.js/TypeScript application for collecting and storing SleepNumber bed statistics in InfluxDB and sending data to Android Health Connect.

## Features

- Collects nightly sleep data from SleepNumber API
- Stores data in InfluxDB
- Optionally sends sleep sessions to Android Health Connect


## Quick Start (Docker)

### Docker Run Example

```sh
docker run --rm --init \
  -v $(pwd)/config:/app/config \
  -e TZ=America/New_York \
  -e CONFIG_PATH=/app/config \
  ghcr.io/claabs/sleepnumber-stats
```

### Docker Compose Example

```yaml
services:
  sleepnumber-stats:
    image: ghcr.io/claabs/sleepnumber-stats
    init: true
    environment:
      TZ: "America/New_York"
    volumes:
      - ./config:/app/config
    restart: unless-stopped
```

## Configuration

All application configuration is provided via a `config.json` file. The optionaly environment variables are:

- `TZ`: Set this to your desired timezone (e.g., `America/New_York`, `UTC`, `Europe/London`). Default is UTC if not set.
- `CONFIG_PATH`: Path to the configuration directory containing `config.json`. Default is `/app/config`.

### Persistent Data

- The `/app/config` volume stores authentication tokens and should be mounted to retain login state between runs.

### Configuration Reference

| Key                 | Description                                           | Default    | Example                |
|---------------------|-------------------------------------------------------|------------|------------------------|
| sleepNumberEmail    | SleepNumber account email                             | (required) | "your@email.com"       |
| sleepNumberPassword | SleepNumber account password                          | (required) | "yourpassword"         |
| influxdbUrl         | InfluxDB server URL                                   | (required) | "http://influxdb:8086" |
| influxdbToken       | InfluxDB API token                                    | (required) | "your-influxdb-token"  |
| influxdbOrg         | InfluxDB organization name                            | (required) | "your-org"             |
| influxdbBucket      | InfluxDB bucket name                                  | (required) | "your-bucket"          |
| emptyBucket         | If true, deletes all data in the bucket before ingest | false      | false                  |
| tz                  | Timezone for scheduling                               | "UTC"      | "America/New_York"     |
| logLevel            | Pino logger level (trace, debug, info, etc.)          | "info"     | "debug"                |
| healthConnect       | Health Connect user map (see below)                   | (optional) | {"user1": {...}}       |

### Example config.json

```json
{
  "sleepNumberEmail": "your@email.com",
  "sleepNumberPassword": "yourpassword",
  "influxdbUrl": "http://influxdb:8086",
  "influxdbToken": "your-influxdb-token",
  "influxdbOrg": "your-org",
  "influxdbBucket": "your-bucket",
  "emptyBucket": false,
  "tz": "America/New_York",
  "logLevel": "info"
}
```

#### Optional: Health Connect Integration

To enable Android Health Connect integration, add a `healthConnect` object to your config. The key is your sleeper ID, which can be found in the logs:

```json
{
  ...existing config fields...
  "healthConnect": {
    "-9123456789123456789": { "username": "user1", "password": "pass1" },
  }
}
```

This project uses HCGateway to send data to your phone. You can find details at the [HCGateway project page](https://github.com/ShuchirJ/HCGateway). It will automatically create an account on first login, which you will use to login on the HCGateway Android app.

