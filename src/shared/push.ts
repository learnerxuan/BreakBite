/** Public UI contracts and private persistence types; no secrets are serialized by API views. */
export interface PushKeys { publicKey: string; privateKey: string; subject: string; }
export interface WebSubscription { endpoint: string; keys: { p256dh: string; auth: string }; }
export interface PushDevice extends WebSubscription {
    id: string; accountId: string; sessionTag: string; label: string; publicKey: string;
    createdAt: number; updatedAt: number; expiresAt: number; ignoreNoticeIds: string[];
    lastTestAt?: number; lastAcceptedAt?: number; lastError?: string;
}
export interface PushJob {
    id: string; deviceId: string; noticeId?: string; createdAt: number; expiresAt: number;
    status: 'pending' | 'sending' | 'accepted' | 'failed' | 'skipped'; attempts: number; nextAt: number;
    title: string; body: string; lastError?: string;
}
export interface PublicPushDevice {
    id: string; label: string; expiresAt: number; lastAcceptedAt?: number; lastError?: string;
}
export interface PushStatus { configured: boolean; publicKey: string; devices: PublicPushDevice[]; }
