export type Session = {
  expires_at: string;
};

export type Summary = {
  account_count: number;
  contact_count: number;
  webhook_count: number;
};

export type Account = {
  account_id: string;
  name: string;
  user_id: string;
  base_url: string;
  enabled: boolean;
  running: boolean;
  last_poll_at?: string | null;
  last_inbound_at?: string | null;
  last_error: string;
};

export type Contact = {
  account_id: string;
  user_id: string;
  context_token: string;
  last_message_text: string;
  last_message_at?: string | null;
};

export type Webhook = {
  webhook_id: string;
  name: string;
  account_id: string;
  default_to_user_id: string;
  secret: string;
  enabled: boolean;
  last_used_at?: string | null;
};

export type MessageRecord = {
  id: number;
  account_id: string;
  user_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  content: string;
  message_id: string;
  media_url?: string;
  media_path?: string;
  file_name?: string;
  content_type?: string;
  created_at: string;
};

export type LoginSession = {
  session_key: string;
  qr_content: string;
  qr_data_url: string;
  base_url: string;
  name: string;
  started_at: string;
};
