export type NotificationType = 'booking_created' | 'booking_accepted' | 'booking_cancelled' | 'booking_completed' | 'payout';
export declare function createNotification(userId: string, type: NotificationType, title: string, body: string | null, referenceId?: string, referenceType?: string): Promise<void>;
//# sourceMappingURL=notifications.d.ts.map