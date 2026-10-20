/**
 * notifications.service.ts
 *
 * Reads the creator's stored notifications and presents them in an API-safe
 * shape, newest first, with a bounded page size and offset paging.
 */

import { db } from "../../db.js";

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;
export const MAX_NOTIFICATION_PAGE_SIZE = 100;

export interface NotificationRecord {
  id: string;
  type: "TIP_RECEIVED" | "WEBHOOK_FAILED";
  payload: Record<string, unknown> | unknown[] | null;
  sent: boolean;
  sentAt: string | null;
  createdAt: string;
}

export async function listNotifications(
  creatorId: string,
  limit = DEFAULT_NOTIFICATION_PAGE_SIZE,
  offset = 0,
): Promise<NotificationRecord[]> {
  const take = Math.min(Math.max(limit, 1), MAX_NOTIFICATION_PAGE_SIZE);

  const rows = await db.notification.findMany({
    where: { creatorId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    skip: offset,
    select: {
      id: true,
      type: true,
      payload: true,
      sentAt: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    payload: row.payload as Record<string, unknown> | unknown[] | null,
    sent: row.sentAt !== null,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }));
}
