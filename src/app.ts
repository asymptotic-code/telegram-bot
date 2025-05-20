import TelegramBot from 'node-telegram-bot-api';
import { botMain } from './main';
import knex from 'knex';
import fs from 'fs';

export const telegramApp = (): void => {
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

    botMain(bot, knexdb);
  } catch (e) {
    console.warn(`Telegram error: ${e}`);
  }
};
