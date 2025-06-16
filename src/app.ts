import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import TelegramBot from 'node-telegram-bot-api';
import { botMain } from './main';
import knex from 'knex';
import fs from 'fs';

export const telegramApp = async (): Promise<void> => {
  try {
    const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

    const knexdb = knex({
      client: 'pg',
      connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT),
        ssl: {
          rejectUnauthorized: true,
          ca: fs.readFileSync('ca-certificate.crt').toString(),
        },
      }
    });

    const client = new Client(
      {
        name: "example-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );

    const transport = new StreamableHTTPClientTransport(
      new URL(process.env.MCP_SERVER_URL),
    );

    await client.connect(transport);

    botMain(bot, knexdb, client);
  } catch (e) {
    console.warn(`Telegram error: ${e}`);
  }
};
