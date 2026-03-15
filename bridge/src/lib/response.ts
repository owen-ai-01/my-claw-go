import type { FastifyReply } from 'fastify';

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200) {
  return reply.status(statusCode).send({ ok: true, data });
}

export function fail(
  reply: FastifyReply,
  code: string,
  message: string,
  statusCode = 400,
  details?: unknown
) {
  return reply.status(statusCode).send({
    ok: false,
    error: { code, message, details },
  });
}
