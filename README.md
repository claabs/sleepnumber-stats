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
  -p 3000:3000 \
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
    ports:
      - 3000:3000 # optional, for Fitbit setup
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

| Key                 | Description                                              | Default     | Example                              |
|---------------------|----------------------------------------------------------|-------------|--------------------------------------|
| sleepNumberEmail    | SleepNumber account email                                | (required)  | "your@email.com"                     |
| sleepNumberPassword | SleepNumber account password                             | (required)  | "yourpassword"                       |
| influxdbUrl         | InfluxDB server URL                                      | (required)  | "http://influxdb:8086"               |
| influxdbToken       | InfluxDB API token                                       | (required)  | "your-influxdb-token"                |
| influxdbOrg         | InfluxDB organization name                               | (required)  | "your-org"                           |
| influxdbBucket      | InfluxDB bucket name                                     | (required)  | "your-bucket"                        |
| emptyBucket         | If true, deletes all data in the bucket before ingest    | false       | false                                |
| tz                  | Timezone for scheduling                                  | "UTC"       | "America/New_York"                   |
| logLevel            | Pino logger level (trace, debug, info, etc.)             | "info"      | "debug"                              |
| fitbitRedirectUri   | Public HTTPS callback URL for Fitbit OAuth2              | (optional)  | "https://sleep.example.com/callback" |
| fitbitClientId      | Fitbit developer app client ID                           | (optional)  | "12ABCD"                             |
| fitbitClientSecret  | Fitbit developer app client secret                       | (optional)  | "abcdef1234567890abcdef1234567890"   |
| port                | Port for the web server (Fitbit setup)                   | 3000        | 3001                                 |
| runOnStartup        | When true, the container runs immediately on startup     | false       | true                                 |
| runOnce             | When true, the container runs once and does not schedule | false       | true                                 |
| schedule            | Cron syntax schedule for when the job should run         | 15 10 * * * | 0 12 * * *                           |

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

#### Optional: Fitbit Integration

To enable the Fitbit reporting of sleep data to your Fitbit account (for syncing to your phone):

1. Setup an HTTPS domain reverse proxied to your container
1. Create a Fitbit developer application:
    1. Create an app [on the Fitbit dev portal](https://dev.fitbit.com/apps/new)
    1. Set **OAuth 2.0 Application Type** to `Personal` if only you are using it, or `Server` if accounts other than the developer's account will connect
    1. Set **Redirect URL** to your HTTPS URL set in the config `fitbitBaseUrl`
    1. Set **Default Access Type** to `Read & Write`
1. Add the Fitbit options to your config:

    ```json
    {
      ...existing config fields...
      "fitbitRedirectUri": "https://sleep.example.com/callback",
      "fitbitClientId": "12ABCD",
      "fitbitClientSecret": "abcdef1234567890abcdef1234567890"
    }
    ```

1. Open a terminal inside your running container and run `./setup.sh`:

    ```sh
    docker exec -it sleepnumber-stats sh
    ./setup.sh
    ```

1. Navigate to `/register` (e.g. `https://sleep.example.com/register`)
1. Click the sleeper you'd like to associate with your Fitbit account and follow the Fitbit linking steps
1. CTRL-C in the terminal to exit the setup application
1. The Fitbit data will be uploaded on your next scheduled run. You should see your Fitbit refresh token in `/app/config/tokens.json`.
