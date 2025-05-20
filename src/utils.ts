import TelegramBot from 'node-telegram-bot-api';

export const getIds = (msg: TelegramBot.Message) => ({
  userId: msg.from.id,
  chatId: msg.chat.id,
  msgId: msg.message_id,
  username: msg.from.username,
  isGroup: msg.chat.type !== 'private',
  chatType: msg.chat.type,
});
