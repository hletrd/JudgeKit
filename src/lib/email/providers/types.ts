export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): Promise<boolean>;
  send(message: EmailMessage): Promise<SendResult>;
}
