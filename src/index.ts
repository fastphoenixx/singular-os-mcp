#!/usr/bin/env node
// Servidor MCP local (stdio) do SingularOS.
// Expõe ferramentas de leitura e escrita que o Claude (ou outro cliente MCP)
// pode usar para consultar e operar a instância do usuário. Toda chamada é
// proxyada via HTTPS autenticada (Bearer PAT) para as rotas /api/mcp/* do app.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./api.js";

const server = new McpServer({ name: "singular-os", version: "0.1.0" });

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: msg }], isError: true };
}

const STATUS_TAREFA = ["backlog", "todo", "doing", "done"] as const;
const STATUS_PROJETO = ["em_andamento", "pausado", "concluido", "cancelado"] as const;
const PRIORIDADE = ["baixa", "media", "alta", "urgente"] as const;

// ---------- Leitura ----------

server.registerTool(
  "listar_clientes",
  {
    title: "Listar clientes",
    description: "Lista os clientes ativos da empresa do usuário.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("GET", "/api/mcp/clientes"));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "listar_projetos",
  {
    title: "Listar projetos",
    description: "Lista os projetos da empresa, com o cliente vinculado.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("GET", "/api/mcp/projetos"));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "listar_tarefas",
  {
    title: "Listar tarefas de um projeto",
    description: "Lista as tarefas (kanban) de um projeto específico, ordenadas.",
    inputSchema: {
      projeto_id: z.string().uuid().describe("ID do projeto"),
    },
  },
  async ({ projeto_id }) => {
    try {
      const qs = new URLSearchParams({ projeto_id }).toString();
      return ok(await api("GET", `/api/mcp/tarefas?${qs}`));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "listar_negociacoes",
  {
    title: "Listar negociações",
    description: "Lista as negociações (pipeline comercial) da empresa.",
    inputSchema: {},
  },
  async () => {
    try {
      return ok(await api("GET", "/api/mcp/negociacoes"));
    } catch (err) {
      return fail(err);
    }
  },
);

// ---------- Escrita ----------

server.registerTool(
  "criar_cliente",
  {
    title: "Criar cliente",
    description:
      "Cria um novo cliente ativo (com contato) na empresa. Use para cadastrar clientes do lado comercial.",
    inputSchema: {
      nome: z.string().min(1).describe("Nome do cliente"),
      telefone: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      cnpj: z.string().optional().nullable(),
      cpf: z.string().optional().nullable(),
      razao_social: z.string().optional().nullable(),
      nome_fantasia: z.string().optional().nullable(),
      endereco: z.string().optional().nullable(),
      cidade: z.string().optional().nullable(),
      estado: z.string().optional().nullable(),
      cep: z.string().optional().nullable(),
      segmento: z.string().optional().nullable(),
      origem: z.string().optional().nullable(),
      valor_mensal: z.number().optional().nullable(),
      pacote_nome: z.string().optional().nullable(),
    },
  },
  async (args) => {
    try {
      return ok(await api("POST", "/api/mcp/clientes", args));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "criar_projeto",
  {
    title: "Criar projeto",
    description: "Cria um novo projeto vinculado a um cliente ativo.",
    inputSchema: {
      cliente_ativo_id: z.string().uuid().describe("ID do cliente ativo"),
      nome: z.string().min(1).describe("Nome do projeto"),
      descricao: z.string().optional().nullable(),
      status: z.enum(STATUS_PROJETO).optional(),
      data_entrega_prevista: z
        .string()
        .optional()
        .nullable()
        .describe("Data prevista de entrega (ISO, ex: 2026-06-30)"),
    },
  },
  async (args) => {
    try {
      return ok(await api("POST", "/api/mcp/projetos", args));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "criar_tarefa",
  {
    title: "Criar tarefa de projeto",
    description: "Cria uma nova tarefa no kanban de um projeto.",
    inputSchema: {
      projeto_id: z.string().uuid().describe("ID do projeto"),
      titulo: z.string().min(1).describe("Título da tarefa"),
      descricao: z.string().optional().nullable(),
      status: z.enum(STATUS_TAREFA).optional().describe("Coluna do kanban (default: todo)"),
      prioridade: z.enum(PRIORIDADE).optional().describe("Prioridade (default: media)"),
      prazo: z.string().optional().nullable().describe("Prazo (ISO, ex: 2026-06-30)"),
      responsavel_id: z.string().uuid().optional().nullable().describe("ID do usuário responsável"),
    },
  },
  async (args) => {
    try {
      return ok(await api("POST", "/api/mcp/tarefas", args));
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "mover_tarefa",
  {
    title: "Mover tarefa",
    description: "Move uma tarefa para outra coluna do kanban (e opcionalmente reordena).",
    inputSchema: {
      id: z.string().uuid().describe("ID da tarefa"),
      status: z.enum(STATUS_TAREFA).describe("Coluna de destino"),
      ordem: z.number().int().optional().describe("Posição na coluna (opcional)"),
    },
  },
  async (args) => {
    try {
      return ok(await api("PATCH", "/api/mcp/tarefas", args));
    } catch (err) {
      return fail(err);
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr não polui o protocolo stdio (que usa stdout).
  console.error("SingularOS MCP server rodando (stdio).");
}

main().catch((err) => {
  console.error("Falha ao iniciar o SingularOS MCP server:", err);
  process.exit(1);
});
