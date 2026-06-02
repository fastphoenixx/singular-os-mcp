# AGENTS.md — guia pra IA usar o SingularOS MCP

Este arquivo é lido automaticamente por agentes de IA (Claude Code, etc.).
Ele descreve **o que o servidor faz**, **quando usar cada ferramenta** e os
padrões corretos pra combiná-las.

## Contexto

O SingularOS é um SaaS multi-empresa de CRM/projetos. Esta MCP expõe um
subconjunto das operações do SingularOS via HTTPS autenticado. Toda chamada:

- Roda no escopo de **uma única empresa** (derivada do token do usuário).
- É autenticada por um **Personal Access Token (PAT)** com prefixo `sg_pat_`.
- Carrega o `scope` do token: `read` (só leitura) ou `read_write` (leitura + escrita).
- É **rate-limited** (60 requisições por minuto, por token).
- Se for escrita, é **registrada em trilha de auditoria** com `user_id`, `token_id`,
  `action`, `resource_id`, `timestamp`.

## Modelo de dados (resumido)

- **Cliente ativo** (`clientes_ativos`) — um cliente em produção. Sempre tem um
  **Contato** (`contatos`) com nome, e-mail, telefone, CPF/CNPJ.
- **Projeto** (`projetos`) — pertence a um cliente ativo, tem nome, status
  (`em_andamento` | `pausado` | `concluido` | `cancelado`), prazo opcional.
- **Tarefa** (`tarefas_projeto`) — pertence a um projeto, tem status (kanban:
  `backlog` | `todo` | `doing` | `done`), prioridade (`baixa` | `media` |
  `alta` | `urgente`), responsável opcional, ordem dentro da coluna.
- **Negociação** (`negociacoes`) — pipeline comercial, anterior ao cliente ativo.

## Quando usar cada ferramenta

### Leitura — sempre comece por aqui antes de qualquer escrita

| Ferramenta | Quando usar |
| --- | --- |
| `listar_clientes` | Quando precisar dos `id` (chamado `cliente_ativo_id` em escritas) e nomes dos clientes da empresa. **Pré-requisito** pra `criar_projeto`. |
| `listar_projetos` | Quando precisar dos `id` e nomes dos projetos. **Pré-requisito** pra `listar_tarefas`, `criar_tarefa`. |
| `listar_tarefas` | Quando precisar do estado atual de um projeto (kanban completo, ordens). **Pré-requisito** pra `mover_tarefa` (precisa do `id` da tarefa e da coluna atual). |
| `listar_negociacoes` | Quando o usuário perguntar sobre pipeline, oportunidades comerciais ou status de fechamento. |

### Escrita — só com escopo `read_write`

| Ferramenta | Quando usar | Pré-requisito |
| --- | --- | --- |
| `criar_cliente` | Cadastrar um novo cliente ativo + contato em um único passo. | Nenhum — `nome` é obrigatório. |
| `criar_projeto` | Criar um projeto vinculado a um cliente existente. | `cliente_ativo_id` (de `listar_clientes`). |
| `criar_tarefa` | Adicionar uma tarefa ao kanban de um projeto. | `projeto_id` (de `listar_projetos`). |
| `mover_tarefa` | Mudar tarefa de coluna (kanban) e/ou reordenar. | `id` da tarefa (de `listar_tarefas`). |

## Convenções importantes

- **IDs são UUIDs.** Nunca invente, nunca chute. Sempre obtenha o `id` chamando
  o `listar_*` correspondente antes da escrita.
- **Datas são strings ISO 8601** (`YYYY-MM-DD` ou ISO completo). Ex: `"2026-06-30"`.
- **Enums devem casar exatamente.** Status de projeto: `em_andamento`, `pausado`,
  `concluido`, `cancelado`. Status de tarefa: `backlog`, `todo`, `doing`, `done`.
  Prioridade: `baixa`, `media`, `alta`, `urgente`.
- **Campos opcionais** podem ser omitidos. Não envie `null` ou string vazia
  se não tiver o valor.
- **Multi-tenancy** é automática — você nunca precisa (e nem pode) passar
  `empresa_id`. O backend deriva isso do token.

## Padrões de fluxo

### "Crie um projeto pro cliente Acme com prazo pra 30/06"

```
1. listar_clientes
   → encontre o item com nome "Acme", pegue o id (= cliente_ativo_id)
2. criar_projeto
   { cliente_ativo_id: <id>, nome: "Projeto Acme",
     data_entrega_prevista: "2026-06-30" }
```

Se não houver cliente "Acme", **pare e pergunte** se quer cadastrar via
`criar_cliente`, em vez de inventar um nome diferente.

### "Mova a tarefa 'Revisar contrato' pra Concluído"

```
1. listar_projetos
   → identifique o projeto que provavelmente contém a tarefa
2. listar_tarefas { projeto_id: <id> }
   → encontre a tarefa pelo título, pegue o id
3. mover_tarefa { id: <id>, status: "done" }
```

Se houver mais de uma tarefa com título similar em projetos diferentes,
**confirme com o usuário** antes de mover qualquer uma.

### "Qual o status do pipeline?"

```
1. listar_negociacoes
   → agrupe por status / estágio e resuma.
```

## Tratamento de erros

| HTTP | O que significa | O que fazer |
| --- | --- | --- |
| **400** | `Dados inválidos` ou validação de negócio (ex: `Cliente não encontrado`). O `error` é seguro pra mostrar ao usuário. | Corrija o input e tente de novo. Não retente cegamente — o problema é o payload. |
| **401** | Token ausente, inválido, expirado ou revogado. | Pare. Avise o usuário pra gerar/configurar um token válido. **Não tente outras chamadas.** |
| **403** | Token tem escopo `read` mas a ferramenta pediu escrita. | Pare. Avise o usuário que essa operação precisa de token `read_write`. |
| **429** | Rate limit (60/min por token). | Aguarde ~30s antes de retentar. Não dispare várias chamadas em paralelo. |
| **500** | Erro interno (já sanitizado, sem stack trace). | Reporte ao usuário e pare. Não é problema de input — provavelmente algo do lado servidor. |

## Boas práticas

- **Confirme antes de escrever em massa.** Se o usuário pedir "crie 10 tarefas",
  liste-as primeiro pra confirmar antes de chamar `criar_tarefa` várias vezes.
- **Não vaze IDs nem `empresa_id` nas respostas pro usuário.** Use nomes.
  IDs só interessam internamente pro encadeamento.
- **Prefira uma chamada que retorna muito a várias chamadas pequenas.**
  `listar_projetos` retorna tudo da empresa de uma vez — não faça loop.
- **Não chute valores de enum.** Se o usuário disser "alta importância", mapeie
  pra `alta`. Se disser algo ambíguo ("urgentinho"), pergunte.
- **Respeite a auditoria.** Toda escrita fica registrada com seu token. Em caso
  de dúvida, leia (`listar_*`) em vez de escrever.

## O que **não** está disponível (ainda)

- Edição/exclusão de cliente, projeto ou tarefa (só criação por ora).
- Operações sobre negociações (só leitura).
- Operações administrativas (usuários, configurações, financeiro).
- Upload de arquivos.

Se o usuário pedir uma dessas, avise que a operação precisa ser feita na
interface web do SingularOS.
