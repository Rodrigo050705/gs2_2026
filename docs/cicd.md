# CI/CD do AgroSmart

Mesmo fluxo do **Chave44** e do **AlcoolGasolina**, com duas diferenças: é **autocontido** (o
compose do ambiente fica neste repositório, em [`deploy/`](../deploy), e não num repositório de
deploy separado) e **não há homologação** — só a produção no `infra.home`. O CI usa só o
`GITHUB_TOKEN` do próprio repositório.

```
PR                → testes da API (pytest, sem internet) e do front (lint + build)
merge na main     → testes → imagens ghcr.io/rodrigo050705/agrosmart-api:sha-abc1234
                                  e ghcr.io/rodrigo050705/agrosmart-web:sha-abc1234
                    → commit na main: deploy/prod/compose.yml passa a usar sha-abc1234
                    → o Portainer vê o commit (polling) e sobe a produção
```

Sem homologação, **o merge do PR é a aprovação da produção**: o PR precisa estar com o CI verde e
revisado. Para testar antes do merge, rode a stack de produção na sua máquina (abaixo).

| Tema | Decisão |
|---|---|
| Workflow | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): jobs `testes-api`, `testes-web`, `imagem` (matriz api/web), `deploy-prod` |
| Onde o deploy é descrito | [`deploy/prod/compose.yml`](../deploy/prod/compose.yml), neste repositório |
| Credenciais do CI | só o `GITHUB_TOKEN`. Commits feitos por ele não disparam workflows, então o commit do `deploy-prod` na `main` não gera outro ciclo de CI |
| Registry | GHCR do dono do repositório (`rodrigo050705`); push com o `GITHUB_TOKEN` |
| Tags | `sha-<7>` a cada merge. Nunca `latest`. As duas imagens sempre com a mesma tag |
| Imagens | `agrosmart-api` (FastAPI; a mesma imagem roda o simulador IoT com outro `command`) e `agrosmart-web` (nginx com o build do Vite) |
| Rede | um domínio e **uma porta**: o nginx do `web` serve o front e repassa `/api/` para o serviço `api`. Sem CORS e sem URL da API embutida no bundle |
| Ambiente | `agrosmart-prod` (porta **8093**, `agrosmart.gtlabs.com.br`) |
| Banco | SQLite no volume `dados` (`/data/agrosmart.db`). Os dados de demonstração são criados na primeira subida |
| Configuração | `environment` do compose para o que não é segredo; segredos em arquivos montados em `/run/secrets` (*key-per-file*: o nome do arquivo é a variável) |
| Acesso | login obrigatório (cookie de sessão `Secure`): o acesso precisa ser por **HTTPS** (Cloudflare + Caddy) |

## Testes no CI

| Job | O que roda |
|---|---|
| `testes-api` | `pytest` em `back/tests` com banco SQLite temporário. O Gemini e a Open-Meteo são substituídos por dublês: nada sai do runner e a chave da IA não é necessária |
| `testes-web` | `npm ci`, `npm run lint` (oxlint) e `npm run build` |

Localmente:

```bash
pip install -r requirements-dev.txt
```

```bash
cd back && pytest
```

## As imagens

```bash
docker build -f back/Dockerfile -t agrosmart-api:local .
```

```bash
docker build -t agrosmart-web:local front_teste/agrosmart-web
```

- **API** ([`back/Dockerfile`](../back/Dockerfile)): `python:3.13-slim`, dependências numa camada própria,
  usuário `app` com **UID 1654** (a mesma convenção de segredos dos outros apps no `infra.home`),
  `HEALTHCHECK` em `/health` (que também abre o banco).
- **Web** ([`front_teste/agrosmart-web/Dockerfile`](../front_teste/agrosmart-web/Dockerfile)): build no
  `node:22-alpine`, servido pelo `nginx:1.27-alpine`. O destino da API vem de `API_UPSTREAM`
  (padrão `api:8000`), aplicado no template do nginx na subida.

### Rodar localmente igual à produção

Usa o [`deploy/prod/compose.yml`](../deploy/prod/compose.yml) sem alteração, mais o override
[`deploy/local/compose.yml`](../deploy/local/compose.yml), que só troca o que depende do servidor:
as imagens (locais, no lugar das do GHCR) e a pasta de segredos (`deploy/local/segredos`, fora do
Git, no lugar de `/etc/docker/containers/agrosmart-prod/segredos`).

Crie em `deploy/local/segredos/` um arquivo por chave (só o valor, sem quebra de linha):
`GEMINI_API_KEY`, `ADMIN_USUARIO`, `ADMIN_SENHA` e `TELEMETRIA_TOKEN`. Depois:

```bash
docker compose -f deploy/prod/compose.yml -f deploy/local/compose.yml up
```

Abre em http://localhost:8093. Para parar e apagar o banco dessa stack:

```bash
docker compose -f deploy/prod/compose.yml -f deploy/local/compose.yml down -v
```

## Configuração

| Chave | Onde | O que é |
|---|---|---|
| `GEMINI_API_KEY` | arquivo em `segredos/` | chave da IA (Google AI Studio). Sem ela, tudo funciona menos o chat |
| `ADMIN_USUARIO` | arquivo em `segredos/` | login do primeiro usuário (criado só se o banco não tiver nenhum) |
| `ADMIN_SENHA` | arquivo em `segredos/` | senha dele, 10+ caracteres. Depois do primeiro login, pode trocar com `usuarios.py senha` e apagar o arquivo |
| `TELEMETRIA_TOKEN` | arquivo em `segredos/` | token do simulador/sensores (header `X-Dispositivo-Token`). API e simulador montam a mesma pasta |
| `DATABASE_URL` | compose | `sqlite:////data/agrosmart.db` |
| `GEMINI_MODEL` | compose (opcional) | troca o modelo principal (padrão `gemini-3.1-flash-lite`) |

## Passo a passo do que é feito à mão

### 1. Configurações do repositório (precisa do dono, Rodrigo050705)

1. **Proteção da `main`:** se um dia ela exigir PR para todo push, o `deploy-prod` deixa de conseguir
   commitar. Nesse caso, liberar o `github-actions[bot]` no bypass da regra.
2. **Pacotes do GHCR:** `agrosmart-api` e `agrosmart-web` já existem; precisam estar **públicos** (ou
   com *Read* para a conta do registry `ghcr` do Portainer).

### 2. Segredos no `infra.home`

```bash
sudo mkdir -p /etc/docker/containers/agrosmart-prod/segredos && cd /etc/docker/containers/agrosmart-prod/segredos
```

```bash
printf '%s' 'COLE_A_CHAVE_DO_GEMINI' | sudo tee GEMINI_API_KEY > /dev/null
```

```bash
printf '%s' 'admin' | sudo tee ADMIN_USUARIO > /dev/null
```

```bash
openssl rand -base64 18 | tr -d '\n' | sudo tee ADMIN_SENHA; echo
```

```bash
openssl rand -base64 32 | tr -d '\n' | sudo tee TELEMETRIA_TOKEN > /dev/null
```

```bash
sudo chown 1654:1654 ./* && sudo chmod 400 ./*
```

Guarde a senha impressa pelo comando do `ADMIN_SENHA` num cofre de senhas. Use uma chave do Gemini
**diferente** da usada em desenvolvimento.

### 3. Portainer

Na *GitOps Source* de `https://github.com/Rodrigo050705/gs2_2026` (repositório público: não precisa
de token), a stack `agrosmart-prod` com *Compose path* `deploy/prod/compose.yml`, branch `main`,
polling de 5 min. Não troque o *Compose path* de uma stack já criada: no Portainer CE isso quebra a
cópia local; apague e recrie.

Se a stack `agrosmart-hml` antiga ainda existir, apague-a (e o volume `agrosmart-hml_dados` e a pasta
`/etc/docker/containers/agrosmart-hml`), liberando a porta 8092.

### 4. Caddy e DNS

O trecho está em [`deploy/Caddyfile.exemplo`](../deploy/Caddyfile.exemplo). Registro DNS no
Cloudflare apontando para o proxy. Remova o site `agrosmart-hml` se existir.

### 5. Primeiro deploy

1. Merge na `main` → `testes-api`, `testes-web`, `imagem` (api e web) e `deploy-prod` verdes, e um
   commit `agrosmart prod: sha-…` do `github-actions[bot]` na `main`.
2. Em até 5 min a stack `agrosmart-prod` fica **healthy**.
3. `https://agrosmart.gtlabs.com.br` abre a tela de login; com o admin, o painel abre e o chat responde.
4. Crie os demais usuários: `docker exec -it agrosmart-prod-api-1 python usuarios.py criar <usuario>`.

## Rollback

- `git revert` do commit `agrosmart prod: …` na `main` (o Portainer volta para a imagem anterior).
- O banco é SQLite com `create_all`: tabelas novas aparecem sozinhas, mas colunas novas em tabelas
  existentes **não**. Mudanças assim precisam entrar em `garantir_colunas_novas()`.
