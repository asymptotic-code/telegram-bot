import axios from "axios";
import { Knex } from "knex";
import TelegramBot, { Message, SendMessageOptions } from "node-telegram-bot-api";
import { createHistoryRecord, getLastHistory } from "../db";
import { getIds } from "../utils";
import { Entities } from "../types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

const BasicBooleanPrompt = 'You only answer with "yes" or "no".';
const CheckSuiPrompt = 'Check if the input is related to Blockchain, Computer Science, AI,  Sui Move, Move or Sui Prover.';
const CheckDiscussion = 'Check if the question is related to discussion.';

export class AiService {
  constructor(private knex: Knex, private bot: TelegramBot, private mcpClient: Client) { }

  private sessionExists = async (session: string): Promise<boolean> => {
    const response = await this.mcpClient.callTool({
      name: "session_exists",
      arguments: { session }
    });

    return (response.content as any)[0].text !== 'false';
  };

  private createMcpSession = async (session: string): Promise<void> => {
    const exists = await this.sessionExists(session);
    if (exists) return;
    await this.mcpClient.callTool({
      name: "create_session",
      arguments: {
        session,
        flexible: true,
      }
    });
  }

  private clearMcpSession = async (session: string): Promise<void> => {
    await this.mcpClient.callTool({
      name: "clear_session",
      arguments: { session }
    });
  }

  private mcpConversation = async (question: string, session: string): Promise<string> => {
    const res = await this.mcpClient.callTool({
      name: "conversation_tool",
      arguments: {
        message: question,
        session,
      }
    });

    const result = JSON.parse((res.content as any)[0].text);
    return result.response.trim();
  }

  // private askGptBoolean = async (question: string, prompts: string[]): Promise<boolean> => {
  //   const url = 'https://api.openai.com/v1/chat/completions';

  //   const body = {
  //     model: 'gpt-3.5-turbo',
  //     messages: [
  //       ...prompts.map((prompt) => ({ role: 'system', content: prompt })),
  //       { role: 'system', content: BasicBooleanPrompt },
  //       { role: 'user', content: question }
  //     ],
  //     temperature: 0.0
  //   };

  //   const headers = {
  //     'Content-Type': 'application/json',
  //     'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
  //   };

  //   const response = await axios.post(url, body, { headers });

  //   const reply = response.data.choices[0].message.content.trim().toLowerCase();

  //   if (reply === 'yes' || reply === 'no') {
  //     return reply === 'yes';
  //   } else {
  //     throw new Error(`Unexpected response: ${reply}`);
  //   }
  // };

  private askGeminiBoolean = async (question: string, prompts: string[], history: Entities.UserHistory[]): Promise<boolean> => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const context: string[] = [];
    history.forEach((item) => {
      context.push(`question: ${item.question}`);
      context.push(`answer: ${item.answer}`);
    });

    const body = {
      system_instruction: { parts: context.concat(prompts).concat([BasicBooleanPrompt]).map(prompt => ({ text: prompt })) },
      contents: [{ parts: [{ text: question }] }],
      generationConfig: {
        "temperature": 0,
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
    };

    const response = await axios.post(url, body, { headers });
    const reply = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase();

    if (reply === 'yes' || reply === 'no') {
      return reply === 'yes';
    } else {
      throw new Error(`Unexpected response from Gemini (boolean): ${reply}. Expected 'yes' or 'no'.`);
    }
  };

  private askBoolean = async (question: string, prompts: string[], history?: Entities.UserHistory[]): Promise<boolean> => {
    const result = await this.askGeminiBoolean(question, prompts, history || []);
    return result;
  };

  private sendLongMessage = async (chatId: number, text: string, options?: SendMessageOptions) => {
    const chunkSize = 4000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize);
      await this.bot.sendMessage(chatId, chunk, options);
    }
  };

  public answer = async (msg: Message, pinned?: Message): Promise<boolean> => {
    try {
      const { isGroup, userId, chatId } = getIds(msg);
      let answer: string;
      let session = `user-${userId}-${isGroup ? 'group' : 'private'}-${chatId}`;

      const messageText = pinned ? `${msg.text}\n\n${pinned.text}` : msg.text
      const history = await getLastHistory(this.knex, userId, 10);

      let shouldAnswer = true;
      if (history.length) {
        shouldAnswer = await this.askBoolean(messageText, [CheckDiscussion], history.slice(0, 10));
      }
      if (!shouldAnswer) {
        shouldAnswer = await this.askBoolean(messageText, [CheckSuiPrompt]);
      }

      if (isGroup) {
        if (!shouldAnswer) return; // ignore non-sui messages in group
        let [newMessage, result] = await Promise.all([
          this.bot.sendMessage(chatId, 'Answering...', { reply_to_message_id: msg.message_id }),
          this.mcpConversation(messageText, session),
        ]);
        if (result.length > 4050) {
          result = result.slice(0, 4050) + '\n...';
        }
        await this.bot.editMessageText(result, { chat_id: chatId, message_id: newMessage.message_id });
        answer = result;
      } else {
        if (!shouldAnswer) {
          await this.bot.sendMessage(chatId, 'This message is not related to Sui Move, Move or Sui Prover.');
          return;
        }

        const result = await this.mcpConversation(messageText, session);
        if (result.length > 4050) {
          await this.sendLongMessage(chatId, result);
        } else {
          await this.bot.sendMessage(chatId, result);
        }
        answer = result;
      }
      await createHistoryRecord(this.knex, userId, msg.text, answer);
    } catch (e) {
      console.warn(`AiService answer error: ${e}`);
    }
  };

  public clearSession = async (msg: Message): Promise<void> => {
    try {
      const { isGroup, userId, chatId } = getIds(msg);
      let session = `user-${userId}-${isGroup ? 'group' : 'private'}-${chatId}`;
      await this.clearMcpSession(session);
      await this.bot.sendMessage(chatId, 'Сhat cleared.');
    } catch (e) {
      console.warn(`AiService clearSession error: ${e}`);
    }
  };
}
