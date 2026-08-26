import { activityLog } from "../drizzle/schema";
import { getDb } from "./db";

/**
 * Registra uma ação administrativa importante (auditoria). Nunca deve
 * quebrar a operação principal — se o log falhar, só avisa no console.
 */
export async function logActivity(params: {
  userId?: number | null;
  userName?: string | null;
  action: string;
  entityType?: string;
  entityId?: number;
  description: string;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(activityLog).values({
      userId: params.userId ?? null,
      userName: params.userName ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      description: params.description,
    });
  } catch (err) {
    console.error("Erro ao registrar atividade (não bloqueia a operação):", err);
  }
}
