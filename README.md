# singular-os-mcp

Servidor [MCP](https://modelcontextprotocol.io) local (stdio) que conecta o
**SingularOS** ao Claude (Desktop, Code) e a qualquer outro cliente compatível
com o Model Context Protocol.

Ele expõe ferramentas de **leitura** e **escrita** que rodam na sua própria
máquina e falam com a instância do SingularOS via HTTPS autenticado por um
**Personal Access Token (PAT)**. O token fica só na sua máquina — nunca é
embutido no código nem enviado para terceiros.

> Sem um **Personal Access Token (PAT)** válido — gerado dentro de uma instância
> do SingularOS por um usuário autenticado — o servidor não faz nada. Clonar
> ou instalar o pacote não dá acesso a dado nenhum.
>
> ⚠️ **Instale só a partir deste repositório oficial** (`github.com/fastphoenixx/singular-os-mcp`).
> Forks de terceiros podem ter sido modificados para exfiltrar tokens.

## Como funciona

```
Claude  ──stdio──▶  singular-os-mcp (local)  ──HTTPS + Bearer PAT──▶  /api/mcp/* (SingularOS)
```

Cada usuário gera o seu próprio token na interface do SingularOS e roda o seu
próprio servidor local. O isolamento por empresa (`empresa_id`) é garantido
pelo backend a partir do token — você só enxerga os dados da sua empresa.

## 1. Gerar o token de acesso

1. Entre no SingularOS (`https://singular-os.vercel.app`) → **Perfil** → **Tokens de API / MCP**.
2. Clique em **Criar token**, dê um nome (ex: "Claude no meu notebook").
3. Escolha o escopo:
   - **Leitura** — só consulta dados.
   - **Leitura + escrita** — também cria clientes, projetos e tarefas.
4. Copie o token (`sg_pat_…`) **na hora** — ele só é exibido uma vez.

## 2. Configurar o Claude Desktop

Edite o arquivo de configuração do Claude Desktop:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

Adicione a entrada `singular-os` em `mcpServers`. O `npx` clona o repo público
e builda na hora (precisa de `git` e Node 20+ instalados):

```json
{
  "mcpServers": {
    "singular-os": {
      "command": "npx",
      "args": ["-y", "github:fastphoenixx/singular-os-mcp"],
      "env": {
        "SINGULAR_API_URL": "https://singular-os.vercel.app",
        "SINGULAR_TOKEN": "sg_pat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Reinicie o Claude Desktop. As ferramentas do SingularOS aparecerão disponíveis.

Para atualizar para a versão mais nova do repo, limpe o cache do npx
(`rm -rf ~/.npm/_npx`) e reinicie o Claude — o `npx` vai re-clonar e re-buildar.

### Variáveis de ambiente

| Variável            | Descrição                                              |
| ------------------- | ------------------------------------------------------ |
| `SINGULAR_API_URL`  | URL base do SingularOS (sem `/` final)                 |
| `SINGULAR_TOKEN`    | O Personal Access Token gerado no passo 1 (`sg_pat_…`) |

### Alternativa: clone manual (caso o `npx` falhe)

Útil para desenvolvimento ou em ambientes sem `git` disponível pro `npx`:

```bash
git clone https://github.com/fastphoenixx/singular-os-mcp.git
cd singular-os-mcp
npm install
npm run build
```

E na config do Claude, aponte o `command` para o build local:

```json
{
  "mcpServers": {
    "singular-os": {
      "command": "node",
      "args": ["/caminho/absoluto/para/singular-os-mcp/dist/index.js"],
      "env": {
        "SINGULAR_API_URL": "https://singular-os.vercel.app",
        "SINGULAR_TOKEN": "sg_pat_xxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

## Ferramentas disponíveis

### Leitura

| Ferramenta            | O que faz                                          |
| --------------------- | -------------------------------------------------- |
| `listar_clientes`     | Lista os clientes ativos da empresa                |
| `listar_projetos`     | Lista os projetos (com cliente vinculado)          |
| `listar_tarefas`      | Lista as tarefas de um projeto (`projeto_id`)      |
| `listar_negociacoes`  | Lista as negociações do pipeline comercial         |

### Escrita _(requer escopo "Leitura + escrita")_

| Ferramenta       | O que faz                                               |
| ---------------- | ------------------------------------------------------- |
| `criar_cliente`  | Cadastra um novo cliente ativo (com contato)            |
| `criar_projeto`  | Cria um projeto vinculado a um cliente                  |
| `criar_tarefa`   | Cria uma tarefa no kanban de um projeto                 |
| `mover_tarefa`   | Move/reordena uma tarefa entre colunas do kanban        |

Para guia detalhado de **quando** usar cada ferramenta e como combiná-las (ex:
obter `cliente_ativo_id` via `listar_clientes` antes de `criar_projeto`),
veja [AGENTS.md](./AGENTS.md).

## Segurança

> ⚠️ **O token fica em texto puro no seu `claude_desktop_config.json`.** Esse
> arquivo não é criptografado: qualquer pessoa ou processo com acesso de leitura
> à sua máquina consegue ler o `SINGULAR_TOKEN` e agir como você (incluindo
> escrita, se o escopo permitir). Trate-o como uma senha:
>
> - Use uma conta de SO protegida e disco com criptografia (FileVault, BitLocker, LUKS).
> - **Nunca** versione, faça backup público nem compartilhe esse arquivo.
> - Prefira o escopo **somente leitura** quando não precisar escrever.
> - Se a máquina for comprometida ou o config vazar, **revogue o token na hora**.

- O token tem prefixo `sg_pat_` e é guardado no backend apenas como hash
  SHA-256 — o valor em claro nunca é persistido no servidor.
- Tokens expiram em **90 dias por padrão**; escolha "Nunca expira" só se realmente
  precisar. Rotacione periodicamente.
- O backend aplica **rate limiting por token** (60 req / 60s) e registra todas
  as **escritas** numa trilha de auditoria (qual token fez qual ação, quando).
- Revogue um token a qualquer momento em **Perfil → Tokens de API / MCP**.

## Compatibilidade

- Node.js >= 20 (testado em 20 e 22).
- MCP SDK 1.29.x.
- Stdio transport (Claude Desktop, Claude Code, e qualquer cliente MCP compatível).
