export namespace Entities {
  export interface User {
    id: number;
    tid: number;
    username: string;
    is_group: boolean;
    created_at: number;
  }

  export interface UserHistory {
    id: number;
    tid: number;
    question: string;
    answer: string;
    created_at: number;
  }

  export interface Log {
    id: number;
    tid: number;
    action: string;
    text: string;
    result: string;
    created_at: number;
  }
}

export type LogAction = 'ask-bool' | 'ask-question' | 'start' | 'help' | 'about' | 'history';
