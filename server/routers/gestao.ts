/**
 * Router da Gestão Integrarte — Escola de Artes Espírita.
 * Cadastro de alunos, professores, modalidades, e controle de pagamento
 * (contribuição de custeio dos alunos / bolsa cultura dos professores).
 * Por enquanto usa o mesmo nível de acesso do admin (adminProcedure).
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, like, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  modalidades, alunos, alunoModalidades,
  professores, professorModalidades,
  pagamentosAlunos, pagamentosProfessores,
  frequencia,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";

const formaPagamentoEnum = z.enum(["pix", "dinheiro", "transferencia", "outro"]);

export const gestaoRouter = router({
  // ═══════════════ MODALIDADES ═══════════════
  modalidades: router({
    list: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(modalidades).orderBy(modalidades.nome);
    }),

    create: adminProcedure
      .input(z.object({
        nome: z.string().min(1),
        grupoExclusivo: z.boolean().default(false),
        valorMensal: z.string().default("50.00"),
        idadeMinima: z.number().nullable().optional(),
        idadeMaxima: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.insert(modalidades).values(input);
        return { success: true };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nome: z.string().min(1).optional(),
        grupoExclusivo: z.boolean().optional(),
        valorMensal: z.string().optional(),
        idadeMinima: z.number().nullable().optional(),
        idadeMaxima: z.number().nullable().optional(),
        active: z.boolean().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        const { id, ...data } = input;
        await db.update(modalidades).set(data).where(eq(modalidades.id, id));
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(modalidades).set({ active: false }).where(eq(modalidades.id, input.id));
        return { success: true };
      }),
  }),

  // ═══════════════ ALUNOS ═══════════════
  alunos: router({
    list: adminProcedure
      .input(z.object({ search: z.string().optional(), onlyActive: z.boolean().default(true) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input?.onlyActive) conditions.push(eq(alunos.active, true));
        if (input?.search) {
          conditions.push(or(
            like(alunos.nomeCompleto, `%${input.search}%`),
            like(alunos.cpf, `%${input.search}%`),
            like(alunos.telefone, `%${input.search}%`),
          ));
        }
        const rows = await db.select().from(alunos)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(alunos.nomeCompleto);

        if (rows.length === 0) return [];
        const alunoIds = rows.map(r => r.id);
        const modRows = await db.select({
          alunoId: alunoModalidades.alunoId,
          modalidadeId: modalidades.id,
          modalidadeNome: modalidades.nome,
          valorMensal: modalidades.valorMensal,
        }).from(alunoModalidades)
          .leftJoin(modalidades, eq(alunoModalidades.modalidadeId, modalidades.id))
          .where(and(inArray(alunoModalidades.alunoId, alunoIds), eq(alunoModalidades.active, true)));

        const modsByAluno: Record<number, { id: number; nome: string | null; valorMensal: string | null }[]> = {};
        for (const m of modRows) {
          (modsByAluno[m.alunoId] ??= []).push({ id: m.modalidadeId!, nome: m.modalidadeNome, valorMensal: m.valorMensal });
        }

        return rows.map(a => ({
          ...a,
          modalidades: modsByAluno[a.id] ?? [],
          valorMensalTotal: (modsByAluno[a.id] ?? []).reduce((acc, m) => acc + parseFloat(m.valorMensal ?? "0"), 0),
        }));
      }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [aluno] = await db.select().from(alunos).where(eq(alunos.id, input.id)).limit(1);
        if (!aluno) return null;
        const modRows = await db.select({ modalidadeId: alunoModalidades.modalidadeId })
          .from(alunoModalidades)
          .where(and(eq(alunoModalidades.alunoId, input.id), eq(alunoModalidades.active, true)));
        return { ...aluno, modalidadeIds: modRows.map(m => m.modalidadeId) };
      }),

    create: adminProcedure
      .input(z.object({
        nomeCompleto: z.string().min(1),
        dataNascimento: z.string().optional(),
        cpf: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        maiorIdade: z.boolean(),
        responsavelNome: z.string().optional(),
        responsavelVinculo: z.string().optional(),
        responsavelEmail: z.string().optional(),
        responsavelTelefone: z.string().optional(),
        responsavelPresenteMenor10: z.boolean().optional(),
        autorizacaoImagem: z.boolean().default(false),
        possuiDeficiencia: z.boolean().default(false),
        deficienciaQual: z.string().optional(),
        observacoes: z.string().optional(),
        modalidadeIds: z.array(z.number()).max(2, "Um aluno pode se matricular em no máximo 2 modalidades."),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        await validateModalidadeSelection(db, input.modalidadeIds);

        const { modalidadeIds, dataNascimento, ...alunoData } = input;
        const result = await db.insert(alunos).values({
          ...alunoData,
          dataNascimento: dataNascimento ? new Date(dataNascimento) : undefined,
        });
        const alunoId = Number((result as any).insertId || (result as any)[0]?.insertId);

        if (modalidadeIds.length > 0) {
          await db.insert(alunoModalidades).values(
            modalidadeIds.map(modalidadeId => ({ alunoId, modalidadeId }))
          );
        }

        return { success: true, id: alunoId };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nomeCompleto: z.string().min(1).optional(),
        dataNascimento: z.string().optional(),
        cpf: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        maiorIdade: z.boolean().optional(),
        responsavelNome: z.string().optional(),
        responsavelVinculo: z.string().optional(),
        responsavelEmail: z.string().optional(),
        responsavelTelefone: z.string().optional(),
        responsavelPresenteMenor10: z.boolean().optional(),
        autorizacaoImagem: z.boolean().optional(),
        possuiDeficiencia: z.boolean().optional(),
        deficienciaQual: z.string().optional(),
        observacoes: z.string().optional(),
        active: z.boolean().optional(),
        modalidadeIds: z.array(z.number()).max(2).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, modalidadeIds, dataNascimento, ...data } = input;

        if (modalidadeIds) await validateModalidadeSelection(db, modalidadeIds);

        const updateData: Record<string, unknown> = { ...data };
        if (dataNascimento !== undefined) updateData.dataNascimento = new Date(dataNascimento);

        if (Object.keys(updateData).length > 0) {
          await db.update(alunos).set(updateData).where(eq(alunos.id, id));
        }

        if (modalidadeIds) {
          await db.delete(alunoModalidades).where(eq(alunoModalidades.alunoId, id));
          if (modalidadeIds.length > 0) {
            await db.insert(alunoModalidades).values(
              modalidadeIds.map(modalidadeId => ({ alunoId: id, modalidadeId }))
            );
          }
        }

        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(alunos).set({ active: false }).where(eq(alunos.id, input.id));
        return { success: true };
      }),

    /**
     * Marca desistência no meio do ano — diferente de "delete" (desativação
     * geral): aqui fica registrada a data e o motivo, pra saber que o/a
     * aluno/a só pode se rematricular no próximo período de matrículas.
     */
    marcarDesistente: adminProcedure
      .input(z.object({ id: z.number(), motivo: z.string().optional() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(alunos).set({
          statusMatricula: "desistente",
          dataDesistencia: new Date(),
          motivoDesistencia: input.motivo,
          active: false,
        }).where(eq(alunos.id, input.id));
        return { success: true };
      }),

    /** Reativa um aluno (ex: engano na desistência, ou novo período liberado) */
    reativar: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(alunos).set({
          statusMatricula: "ativo",
          dataDesistencia: null,
          motivoDesistencia: null,
          active: true,
        }).where(eq(alunos.id, input.id));
        return { success: true };
      }),
  }),

  // ═══════════════ PROFESSORES ═══════════════
  professores: router({
    list: adminProcedure
      .input(z.object({ search: z.string().optional(), onlyActive: z.boolean().default(true) }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const conditions = [];
        if (input?.onlyActive) conditions.push(eq(professores.active, true));
        if (input?.search) {
          conditions.push(or(
            like(professores.nomeCompleto, `%${input.search}%`),
            like(professores.cpf, `%${input.search}%`),
          ));
        }
        const rows = await db.select().from(professores)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(professores.nomeCompleto);

        if (rows.length === 0) return [];
        const profIds = rows.map(r => r.id);
        const modRows = await db.select({
          professorId: professorModalidades.professorId,
          modalidadeId: modalidades.id,
          modalidadeNome: modalidades.nome,
        }).from(professorModalidades)
          .leftJoin(modalidades, eq(professorModalidades.modalidadeId, modalidades.id))
          .where(inArray(professorModalidades.professorId, profIds));

        const modsByProf: Record<number, { id: number; nome: string | null }[]> = {};
        for (const m of modRows) {
          (modsByProf[m.professorId] ??= []).push({ id: m.modalidadeId!, nome: m.modalidadeNome });
        }

        return rows.map(p => ({ ...p, modalidades: modsByProf[p.id] ?? [] }));
      }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return null;
        const [professor] = await db.select().from(professores).where(eq(professores.id, input.id)).limit(1);
        if (!professor) return null;
        const modRows = await db.select({ modalidadeId: professorModalidades.modalidadeId })
          .from(professorModalidades)
          .where(eq(professorModalidades.professorId, input.id));
        return { ...professor, modalidadeIds: modRows.map(m => m.modalidadeId) };
      }),

    create: adminProcedure
      .input(z.object({
        nomeCompleto: z.string().min(1),
        cpf: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        valorBolsaMensal: z.string().default("0.00"),
        chavePix: z.string().optional(),
        observacoes: z.string().optional(),
        modalidadeIds: z.array(z.number()).default([]),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { modalidadeIds, ...profData } = input;
        const result = await db.insert(professores).values(profData);
        const professorId = Number((result as any).insertId || (result as any)[0]?.insertId);

        if (modalidadeIds.length > 0) {
          await db.insert(professorModalidades).values(
            modalidadeIds.map(modalidadeId => ({ professorId, modalidadeId }))
          );
        }

        return { success: true, id: professorId };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        nomeCompleto: z.string().min(1).optional(),
        cpf: z.string().optional(),
        email: z.string().optional(),
        telefone: z.string().optional(),
        valorBolsaMensal: z.string().optional(),
        chavePix: z.string().optional(),
        observacoes: z.string().optional(),
        active: z.boolean().optional(),
        modalidadeIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const { id, modalidadeIds, ...data } = input;
        if (Object.keys(data).length > 0) {
          await db.update(professores).set(data).where(eq(professores.id, id));
        }

        if (modalidadeIds) {
          await db.delete(professorModalidades).where(eq(professorModalidades.professorId, id));
          if (modalidadeIds.length > 0) {
            await db.insert(professorModalidades).values(
              modalidadeIds.map(modalidadeId => ({ professorId: id, modalidadeId }))
            );
          }
        }

        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(professores).set({ active: false }).where(eq(professores.id, input.id));
        return { success: true };
      }),
  }),

  // ═══════════════ FREQUÊNCIA (controle de faltas) ═══════════════
  frequencia: router({
    /**
     * Lista a chamada de um dia (sábado) — cria automaticamente uma linha
     * "presente" para cada aluno ativo que ainda não tem registro nessa data,
     * assumindo presença por padrão (só marca falta explicitamente).
     */
    listByDate: adminProcedure
      .input(z.object({ data: z.string() })) // "2026-08-09"
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        const dataAlvo = new Date(input.data + "T12:00:00");

        const alunosAtivos = await db.select({ id: alunos.id, nome: alunos.nomeCompleto })
          .from(alunos).where(and(eq(alunos.active, true), eq(alunos.statusMatricula, "ativo")));
        if (alunosAtivos.length === 0) return [];
        const alunoIds = alunosAtivos.map(a => a.id);

        const startOfDay = new Date(input.data + "T00:00:00");
        const endOfDay = new Date(input.data + "T23:59:59");

        const existentes = await db.select().from(frequencia)
          .where(and(
            eq(frequencia.tipo, "teorico"),
            inArray(frequencia.alunoId, alunoIds),
            gte(frequencia.data, startOfDay),
            lte(frequencia.data, endOfDay),
          ));
        const existentesMap = new Map(existentes.map(e => [e.alunoId, e]));

        const faltantes = alunosAtivos.filter(a => !existentesMap.has(a.id));
        if (faltantes.length > 0) {
          await db.insert(frequencia).values(
            faltantes.map(a => ({ alunoId: a.id, data: dataAlvo, tipo: "teorico" as const, presente: true }))
          );
          const novos = await db.select().from(frequencia)
            .where(and(
              eq(frequencia.tipo, "teorico"),
              inArray(frequencia.alunoId, faltantes.map(a => a.id)),
              gte(frequencia.data, startOfDay),
              lte(frequencia.data, endOfDay),
            ));
          for (const n of novos) existentesMap.set(n.alunoId, n);
        }

        return alunosAtivos.map(a => ({
          alunoId: a.id, alunoNome: a.nome,
          registro: existentesMap.get(a.id) ?? null,
        }));
      }),

    marcarPresenca: adminProcedure
      .input(z.object({
        id: z.number(),
        presente: z.boolean(),
        justificada: z.boolean().default(false),
        justificativa: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(frequencia).set({
          presente: input.presente,
          justificada: input.presente ? false : input.justificada,
          justificativa: input.justificativa,
          registradoPor: ctx.user.id,
        }).where(eq(frequencia.id, input.id));
        return { success: true };
      }),

    /**
     * Conta faltas não-justificadas por trimestre civil (Jan-Mar, Abr-Jun,
     * Jul-Set, Out-Dez) — regulamento permite no máximo 3 por trimestre.
     */
    faltasPorTrimestre: adminProcedure
      .input(z.object({ ano: z.number(), trimestre: z.number().min(1).max(4) }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const startMonth = (input.trimestre - 1) * 3; // 0, 3, 6, 9
        const start = new Date(input.ano, startMonth, 1);
        const end = new Date(input.ano, startMonth + 3, 0, 23, 59, 59);

        const alunosAtivos = await db.select({ id: alunos.id, nome: alunos.nomeCompleto })
          .from(alunos).where(and(eq(alunos.active, true), eq(alunos.statusMatricula, "ativo")));
        if (alunosAtivos.length === 0) return [];

        const faltas = await db.select({
          alunoId: frequencia.alunoId, justificada: frequencia.justificada,
        }).from(frequencia)
          .where(and(
            eq(frequencia.presente, false),
            inArray(frequencia.alunoId, alunosAtivos.map(a => a.id)),
            gte(frequencia.data, start),
            lte(frequencia.data, end),
          ));

        const countByAluno: Record<number, { total: number; justificadas: number }> = {};
        for (const f of faltas) {
          const c = (countByAluno[f.alunoId] ??= { total: 0, justificadas: 0 });
          c.total += 1;
          if (f.justificada) c.justificadas += 1;
        }

        return alunosAtivos.map(a => {
          const c = countByAluno[a.id] ?? { total: 0, justificadas: 0 };
          const naoJustificadas = c.total - c.justificadas;
          return {
            alunoId: a.id, alunoNome: a.nome,
            totalFaltas: c.total, faltasJustificadas: c.justificadas, faltasNaoJustificadas: naoJustificadas,
            acimaDoLimite: naoJustificadas > 3,
          };
        }).sort((a, b) => b.faltasNaoJustificadas - a.faltasNaoJustificadas);
      }),
  }),

  // ═══════════════ PAGAMENTOS — ALUNOS (contribuição de custeio) ═══════════════
  pagamentosAlunos: router({
    listByMonth: adminProcedure
      .input(z.object({ mesReferencia: z.string() })) // "2026-08"
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        // Garante que todo aluno ativo com modalidade tenha um registro de
        // pagamento para o mês pedido (gera na hora, se ainda não existir).
        const alunosAtivos = await db.select({ id: alunos.id }).from(alunos).where(eq(alunos.active, true));
        const alunoIds = alunosAtivos.map(a => a.id);
        if (alunoIds.length === 0) return [];

        const existentes = await db.select({ alunoId: pagamentosAlunos.alunoId }).from(pagamentosAlunos)
          .where(and(eq(pagamentosAlunos.mesReferencia, input.mesReferencia), inArray(pagamentosAlunos.alunoId, alunoIds)));
        const existentesSet = new Set(existentes.map(e => e.alunoId));
        const faltantes = alunoIds.filter(id => !existentesSet.has(id));

        if (faltantes.length > 0) {
          const modRows = await db.select({
            alunoId: alunoModalidades.alunoId, valorMensal: modalidades.valorMensal,
          }).from(alunoModalidades)
            .leftJoin(modalidades, eq(alunoModalidades.modalidadeId, modalidades.id))
            .where(and(inArray(alunoModalidades.alunoId, faltantes), eq(alunoModalidades.active, true)));

          const totalByAluno: Record<number, number> = {};
          for (const m of modRows) {
            totalByAluno[m.alunoId] = (totalByAluno[m.alunoId] ?? 0) + parseFloat(m.valorMensal ?? "0");
          }

          const toInsert = faltantes
            .filter(id => (totalByAluno[id] ?? 0) > 0)
            .map(id => ({
              alunoId: id, mesReferencia: input.mesReferencia,
              valorEsperado: totalByAluno[id].toFixed(2), status: "pendente" as const,
            }));
          if (toInsert.length > 0) await db.insert(pagamentosAlunos).values(toInsert);
        }

        const rows = await db.select({
          id: pagamentosAlunos.id, alunoId: pagamentosAlunos.alunoId,
          alunoNome: alunos.nomeCompleto, alunoTelefone: alunos.telefone,
          mesReferencia: pagamentosAlunos.mesReferencia,
          valorEsperado: pagamentosAlunos.valorEsperado, valorPago: pagamentosAlunos.valorPago,
          dataPagamento: pagamentosAlunos.dataPagamento, formaPagamento: pagamentosAlunos.formaPagamento,
          status: pagamentosAlunos.status, observacoes: pagamentosAlunos.observacoes,
        }).from(pagamentosAlunos)
          .leftJoin(alunos, eq(pagamentosAlunos.alunoId, alunos.id))
          .where(and(eq(pagamentosAlunos.mesReferencia, input.mesReferencia), inArray(pagamentosAlunos.alunoId, alunoIds)))
          .orderBy(alunos.nomeCompleto);

        return rows;
      }),

    registerPayment: adminProcedure
      .input(z.object({
        id: z.number(),
        valorPago: z.string(),
        dataPagamento: z.string(),
        formaPagamento: formaPagamentoEnum,
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pagamentosAlunos).set({
          valorPago: input.valorPago,
          dataPagamento: new Date(input.dataPagamento),
          formaPagamento: input.formaPagamento,
          observacoes: input.observacoes,
          status: "pago",
          registradoPor: ctx.user.id,
        }).where(eq(pagamentosAlunos.id, input.id));
        return { success: true };
      }),

    updateStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pendente", "pago", "atrasado", "isento"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pagamentosAlunos).set({ status: input.status }).where(eq(pagamentosAlunos.id, input.id));
        return { success: true };
      }),
  }),

  // ═══════════════ PAGAMENTOS — PROFESSORES (bolsa cultura) ═══════════════
  pagamentosProfessores: router({
    listByMonth: adminProcedure
      .input(z.object({ mesReferencia: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const profsAtivos = await db.select({ id: professores.id, valorBolsaMensal: professores.valorBolsaMensal })
          .from(professores).where(eq(professores.active, true));
        const profIds = profsAtivos.map(p => p.id);
        if (profIds.length === 0) return [];

        const existentes = await db.select({ professorId: pagamentosProfessores.professorId }).from(pagamentosProfessores)
          .where(and(eq(pagamentosProfessores.mesReferencia, input.mesReferencia), inArray(pagamentosProfessores.professorId, profIds)));
        const existentesSet = new Set(existentes.map(e => e.professorId));
        const faltantes = profsAtivos.filter(p => !existentesSet.has(p.id) && parseFloat(p.valorBolsaMensal) > 0);

        if (faltantes.length > 0) {
          await db.insert(pagamentosProfessores).values(
            faltantes.map(p => ({
              professorId: p.id, mesReferencia: input.mesReferencia,
              valorEsperado: p.valorBolsaMensal, status: "pendente" as const,
            }))
          );
        }

        const rows = await db.select({
          id: pagamentosProfessores.id, professorId: pagamentosProfessores.professorId,
          professorNome: professores.nomeCompleto, professorPix: professores.chavePix,
          mesReferencia: pagamentosProfessores.mesReferencia,
          valorEsperado: pagamentosProfessores.valorEsperado, valorPago: pagamentosProfessores.valorPago,
          dataPagamento: pagamentosProfessores.dataPagamento, formaPagamento: pagamentosProfessores.formaPagamento,
          status: pagamentosProfessores.status, observacoes: pagamentosProfessores.observacoes,
        }).from(pagamentosProfessores)
          .leftJoin(professores, eq(pagamentosProfessores.professorId, professores.id))
          .where(and(eq(pagamentosProfessores.mesReferencia, input.mesReferencia), inArray(pagamentosProfessores.professorId, profIds)))
          .orderBy(professores.nomeCompleto);

        return rows;
      }),

    registerPayment: adminProcedure
      .input(z.object({
        id: z.number(),
        valorPago: z.string(),
        dataPagamento: z.string(),
        formaPagamento: formaPagamentoEnum,
        observacoes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pagamentosProfessores).set({
          valorPago: input.valorPago,
          dataPagamento: new Date(input.dataPagamento),
          formaPagamento: input.formaPagamento,
          observacoes: input.observacoes,
          status: "pago",
          registradoPor: ctx.user.id,
        }).where(eq(pagamentosProfessores.id, input.id));
        return { success: true };
      }),

    updateStatus: adminProcedure
      .input(z.object({ id: z.number(), status: z.enum(["pendente", "pago", "atrasado"]) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await db.update(pagamentosProfessores).set({ status: input.status }).where(eq(pagamentosProfessores.id, input.id));
        return { success: true };
      }),
  }),
});

/** Valida a regra: no máximo 1 modalidade do grupo exclusivo (Canto/Violão/Dança) por aluno. */
async function validateModalidadeSelection(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, modalidadeIds: number[]) {
  if (modalidadeIds.length === 0) return;
  const mods = await db.select().from(modalidades).where(inArray(modalidades.id, modalidadeIds));
  const exclusivas = mods.filter(m => m.grupoExclusivo);
  if (exclusivas.length > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Só é possível escolher uma modalidade entre ${exclusivas.map(m => m.nome).join(", ")} — elas ocorrem no mesmo horário.`,
    });
  }
}
