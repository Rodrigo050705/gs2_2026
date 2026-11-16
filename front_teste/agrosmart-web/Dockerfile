# syntax=docker/dockerfile:1
# Build context: front_teste/agrosmart-web
#
#   docker build -t agrosmart-web:local front_teste/agrosmart-web
#
# O front chama /api/v1 (relativo) e o nginx repassa para a API (API_UPSTREAM), então o
# mesmo build serve hml e prod, sem URL embutida no bundle e sem CORS.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS final

# A imagem do nginx aplica envsubst nos templates na subida (só nas variáveis definidas,
# então $host, $uri etc. ficam intactos).
ENV API_UPSTREAM=api:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD wget -q -O /dev/null http://127.0.0.1/nginx-health || exit 1
