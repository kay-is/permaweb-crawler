# Permaweb Crawler

A Node.js-based server that crawls websites on the Permaweb via ArNS names and publishes the results as Parquet files on Arweave.

## Quickstart

1. Install all dependencies:

   ```
   npm i
   ```

2. Create a `wallet.json` with an Arweave JWK wallet. The wallet needs $AR for bigger uploads (>100KB), but only crawling a few pages should work without tokens.

3. Ensure port `3000` is available and start the crawler:

   ```
   npm run dev
   ```

4. Open http://localhost:3000/app/ in a browser to start a crawl.

5. Start a crawl by entering an ArNS name (e.g., docs).

6. Download the Parquet files from Arweave.

## Docker

1. Build the container image:

   ```
   npm run docker:build
   ```

2. Run the container image:

   ```
   npm run docker:start
   ```

## Configuration

The crawler uses environment variables for configuration.

- `LOG_LEVEL`

  The detail level of the logs.

  Takes `debug`, `info`, `warn`, or `error`. Default is `info`.

- `PORT`

  The port of the webserver.

  Takes a number. Default is `3000`.

- `WALLET_PATH`

  The path to the Arweave JWK wallet used for Parquet file uploads.

  Takes a string. Default is `./wallet.json`.

- `FALLBACK_GATEWAY`

  The gateway used to download a HTML page when a network gateway failed.

  Takes a string. Default is `permagate.io`.

- `MAX_TASKS`

  The number of tasks (finished or not) to keep around.

  Takes a number. Default is `100`.

## API Endpoints

- GET `/tasks/`

  Returns [a list of tasks](/modules/entities.ts#30) the crawler handled or will be handling.

- POST `/tasks/`

  Creates a new task.

  Takes a JSON objcet with [the task config options](/modules/entities.ts#30).
