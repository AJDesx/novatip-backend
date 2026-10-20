import type { FastifyPluginAsync } from "fastify";
import { openApiSpecification } from "../../openapi.js";

export const openApiRoutes: FastifyPluginAsync = async (app) => {
  app.get("/openapi.json", async (_request, reply) => {
    return reply.type("application/json").send(openApiSpecification);
  });
};
