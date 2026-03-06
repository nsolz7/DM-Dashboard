export type TransactionKind = "info" | "prompt" | "transaction";
export type TransactionCategory = "system" | "barter" | "level_up" | "compendium_assign" | "loot" | "equip" | "message";
export type TransactionSeverity = "neutral" | "success" | "warning" | "danger";
export type TransactionActorType = "dm" | "player" | "system";
export type TransactionRecipientMode = "single" | "multi" | "party";
export type TransactionStatus = "unread" | "read" | "pending_response" | "responded" | "closed";
export type TransactionPromptType = "level_up_choice" | "barter_ack" | "compendium_accept" | "generic_question";
export type TransactionResponseKind = "single_choice" | "free_text" | "ack";

export interface TransactionMessage {
  title: string;
  body: string;
  severity?: TransactionSeverity;
  icon?: string;
}

export interface TransactionSender {
  actorType: TransactionActorType;
  uid?: string;
  playerId?: string;
  displayName?: string;
}

export interface TransactionRecipients {
  mode: TransactionRecipientMode;
  playerIds?: string[];
  includeDm?: boolean;
}

export interface TransactionPromptChoice {
  id: string;
  label: string;
}

export interface TransactionPrompt {
  promptType: TransactionPromptType;
  question: string;
  choices?: TransactionPromptChoice[];
  allowFreeText?: boolean;
  required?: boolean;
  responseKind?: TransactionResponseKind;
}

export interface TransactionPromptResponse {
  choiceId?: string;
  choiceLabel?: string;
  text?: string;
}

export interface TransactionRecipientStateEntry {
  status: TransactionStatus;
  deliveredAt?: Date | null;
  readAt?: Date | null;
  respondedAt?: Date | null;
  response?: TransactionPromptResponse;
}

export interface TransactionPayload {
  entityType?: string;
  entityId?: string;
  amount?: unknown;
}

export interface TransactionRelated {
  route?: string;
  entityType?: string;
  entityId?: string;
}

export interface TransactionDoc {
  id: string;
  campaignId: string;
  schemaVersion: 1;
  kind: TransactionKind;
  category: TransactionCategory;
  message: TransactionMessage;
  sender: TransactionSender;
  recipientKeys: string[];
  recipients: TransactionRecipients;
  recipientState: Record<string, TransactionRecipientStateEntry>;
  prompt: TransactionPrompt | null;
  payload?: TransactionPayload;
  related?: TransactionRelated;
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt?: Date | null;
}

export interface RespondToPromptInput extends TransactionPromptResponse {}
