# AgroSmart MVP — Gestão Inteligente para Pequenos Produtores

Sistema web que reúne **monitoramento climático (IoT)**, **estoque**, **vendas**, **plantios** e um
**assistente de IA** (Google Gemini) que responde com base nos dados do próprio produtor.

Este README é o guia para **desenvolvedores**: como preparar a máquina, rodar o projeto, testar e
contribuir. O desenho do CI/CD e do deploy está em [`docs/cicd.md`](docs/cicd.md).

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Estrutura do repositório](#estrutura-do-repositório)
3. [Pré-requisitos](#pré-requisitos)
4. [Configuração inicial](#configuração-inicial)
5. [Rodar em modo desenvolvimento](#rodar-em-modo-desenvolvimento)
6. [Testes e qualidade](#testes-e-qualidade)
7. [Rodar com Docker](#rodar-com-docker)
8. [Demonstração: alertas da automação](#demonstração-alertas-da-automação)
9. [Configuração (variáveis e segredos)](#configuração-variáveis-e-segredos)
10. [API](#api)
11. [Problemas comuns](#problemas-comuns)
12. [Fluxo de contribuição e CI/CD](#fluxo-de-contribuição-e-cicd)
13. [Equipe](#equipe)

---

## Visão geral

```
                 ┌──────────────────────────────┐
 Navegador ────▶ │ Front (React + Vite)         │  dev: http://localhost:5173
                 │ chama /api/v1 (relativo)     │  container: nginx na porta 80
                 └──────────────┬───────────────┘
                                │ /api/*  (proxy do Vite em dev, nginx no container)
                 ┌──────────────▼───────────────┐      ┌──────────────────────┐
 Simulador IoT ─▶│ API (FastAPI)                │ ───▶ │ Google Gemini (chat, │
 (POST telemetria)│ regras, estoque, vendas,    │      │ resumo do dia)       │
                 │ plantios, alertas, IA        │      └──────────────────────┘
                 └──────────────┬───────────────┘      ┌──────────────────────┐
                                │                 ───▶ │ Open-Meteo (previsão │
                         SQLite (agrosmart.db)         │ 7 dias, sem chave)   │
                                                       └──────────────────────┘
```

**Abas do sistema:**

| Aba | O que mostra |
|---|---|
| Visão geral | Tela inicial: receita dos últimos 30 dias, Resumo do dia, leitura atual dos sensores, próximas colheitas, estoque em risco e receita por produto |
| Clima & IoT | Sensores em tempo real, previsão de 7 dias, condições por cultura e alertas da automação |
| Plantios | Talhões, fases, calendário de colheita e ficha técnica de cada cultura |
| Vendas | Registro de vendas, lucro, tendência de 30 dias e receita mensal por produto |
| Dashboard Comercial | Valor em estoque, capital em risco por validade e margens |
| Gestão de Estoque | Cadastro de produtos, preços e validades |
| Assistente IA | Perguntas feitas ao chat, avaliações 👍/👎 e de qual aba vieram |

O **Resumo do dia** (gerado pela IA) fica na Visão geral. Em todas as abas, o botão **Perguntar ao
assistente**, no canto inferior, abre o chat num painel lateral.

Na primeira subida, a API cria o banco e popula **dados de demonstração** (5 produtos, ~6 meses de
vendas, 6 plantios e uma propriedade em Atibaia-SP).

---

## Estrutura do repositório

```text
.
├── back/                       # API (FastAPI + SQLAlchemy + SQLite)
│   ├── main.py                 # toda a API: modelos, regras, endpoints e IA
│   ├── dados/culturas.json     # ficha técnica das culturas (base de conhecimento da IA)
│   ├── tests/                  # testes (pytest), sem acesso à internet
│   ├── .env.example            # modelo do back/.env (chave do Gemini)
│   └── Dockerfile              # imagem da API (também roda o simulador)
├── front_teste/agrosmart-web/  # Front (React 18 + Vite + Tailwind + Recharts)
│   ├── src/components/         # uma tela por arquivo + ChatWidget e ResumoDia
│   ├── src/api.js              # base da API (/api/v1)
│   ├── nginx.conf.template     # nginx do container (serve o build e repassa /api)
│   └── Dockerfile
├── iot-simulator/              # simulador dos sensores (envia leituras a cada 5 s)
├── deploy/
│   ├── hml/compose.yml         # homologação (Portainer) — imagem trocada pelo CI
│   ├── prod/compose.yml        # produção (Portainer) — trocada por PR de versão
│   └── local/                  # overrides para rodar os composes na sua máquina
├── docs/cicd.md                # CI/CD e deploy
├── docker-compose.yml          # stack local construída a partir do código
├── requirements.txt            # dependências da API
└── requirements-dev.txt        # + dependências de teste
```

---

## Pré-requisitos

| Ferramenta | Versão | Para quê |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.13+ | API, simulador e testes |
| [Node.js](https://nodejs.org/) | 22+ (com npm) | Front |
| [Git](https://git-scm.com/) | qualquer recente | — |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | opcional | Rodar tudo em containers, igual à produção |
| Chave do Gemini | opcional | Chat e Resumo do dia. Grátis em https://aistudio.google.com/apikey |

Sem a chave do Gemini, tudo funciona, exceto o chat (responde que a IA está indisponível) e o
Resumo do dia (cai para um resumo automático por regras).

---

## Configuração inicial

Faça uma vez, a partir da raiz do repositório.

**1. Clonar**

```bash
git clone https://github.com/Rodrigo050705/gs2_2026.git
```

```bash
cd gs2_2026
```

**2. Ambiente Python (venv) e dependências**

```bash
python -m venv .venv
```

Ative o venv — Linux/macOS:

```bash
source .venv/bin/activate
```

Windows (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

E instale (inclui as dependências de teste):

```bash
pip install -r requirements-dev.txt
```

> No Windows, se `python` não for encontrado, use `py` no lugar (ex.: `py -m venv .venv`). Se o
> PowerShell bloquear o `Activate.ps1`, veja [Problemas comuns](#problemas-comuns).

**3. Dependências do front**

```bash
npm --prefix front_teste/agrosmart-web ci
```

**4. Chave da IA (opcional)**

Copie o modelo e coloque a sua chave:

```bash
cp back/.env.example back/.env
```

```dotenv
# back/.env  (nunca vai para o Git)
GEMINI_API_KEY=sua-chave-aqui
```

---

## Rodar em modo desenvolvimento

Três terminais, todos a partir da raiz do repositório e com o venv ativo. A API e o front recarregam
sozinhos quando você salva um arquivo.

**Terminal 1 — API** (http://127.0.0.1:8000, documentação interativa em http://127.0.0.1:8000/docs).
Rode de dentro de `back/` (o banco `agrosmart.db` é criado na pasta atual):

```bash
cd back
```

```bash
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Simulador IoT** (uma leitura a cada 5 s)

```bash
python iot-simulator/iot_simulator.py --url http://127.0.0.1:8000/api/v1/telemetria
```

**Terminal 3 — Front** (http://localhost:5173)

```bash
npm --prefix front_teste/agrosmart-web run dev
```

O front chama `/api/v1` (caminho relativo) e o Vite repassa para a API na porta 8000
([`vite.config.js`](front_teste/agrosmart-web/vite.config.js)), então não há URL de API para configurar.

**Recomeçar com dados limpos:** pare a API, apague `back/agrosmart.db` e suba de novo — os dados de
demonstração são recriados.

---

## Testes e qualidade

São os mesmos passos que o CI roda em todo PR.

**API** — pytest com banco temporário; o Gemini e a Open-Meteo são substituídos por dublês, então
não precisa de chave nem de internet:

```bash
pytest back
```

**Front** — lint (oxlint) e build:

```bash
npm --prefix front_teste/agrosmart-web run lint
```

```bash
npm --prefix front_teste/agrosmart-web run build
```

Ao mudar uma regra ou endpoint, acrescente um teste em `back/tests/` (há exemplos de dublê da IA em
`test_chat_historico.py` e `test_resumo_dia.py`).

---

## Rodar com Docker

Três jeitos, do mais simples ao mais próximo da produção. Todos precisam do Docker Desktop rodando.

### a) Stack local construída a partir do código

```bash
docker compose up --build
```

Abre em **http://localhost:8080**. A chave da IA vem de `back/.env`.

### b) Igual à produção, com imagens construídas localmente

Usa o [`deploy/prod/compose.yml`](deploy/prod/compose.yml) sem alteração, mais o override
[`deploy/local/compose.yml`](deploy/local/compose.yml), que troca só as imagens e a pasta de segredos.

```bash
docker build -f back/Dockerfile -t agrosmart-api:local .
```

```bash
docker build -t agrosmart-web:local front_teste/agrosmart-web
```

```bash
docker compose -f deploy/prod/compose.yml -f deploy/local/compose.yml up
```

Abre em **http://localhost:8093**.

### c) Com as imagens publicadas no GHCR (as mesmas da homologação)

Baixa as imagens que o CI publicou (a tag está em [`deploy/hml/compose.yml`](deploy/hml/compose.yml))
e troca só a pasta de segredos, com o override [`deploy/local/segredos.yml`](deploy/local/segredos.yml).
Os pacotes são públicos: não precisa de `docker login`.

```bash
docker compose -f deploy/hml/compose.yml -f deploy/local/segredos.yml up
```

Abre em **http://localhost:8092**.

**Segredo para (b) e (c):** crie o arquivo `deploy/local/segredos/GEMINI_API_KEY` contendo só a
chave, sem quebra de linha (a pasta está no `.gitignore`). Sem ele, tudo sobe, menos a IA.

**Parar e apagar o banco** de uma dessas stacks: o mesmo comando do `up`, trocando `up` por `down -v`.

---

## Demonstração: alertas da automação

A automação compara cada leitura dos sensores com a **ficha técnica de cada cultura plantada**
(`back/dados/culturas.json`) e gera alertas só para condições **críticas**. No modo normal, o
simulador fica dentro das faixas e não gera alertas. Para forçar uma leitura crítica (calor de ~38 °C
e solo seco):

```bash
python iot-simulator/iot_simulator.py --anomalia --url http://127.0.0.1:8000/api/v1/telemetria
```

Na aba **Clima & IoT** aparece um alerta por cultura e condição (ex.: *"Alface (Talhão 2A, Talhão 2B):
38,5 °C, acima do limite crítico de 30 °C"*), com botão **Resolver**.

- A mesma condição da mesma cultura **não se repete por 6 horas** (mesmo depois de resolvida). Para
  repetir a demonstração antes disso, recomece com dados limpos.
- Nas stacks Docker, rode o simulador de dentro do container (no Git Bash, prefixe com
  `MSYS_NO_PATHCONV=1`):

```bash
docker exec agrosmart-prod-simulador-1 python /app/iot-simulator/iot_simulator.py --anomalia --url http://api:8000/api/v1/telemetria
```

---

## Configuração (variáveis e segredos)

| Variável | Padrão | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | — | Chave da IA. Em dev, no `back/.env`; nos containers, um arquivo em `/run/secrets` |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Modelo principal (há modelos de reserva se ele falhar) |
| `DATABASE_URL` | `sqlite:///./agrosmart.db` | Banco. No container: `sqlite:////data/agrosmart.db` (volume) |
| `SECRETS_DIR` | `/run/secrets` | Pasta de segredos *key-per-file*: o nome do arquivo é a variável e vale mais que o ambiente |
| `VITE_API_URL` (front) | `/api/v1` | Só se o front precisar falar com uma API em outro endereço |

A ficha técnica das culturas fica em `back/dados/culturas.json` e é relida a cada chamada: editar o
arquivo vale sem reiniciar a API. Os valores são **aproximados** e precisam de validação agronômica.

---

## API

Com a API rodando, a referência completa e interativa está em **http://127.0.0.1:8000/docs**. Os grupos:

| Grupo | Endpoints principais |
|---|---|
| Saúde | `GET /health` |
| Sensores e alertas | `POST/GET /api/v1/telemetria`, `GET /api/v1/alertas`, `PUT /api/v1/alertas/{id}/resolver`, `POST /api/v1/alertas/resolver-todos`, `GET /api/v1/automacao/limites` |
| Estoque | `GET/POST /api/v1/produtos`, `PUT/DELETE /api/v1/produtos/{id}`, `GET /api/v1/dashboard/comercial` |
| Vendas | `POST/GET /api/v1/vendas`, `GET /api/v1/vendas/resumo` |
| Propriedade e clima | `GET/PUT /api/v1/produtores/{id}`, `GET /api/v1/previsao` |
| Plantios | `GET/POST /api/v1/plantios`, `PUT/DELETE /api/v1/plantios/{id}`, `GET /api/v1/plantios/calendario` |
| Culturas | `GET /api/v1/culturas`, `GET /api/v1/culturas/{nome}`, `GET /api/v1/culturas/{nome}/condicoes` |
| IA | `POST /api/v1/chat`, `GET /api/v1/resumo-dia`, `POST /api/v1/chat/{id}/feedback`, `GET /api/v1/chat/interacoes`, `GET /api/v1/chat/estatisticas` |

---

## Problemas comuns

| Sintoma | Causa e solução |
|---|---|
| `npm : ... npm.ps1 cannot be loaded because running scripts is disabled` | Política de execução do PowerShell. Use `npm.cmd` no lugar de `npm` (ex.: `npm.cmd run dev`), ou rode pelo Git Bash/cmd. O mesmo vale para o `Activate.ps1`: use `.venv\Scripts\python.exe` direto |
| `python` abre a Microsoft Store / não é encontrado | No Windows, use `py` (ex.: `py -m venv .venv`) ou o Python do venv: `.venv\Scripts\python.exe` |
| Chat responde "A IA está sobrecarregada" | Pico de demanda no Gemini. A API já tenta modelos de reserva; espere alguns segundos e tente de novo |
| Chat responde "chave da IA é inválida" | `GEMINI_API_KEY` ausente ou errada em `back/.env` (dev) ou no arquivo de segredo (Docker). Reinicie a API depois de trocar |
| Simulador mostra `[OFFLINE]` | A API não está no ar. Use `--url http://127.0.0.1:8000/...` (alguns Windows resolvem `localhost` para IPv6) |
| `ImportError: DLL load failed ... filename or extension is too long` | O caminho da pasta do projeto passou de 260 caracteres. Clone numa pasta de caminho curto (ex.: `D:\projects\gs2_2026`) |
| `docker exec ... can't open file 'C:/Program Files/Git/app/...'` | O Git Bash converteu o caminho. Prefixe o comando com `MSYS_NO_PATHCONV=1` |
| Alertas não aparecem na demonstração | A mesma condição não se repete por 6 h. Recomece com dados limpos |

---

## Fluxo de contribuição e CI/CD

1. Crie um branch a partir da `main` (`feature/…`, `fix/…`, `docs/…`).
2. Rode os [testes e o lint](#testes-e-qualidade) antes de abrir o PR.
3. Abra o PR para a `main`. O **CI** roda `testes-api` (pytest) e `testes-web` (lint + build); os
   dois precisam passar.
4. No **merge na `main`**, o CI publica as imagens `sha-<7>` no GHCR e atualiza
   `deploy/hml/compose.yml` — o Portainer sobe a **homologação**.
5. Uma **tag `vX.Y.Z`** promove as mesmas imagens e abre um PR trocando `deploy/prod/compose.yml`; o
   merge desse PR põe a versão em **produção**.

Detalhes, decisões e o passo a passo de infraestrutura: [`docs/cicd.md`](docs/cicd.md).

**Mudanças no banco:** não há Alembic. Tabelas novas são criadas sozinhas (`create_all`); **colunas
novas em tabelas existentes** precisam entrar em `garantir_colunas_novas()` no `back/main.py`
(somente mudanças aditivas).

**Nunca commite** `back/.env`, `deploy/local/segredos/` nem `*.db` — já estão no `.gitignore`.

---

## Equipe

* **Rodrigo:** Automação IoT, motor de regras e dashboards analíticos (Clima e Comercial).
* **Matheus:** Arquitetura Backend (CRUD de Estoque, banco de dados e integração com IA).
* **Vitória:** Experiência Digital (UI/UX e integração das telas em React).
* **Bia:** Roteirização, gravação e edição do vídeo demonstrativo do MVP.
* **Dionísio:** Documentação técnica, diagramas de arquitetura e governança/DevOps.
