export const ASSISTANT_DATA_UPDATED_EVENT = 'assistant-data-updated';

export type AssistantDataUpdatedDetail =
  | {
      kind: 'cash_entry';
      date: string;
    }
  | {
      kind: 'ledger_transaction';
      entityType: string;
      entityId: string;
      date: string;
    };
