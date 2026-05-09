export type MoodTag =
  | "bored"
  | "stressed"
  | "genuinely_need"
  | "treating_myself"
  | "saw_it_somewhere"
  | "untagged";

export type ItemStatus = "pending" | "bought" | "dropped";

export interface ShadowCartItem {
  id: string;
  name: string;
  price: string;
  imageUrl: string;
  productUrl: string;
  siteName: string;
  addedAt: number;
  remindAt: number;
  mood: MoodTag;
  status: ItemStatus;
  notified: boolean;
  reminderEmail?: string;
}

export interface UserSettings {
  email: string;
  emailEnabled: boolean;
}
