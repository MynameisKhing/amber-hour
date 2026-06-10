export type Role = "customer" | "staff";

export interface User {
  nickname: string;
  role: Role;
  token: string;
}

export type MessageType =
  | "chat"
  | "presence"
  | "typing"
  | "typing_stop"
  | "history"
  | "reaction"
  | "edit_message"
  | "delete_message"
  | "music"
  | "cheers"
  | "system"
  | "whisper"
  | "whisper_history"
  | "jukebox_state"
  | "jukebox_add"
  | "jukebox_vote_skip"
  | "jukebox_ended"
  | "bar_status"
  | "wallet";

export interface WSMessage {
  type: MessageType;
  payload: unknown;
}

export interface ChatMessage {
  id: number;
  senderNick: string;
  role: Role;
  content: string;
  mediaUrl?: string;
  createdAt: string;
  editedAt?: string;
  replyTo?: number;
  replyToNick?: string;
  replyToContent?: string;
  targetNick?: string;
  reactions: Record<string, string[]>;
}

export interface PresencePayload {
  users: { nickname: string; role: Role }[];
}

export interface MenuItem {
  id: number;
  category: string;
  name: string;
  description: string;
  price: number;
  isAvailable: boolean;
}

export interface JukeboxEntry {
  videoId: string;
  addedBy: string;
}

export interface JukeboxNow extends JukeboxEntry {
  startedAt: string;
}

export interface JukeboxState {
  current: JukeboxNow | null;
  queue: JukeboxEntry[];
  skipVotes: number;
  skipThreshold: number;
}

export interface OrderItem {
  menuItemId: number;
  name: string;
  price: number;
  qty: number;
}

export interface Order {
  id: number;
  customerNick: string;
  status: "pending" | "served" | "cancelled";
  createdAt: string;
  items: OrderItem[];
}

export interface GuestbookEntry {
  nick: string;
  message: string;
  createdAt: string;
}

export interface BarStatus {
  open: boolean;
  lastCallAt: string | null;
}

export interface WalletPayload {
  balance: number;
}

export interface LeaderboardEntry {
  nickname: string;
  balance: number;
}
