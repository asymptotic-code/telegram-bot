import axios from "axios";
import { Knex } from "knex";
import TelegramBot, { Message, SendMessageOptions } from "node-telegram-bot-api";
import { createHistoryRecord, getLastHistory } from "../db";
import { getIds } from "../utils";
import { Entities } from "../types";

const BasicBooleanPrompt = 'You only answer with "yes" or "no".';
const CheckSuiPrompt = 'Check if the input is related to Sui Move, Move or Sui Prover.';
const CheckDiscussion = 'Check if the question is related to discussion.';
const SuiPrompt = 'Question is related to Sui Move, Move or Sui Prover.';
const StylePrompt = `
You're replying in a Telegram crypto group focused on Sui. Keep responses short, clear, and fun. Use Telegram style — emojis, informal tone, tight phrasing. Assume the audience knows crypto lingo. Prioritize signal over fluff. Avoid long explanations. Think like a savvy builder talking to peers.

Example style:
	•	"yep, that's in mainnet 🧪"
	•	"gasless txs soon™️"
	•	"use 0x2::coin::supply for that"
	•	"Sui Prover gonna eat 🍽️"
`;
const LimitPrompt = 'Use max 4000 characters';

export class AiService {
  constructor(private knex: Knex, private bot: TelegramBot) { }

  private askLocal = async (question: string, session: string): Promise<string> => {
    const url = 'http://127.0.0.1:8888/agent';

    const body = { question, session };

    const response = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', "X-API-KEY": "***" } });

    return response.data.answer.trim();
  }

  private askGpt = async (question: string): Promise<string> => {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: SuiPrompt },
        { role: 'system', content: StylePrompt },
        { role: 'system', content: LimitPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.7
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };

    const response = await axios.post(url, body, { headers });

    return response.data.choices[0].message.content.trim();
  };

  private askGptBoolean = async (question: string, prompts: string[]): Promise<boolean> => {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
      model: 'gpt-3.5-turbo',
      messages: [
        ...prompts.map((prompt) => ({ role: 'system', content: prompt })),
        { role: 'system', content: BasicBooleanPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.0
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };

    const response = await axios.post(url, body, { headers });

    const reply = response.data.choices[0].message.content.trim().toLowerCase();

    if (reply === 'yes' || reply === 'no') {
      return reply === 'yes';
    } else {
      throw new Error(`Unexpected response: ${reply}`);
    }
  };

  private askGemini = async (question: string, history: Entities.UserHistory[]): Promise<string> => {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const context: any = [];
    history.forEach((item) => {
      context.push({
        "role": "user",
        "parts": [{ "text": item.question }]
      });
      context.push({
        "role": "model",
        "parts": [{ "text": item.answer }]
      });
    });

    const body = {
      system_instruction: { parts: [{ text: SuiPrompt }, { text: StylePrompt }, { text: LimitPrompt }] },
      contents: context.concat([{ role: "user", parts: [{ text: question }] }]),
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY,
    };

    const response = await axios.post(url, body, { headers });

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return responseText.trim();
  };

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

  private ask = async (question: string, chatId: number, history?: Entities.UserHistory[]): Promise<string> => {
    //const result = await this.askGemini(question, history || []);
    const result = await this.askLocal(question, chatId.toString());
    console.log('Ask result:', result);
    return result;
  };

  private askBoolean = async (question: string, prompts: string[], history?: Entities.UserHistory[]): Promise<boolean> => {
    const result = await this.askGeminiBoolean(question, prompts, history || []);
    console.log('Ask Boolean result:', result);
    return result;
  };

  private sendLongMessage = async (chatId: number, text: string, options?: SendMessageOptions) => {
    const chunkSize = 4000;
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.substring(i, i + chunkSize);
      await this.bot.sendMessage(chatId, chunk, options);
    }
  };

  public answer = async (msg: Message): Promise<boolean> => {
    try {
      const { isGroup, userId, chatId } = getIds(msg);
      let answer: string;

      const history = await getLastHistory(this.knex, userId, 25);

      console.log('History:', history.slice(0, 3));
      let shouldAnswer = true; //await this.askBoolean(msg.text, [history.length ? CheckDiscussion : CheckSuiPrompt], history.slice(0, 10));
      if (!shouldAnswer) {
        shouldAnswer = await this.askBoolean(msg.text, [CheckSuiPrompt]);
      }
      if (isGroup) {
        if (!shouldAnswer) return; // ignore non-sui messages in group
        let [newMessage, result] = await Promise.all([
          this.bot.sendMessage(chatId, 'Answering...', { reply_to_message_id: msg.message_id }),
          this.ask(msg.text, chatId, history),
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

        const result = await this.ask(msg.text, chatId, history);
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
}
