// Cliente HTTP fino que fala com as rotas /api/mcp/* do SingularOS.
// O Personal Access Token (PAT) e a URL base vêm de variáveis de ambiente
// configuradas pelo usuário no claude_desktop_config.json — o token NUNCA é
// embutido no código nem trafega para outro lugar além da própria instância.

const BASE_URL = (process.env.SINGULAR_API_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.SINGULAR_TOKEN ?? "";

export function assertConfig() {
  if (!BASE_URL) throw new Error("Variável SINGULAR_API_URL não configurada");
  if (!TOKEN) throw new Error("Variável SINGULAR_TOKEN não configurada");
}

type Method = "GET" | "POST" | "PATCH";

export async function api(method: Method, path: string, body?: unknown) {
  assertConfig();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: string;
  };

  if (!res.ok) {
    throw new Error(json.error ?? `Erro ${res.status} ao chamar ${path}`);
  }
  return json.data;
}
