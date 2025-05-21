import { Knex } from "knex";
import { Entities, LogAction } from "./types";

export const createUser = (knex: Knex, tid: number, username: string, isGroup: boolean) => 
    knex<Entities.User>('visitor').insert({ tid, username, is_group: isGroup });

export const getUser = (knex: Knex, tid: number): Promise<Entities.User> => 
    knex<Entities.User>('visitor').where({ tid }).first();

export const getLastHistory = (knex: Knex, tid: number, amount = 10): Promise<Entities.UserHistory[]> => 
    knex<Entities.UserHistory>('visitor_history').where({ tid }).orderBy('created_at', 'desc').limit(amount);

export const createHistoryRecord = (knex: Knex, tid: number, question: string, answer: string) => 
    knex<Entities.UserHistory>('visitor_history').insert({ tid, question, answer });

export const log = (knex: Knex, tid: number, action: LogAction, text: string, result?: string) => 
    knex<Entities.Log>('general_log').insert({ tid, action, result, text });
