import { Knex } from "knex";
import TelegramBot, { Message } from "node-telegram-bot-api";
import { HelpText } from "../const";
import { createUser, getLastHistory, getUser, log } from "../db";
import { getIds } from "../utils";

export class AuthService {
  constructor(private knex: Knex, private bot: TelegramBot) {}

  public onStart = async (msg: Message) => {
    try {
      const { isGroup, userId, username, chatId } = getIds(msg);
      const user = await getUser(this.knex, userId);
      if (!user) {
        await createUser(this.knex, userId, username, isGroup);
        this.bot.sendMessage(chatId, `Welcome ${username || userId}! You have been registered.`);
      } else {
        this.bot.sendMessage(chatId, `Welcome back ${username || userId}! You are already registered.`);
      }
      await log(this.knex, userId, 'start', msg.text);
    } catch (e) {
      console.warn(`AuthService onStart error: ${e}`);
    }
  };

  public onHelp = async (msg: Message) => {
    const { userId, chatId } = getIds(msg);
    try {
      await this.bot.sendMessage(chatId, HelpText, { parse_mode: 'HTML' });
      await log(this.knex, userId, 'help', msg.text);
    } catch (e) {
      console.warn(`AuthService onHelp error: ${e}`);
    }
  }

  public onAbout = async (msg: Message) => {
    const { userId, chatId } = getIds(msg);
    try {
      await this.bot.sendMessage(chatId, 'This is a bot that helps you.');
      await log(this.knex, userId, 'about', msg.text);
    } catch (e) {
      console.warn(`AuthService onAbout error: ${e}`);
    }
  }

  public onHistory = async (msg: Message) => {
    const { userId, chatId } = getIds(msg);
    try {
      await this.bot.sendMessage(chatId, 'This is your last history:');
      const results = await getLastHistory(this.knex, userId);
      if (results.length === 0) {
        await this.bot.sendMessage(chatId, 'No history found.');
      } else {
        for (const item of results) {
          await this.bot.sendMessage(chatId, `"""${item.question}"""\n${item.answer}`);
        }
      }
      await log(this.knex, userId, 'history', msg.text, results.length.toString());
    } catch (e) {
      console.warn(`AuthService onHistory error: ${e}`);
    }
  }
}
