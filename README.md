# API de Agendamento de Salas de Reunião (MVP)

API Web em **Node.js + Express** com **SQLite** e **Swagger (OpenAPI 3)**.
Acesso restrito a funcionários via **JWT**.

## Requisitos

- **Node.js 22.13 ou superior** (https://nodejs.org) — o SQLite vem embutido no Node, não precisa instalar banco.
- npm (já vem com o Node)

Confira com: `node --version`

## Passo a passo para subir a API

1. Abra um terminal e entre na pasta do projeto:
   ```bash
   cd meeting-rooms-api
   ```
2. Instale as dependências:
   ```bash
   npm install
   ```
3. (Opcional) Customize variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```
   Sem o `.env`, valores padrão de desenvolvimento são usados.
4. Suba a API:
   ```bash
   npm start
   ```
   Você deve ver:
   ```
   API no ar:  http://localhost:3000
   Swagger:    http://localhost:3000/docs
   ```
   Na primeira execução são criados automaticamente o banco (`./data/rooms.db`), o usuário admin e 3 salas de exemplo.

## Como acessar o Swagger

1. Abra no navegador: **http://localhost:3000/docs**
2. Abra `POST /auth/login` → **Try it out** → **Execute** com:
   ```json
   { "email": "admin@empresa.com", "password": "admin123" }
   ```
3. Copie o valor de `token` da resposta.
4. Clique em **Authorize** (cadeado, topo da página), cole o token (sem a palavra "Bearer") e confirme.
5. Pronto: todos os endpoints podem ser testados pela tela.

> O JSON da especificação também fica em `http://localhost:3000/openapi.json`.

## Fluxo de uso sugerido

1. (admin) `POST /employees` — cadastre os funcionários de cada time.
2. Cada funcionário faz login e usa o token.
3. `GET /rooms` — vê todas as salas, se estão **em uso agora** e qual é a **próxima reunião**.
4. `POST /bookings` — agenda a reunião:
   ```json
   { "roomId": 1, "title": "Planning", "start": "2026-11-10T14:00:00-03:00", "end": "2026-11-10T15:00:00-03:00" }
   ```
5. `PATCH /bookings/{id}/extend` — estende o término: `{ "end": "2026-11-10T16:00:00-03:00" }`
6. `DELETE /bookings/{id}` — cancela e libera o horário.
7. `GET /bookings?roomId=1&from=...&to=...` — agenda da sala.

## Endpoints

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/auth/register` | público | Cadastro de funcionário (nome, e-mail corporativo + senha) |
| POST | `/auth/login` | público | Login, retorna JWT |
| GET | `/me` | funcionário | Dados do usuário logado |
| GET/POST | `/employees` | admin | Lista / cadastra funcionários |
| GET | `/rooms` | funcionário | Salas + status "em uso" |
| POST | `/rooms` | admin | Cadastra sala |
| GET | `/bookings` | funcionário | Agenda (filtros `roomId`, `employeeId`, `from`, `to`) |
| POST | `/bookings` | funcionário | Agenda reunião |
| GET | `/bookings/{id}` | funcionário | Detalhe |
| PATCH | `/bookings/{id}/extend` | organizador/admin | Estende término |
| DELETE | `/bookings/{id}` | organizador/admin | Cancela |
| GET | `/health` | público | Healthcheck |

## Regras de negócio

| Regra | Como é atendida | Erro |
|---|---|---|
| RN1 – sem limite de duração | Nenhuma validação de duração máxima | — |
| RN2 – estender se livre | `PATCH /bookings/{id}/extend` verifica conflito entre o fim atual e o novo fim | `409 BOOKING_CONFLICT` |
| RN3 – sem datas passadas | `start` deve ser >= minuto atual | `422 PAST_DATE_NOT_ALLOWED` |
| RN4 – sem sobreposição | Verifica interseção na mesma sala; reuniões "encostadas" (14–15h e 15–16h) são permitidas | `409 BOOKING_CONFLICT` |

**Datas:** sempre ISO-8601 **com fuso** (ex.: `-03:00` ou `Z`). Datas sem fuso são recusadas (`400`) para evitar ambiguidade. A API responde sempre em UTC.

**Erros** seguem o formato `{ "error": { "code": "...", "message": "..." } }`.

## Cadastro de usuário

| Regra | Como é atendida | Erro |
|---|---|---|
| RN1 – e-mail do domínio da empresa | Domínio deve ser `@empresadorafa.com` (configurável) | `422 INVALID_EMAIL_DOMAIN` |
| RN2 – senha com no mínimo 8 caracteres | Validação no cadastro | `400 VALIDATION_ERROR` |
| RN3 – sem e-mail duplicado | Índice UNIQUE + checagem (sem diferenciar maiúsculas) | `409 EMPLOYEE_ALREADY_EXISTS` |

## Testes

```bash
npm test
```
Cobrem RN1–RN4, permissões, cancelamento e status das salas.

## Decisões do MVP

- **Acesso só de funcionários:** o auto-cadastro (`POST /auth/register`) só aceita e-mails do domínio `COMPANY_EMAIL_DOMAIN` (padrão `empresadorafa.com`), com senha de no mínimo 8 caracteres. O admin também pode criar contas. O token é revalidado no banco a cada requisição.
- **Concorrência:** SQLite embutido é síncrono e o Node é single-thread, então "verificar conflito + gravar" é atômico numa única instância.
- **Cancelar = apagar** a reunião (sem histórico).

## Produção (antes de publicar)

- Defina `NODE_ENV=production`, `JWT_SECRET` forte e `ADMIN_PASSWORD` diferente do padrão (a API se recusa a subir sem isso).
- Coloque atrás de HTTPS (proxy reverso).
- Para várias instâncias, migre para PostgreSQL (restrição de exclusão por intervalo).
- Evoluções naturais: SSO corporativo, reuniões recorrentes, notificações, histórico.
