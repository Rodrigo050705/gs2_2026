# CI/CD do AgroSmart

Mesmo fluxo do **Chave44** e do **AlcoolGasolina** (ver o `docs/cicd.md` do Chave44 para o porquê
de cada escolha), com uma diferença: é **autocontido**. Os composes dos ambientes ficam neste
repositório, em [`deploy/`](../deploy), e não num repositório de deploy separado. O CI usa só o
`GITHUB_TOKEN` do próprio repositório.

```
PR                → testes da API (pytest, sem internet) e do front (lint + build)
merge na main     → testes → imagens ghcr.io/rodrigo050705/agrosmart-api:sha-abc1234
                                  e ghcr.io/rodrigo050705/agrosmart-web:sha-abc1234
                    → commit na main: deploy/hml/compose.yml passa a usar sha-abc1234
                    → o Portainer vê o commit (polling) e sobe a homologação
tag v1.2.0        → as mesmas imagens ganham a tag 1.2.0, sem rebuild
                    → PR neste repositório trocando deploy/prod/compose.yml
                    → merge do PR (é a aprovação) → o Portainer sobe a produção
```

| Tema | Decisão |
|---|---|
| Workflow | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): jobs `testes-api`, `testes-web`, `imagem` (matriz api/web), `deploy-hml`, `promover` |
| Onde o deploy é descrito | [`deploy/hml/compose.yml`](../deploy/hml/compose.yml) e [`deploy/prod/compose.yml`](../deploy/prod/compose.yml), neste repositório |
| Credenciais do CI | só o `GITHUB_TOKEN`. Commits e PRs feitos por ele não disparam workflows, então o commit do `deploy-hml` na `main` não gera outro ciclo de CI |
| Registry | GHCR do dono do repositório (`rodrigo050705`); push com o `GITHUB_TOKEN` |
| Tags | `sha-<7>` a cada merge; `X.Y.Z` numa tag `v*`. Nunca `latest`. As duas imagens sempre com a mesma tag |
| Imagens | `agrosmart-api` (FastAPI; a mesma imagem roda o simulador IoT com outro `command`) e `agrosmart-web` (nginx com o build do Vite) |
| Rede | um domínio e **uma porta por ambiente**: o nginx do `web` serve o front e repassa `/api/` para o serviço `api`. Sem CORS e sem URL da API embutida no bundle |
| Ambientes | `agrosmart-hml` (porta **8092**, `agrosmart-hml.gtlabs.com.br`) e `agrosmart-prod` (porta **8093**, `agrosmart.gtlabs.com.br`) |
| Banco | SQLite no volume `dados` (`/data/agrosmart.db`) de cada stack. Os dados de demonstração são criados na primeira subida |
| Configuração | `environment` do compose para o que não é segredo; segredos em arquivos montados em `/run/secrets` (*key-per-file*: o nome do arquivo é a variável) |

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

Para subir tudo com Docker na sua máquina (builda as imagens a partir do código):

```bash
docker compose up --build
```

Abre em http://localhost:8080. A chave da IA vem de `back/.env`.

## Configuração

| Chave | Onde | O que é |
|---|---|---|
| `GEMINI_API_KEY` | arquivo em `segredos/` | chave da IA (Google AI Studio). Sem ela, tudo funciona menos o chat |
| `DATABASE_URL` | compose | `sqlite:////data/agrosmart.db` |
| `GEMINI_MODEL` | compose (opcional) | troca o modelo principal (padrão `gemini-3.1-flash-lite`) |

## Passo a passo do que é feito à mão

### 1. Configurações do repositório (precisa do dono, Rodrigo050705)

1. **Settings → Actions → General → Workflow permissions:** marcar **"Allow GitHub Actions to create
   and approve pull requests"**. Sem isso, o `promover` não consegue abrir o PR de produção. (O
   `contents: write` do `deploy-hml` já vem declarado no workflow.)
2. **Proteção da `main`:** se um dia ela exigir PR para todo push, o `deploy-hml` deixa de conseguir
   commitar. Nesse caso, liberar o `github-actions[bot]` no bypass da regra.
3. **Pacotes do GHCR:** depois do primeiro merge (que cria `agrosmart-api` e `agrosmart-web`), em
   github.com/Rodrigo050705 → Packages → cada pacote → *Package settings*: tornar **público** (o
   repositório já é público e não há segredo nas imagens), ou em *Manage access* dar *Read* para a
   conta usada pelo registry `ghcr` do Portainer.

### 2. Segredo no `infra.home`

```bash
sudo mkdir -p /etc/docker/containers/agrosmart-hml/segredos
```

```bash
printf '%s' 'COLE_A_CHAVE_DO_GEMINI' | sudo tee /etc/docker/containers/agrosmart-hml/segredos/GEMINI_API_KEY > /dev/null
```

```bash
sudo chown 1654:1654 /etc/docker/containers/agrosmart-hml/segredos/* && sudo chmod 400 /etc/docker/containers/agrosmart-hml/segredos/*
```

Use uma chave **diferente** para a produção (e uma diferente da usada em desenvolvimento).

### 3. Portainer

Uma *GitOps Source* para `https://github.com/Rodrigo050705/gs2_2026` (repositório público: não precisa
de token), e nela a stack `agrosmart-hml` com *Compose path* `deploy/hml/compose.yml`, branch `main`,
polling de 5 min. A primeira subida falha até o primeiro merge na `main` (a imagem `sha-0000000` não
existe). Não troque o *Compose path* de uma stack já criada: no Portainer CE isso quebra a cópia
local; apague e recrie.

### 4. Caddy e DNS

O trecho está em [`deploy/Caddyfile.exemplo`](../deploy/Caddyfile.exemplo). Registro DNS no
Cloudflare apontando para o proxy. Confirme que as portas 8092/8093 estão livres no `infra.home`.

### 5. Primeiro deploy

1. Merge na `main` → `testes-api`, `testes-web`, `imagem` (api e web) e `deploy-hml` verdes, e um
   commit `agrosmart hml: sha-…` do `github-actions[bot]` na `main`.
2. Em até 5 min a stack `agrosmart-hml` fica **healthy**.
3. `https://agrosmart-hml.gtlabs.com.br` abre o painel e o chat responde.

### 6. Produção

Repita 2 a 4 com `prod` (stack `agrosmart-prod`, *Compose path* `deploy/prod/compose.yml`, porta
8093, outra chave do Gemini). Antes da primeira versão, deixe os `image:` do
`deploy/prod/compose.yml` numa `sha-…` que já esteja na hml. Depois, cada versão:

```bash
git tag v1.0.0
```

```bash
git push origin v1.0.0
```

O `promover` abre o PR `Produção: agrosmart 1.0.0` (ramo `deploy/prod-1.0.0`); o merge põe no ar.
Esse PR é aberto pelo `GITHUB_TOKEN`, então o CI não roda nele (só troca duas linhas do compose).

## Rollback

- **hml:** `git revert` do commit `agrosmart hml: …` na `main`.
- **prod:** um PR revertendo o PR da versão.
- O banco é SQLite com `create_all`: tabelas novas aparecem sozinhas, mas colunas novas em tabelas
  existentes **não**. Mudanças assim precisam de migração (ou de recriar o volume `dados` na hml).
