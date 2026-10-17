/**
 * utils/logger.ts
 * Thin wrapper around Fastify's built-in pino logger for use outside routes.
 */
import pino, { type LoggerOptions } from "pino";
import { config } from "../config.js";

/**
 * The pino options shared by this module's own logger and the one Fastify
 * is built with in server.ts — one definition so a change to level or
 * redaction only has to be made once, rather than in both places and only
 * ever in the one whoever is editing happened to open first.
 *
 * `transport` is spread in rather than set to undefined: the tsconfig enables
 * exactOptionalPropertyTypes, under which an explicit `undefined` is not a
 * valid value for an optional property — the key has to be absent instead.
 */
export function buildLoggerOptions(isProduction: boolean): LoggerOptions {
  return {
    level: isProduction ? "info" : "debug",
    ...(isProduction
      ? {}
      : { transport: { target: "pino-pretty", options: { colorize: true } } }),
  };
}

const isProduction = config.nodeEnv === "production";

export const logger = pino(buildLoggerOptions(isProduction));
