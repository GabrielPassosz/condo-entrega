import { and, count, desc, eq, like, or, type SQL } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLogs } from "../../../db/schema";
import { apiError } from "../../../lib/api";
import { getActor, requireRole } from "../../../lib/auth";
import { safeText } from "../../../lib/normalize";

export async function GET(request: Request) {
  try {
    const actor = await getActor();
    requireRole(actor, ["admin"]);
    const url = new URL(request.url);
    const page = Math.max(
      1,
      Math.floor(Number(url.searchParams.get("page")) || 1),
    );
    const pageSize = Math.max(
      1,
      Math.min(
        100,
        Math.floor(Number(url.searchParams.get("pageSize")) || 50),
      ),
    );
    const query = safeText(url.searchParams.get("q"), 100);
    const conditions: SQL[] = [
      eq(auditLogs.condominiumId, actor.condominiumId),
    ];
    if (query) {
      const pattern = `%${query}%`;
      const search = or(
        like(auditLogs.action, pattern),
        like(auditLogs.actorEmail, pattern),
        like(auditLogs.entityType, pattern),
        like(auditLogs.entityId, pattern),
      );
      if (search) conditions.push(search);
    }
    const condition = and(...conditions);
    const db = getDb();
    const [[totalRow], rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(auditLogs)
        .where(condition),
      db
        .select()
        .from(auditLogs)
        .where(condition)
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);
    const total = totalRow?.value ?? 0;
    return Response.json({
      audit: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
