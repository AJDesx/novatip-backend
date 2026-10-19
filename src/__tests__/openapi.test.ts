import Fastify from "fastify";
import { openApiSpecification } from "../openapi.js";
import { openApiRoutes } from "../modules/openapi/openapi.routes.js";

describe("OpenAPI route", () => {
  it("serves the documented API specification as JSON", async () => {
    const app = Fastify();
    await app.register(openApiRoutes, { prefix: "/api/v1" });

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/openapi.json",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual(openApiSpecification);
    expect(Object.keys(openApiSpecification.paths)).toEqual(
      expect.arrayContaining([
        "/health",
        "/health/live",
        "/health/ready",
        "/health/indexer",
        "/auth/challenge",
        "/auth/verify",
        "/auth/me",
        "/creators/{slug}",
        "/creators/check/{slug}",
        "/creators/claim",
        "/creators/me",
        "/creators/me/splits",
        "/creators/me/slug",
        "/resolve/{slug}",
        "/qr/{slug}",
        "/qr/{slug}/png",
        "/analytics/totals",
        "/analytics/timeseries",
        "/analytics/top-supporters",
        "/analytics/recent",
        "/analytics/collaborators",
        "/public/{slug}/recent",
        "/webhooks",
        "/webhooks/{id}",
        "/webhooks/{id}/deliveries",
        "/webhooks/{id}/ping",
        "/webhooks/{id}/secret",
        "/openapi.json",
      ]),
    );

    await app.close();
  });

  it("describes bearer authentication for protected routes", () => {
    expect(
      openApiSpecification.paths["/analytics/totals"]?.get?.security,
    ).toEqual([{ bearerAuth: [] }]);
    expect(
      openApiSpecification.paths["/public/{slug}/recent"]?.get?.security,
    ).toBeUndefined();
  });
});
