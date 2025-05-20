import TelegramBot from 'node-telegram-bot-api';
import { Knex } from 'knex';
import { AuthService } from './services/auth';
import { AiService } from './services/ai';

export const botMain = (
  bot: TelegramBot,
  knex: Knex,
): void => {
  const authService = new AuthService(knex, bot);
  const aiService = new AiService(knex, bot);

  bot.on('message', async (msg) => {
    try {
      const text = msg.text;
      if (text?.startsWith('/')) return;
    
      await aiService.answer(msg);
    } catch (e) {
      console.warn(`Telegram unhandled error: ${e}`);
    }
  });

  bot.onText(/\/start/, authService.onStart);

  bot.onText(/\/help/, authService.onHelp);
  bot.onText(/\/about/, authService.onAbout);
  bot.onText(/\/history/, authService.onHistory);
};
