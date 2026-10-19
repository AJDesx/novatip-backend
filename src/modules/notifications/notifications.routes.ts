/**
 * notifications.routes.ts
 *
 * GET /api/v1/notifications - creator notification feed (auth)
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  DEFAULT_NOTIFICATION_PAGE_SIZE,
  MAX_NOTIFICATION_PAGE_SIZE,
  listNotifications,
} from "./notifications.service.js";

export const NotificationQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_NOTIFICATION_PAGE_SIZE)
    .default(DEFAULT_NOTIFICATION_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request, reply) => {
    const query = NotificationQuery.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({ error: query.error.flatten() });
    }

    const { user } = request;
    const notifications = await listNotifications(
      user.sub,
      query.data.limit,
      query.data.offset,
    );

    return reply.send({ notifications });
  });
};
