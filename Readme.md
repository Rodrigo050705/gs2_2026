Aqui está o `README.md` atualizado refletindo a nova estrutura organizada em pastas (`backend/`, `iot-simulator/` e `frontend/`), incluindo os pré-requisitos, comandos de instalação e passo a passo para rodar toda a aplicação.

```markdown
# AgroSmart MVP — Gestão Inteligente para Pequenos Produtores

Sistema integrado de gestão agrícola que combina **Monitoramento Climático (IoT)**, **Automação de Alertas**, **Dashboards Analíticos (Clima e Comercial)** e **Controle de Estoque**.

---

## 📁 Estrutura do Projeto

```text
agrosmart-mvp/
├── backend/                  # API REST (FastAPI + SQLite) e regras de automação
│   ├── main.py
├── iot-simulator/            # Simulador de sensores climáticos em tempo real
│   ├── iot_simulator.py
├── frontend/                 # Aplicação Web (React + Vite + Recharts + Tailwind)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ClimaDashboard.jsx
│   │   │   ├── ComercialDashboard.jsx
│   │   │   └── EstoqueGestao.jsx
│   │   └── App.jsx
│   └── package.json
├── docs/                     # Documentação técnica e diagramas
└── README.md
    requiments.txt

```

---

## 🛠️ Pré-requisitos

Antes de iniciar, certifique-se de ter instalado na máquina:

* **Python 3.10+** ([Download Python](https://www.python.org/downloads/))
* **Node.js 18+ e npm** ([Download Node.js](https://nodejs.org/))
* **Git** (opcional, para clonar o repositório)

---

## ⚙️ Instalação das Dependências

Abra o terminal na pasta raiz do projeto (`agrosmart-mvp/`) e instale as dependências de cada módulo:

### 1. Backend (API FastAPI)

Instale os pacotes Python:

```bash
pip install fastapi uvicorn sqlalchemy pydantic requests

```

*(Caso tenha criado o arquivo `requirements.txt`, basta rodar `pip install -r requirements.txt`)*

### 2. Simulador IoT

Em um segundo terminal, acesse a pasta do simulador (pode usar o mesmo `.venv` ou instalar globalmente):

```bash
cd iot-simulator
pip install requests

```

### 3. Frontend (React + Vite)

Em um terceiro terminal, instale os pacotes Node:

```bash
cd frontend
npm install

```

*(Caso precise instalar manualmente os pacotes de gráficos e ícones: `npm install recharts lucide-react`)*

---

## ▶️ Como Executar o Projeto

Para rodar a demonstração completa ponta a ponta, mantenha **3 terminais abertos** simultaneamente:

### Terminal 1 — Subir a API Backend

```bash
cd backend
uvicorn main:app --reload --port 8000

```

* **API ativa em:** `http://localhost:8000`
* **Documentação interativa (Swagger):** `http://localhost:8000/docs`
* *Nota: Ao iniciar pela primeira vez, o banco `agrosmart.db` é criado automaticamente com 5 produtos iniciais para demonstração.*

### Terminal 2 — Iniciar o Simulador de Sensores IoT

```bash
cd iot-simulator
python iot_simulator.py

```

* Envia automaticamente leituras de temperatura do ar, umidade do ar e umidade do solo a cada **5 segundos**.

### Terminal 3 — Subir a Interface Web (React)

```bash
cd frontend
npm run dev

```

* Acesse no navegador o endereço exibido no terminal (geralmente `http://localhost:5173`).

---

## 🧪 Testando a Automação de Alertas (Modo Demonstração)

Com os 3 serviços rodando e o navegador aberto na aba **Clima & IoT**, você pode simular uma onda de calor e seca extrema executando o comando abaixo na pasta `iot-simulator`:

```bash
cd iot-simulator
python iot_simulator.py --anomalia

```

Em até 5 segundos:

1. Os indicadores de temperatura e umidade do solo ficarão **vermelhos**.
2. Um alerta crítico será disparado automaticamente pelo backend e exibido na base da tela.

---

## 👥 Divisão da Equipe

* **Rodrigo:** Automação IoT, motor de regras e dashboards analíticos (Clima e Comercial).
* **Matheus:** Arquitetura Backend (CRUD de Estoque, banco de dados e integração com IA).
* **Vitória:** Experiência Digital (UI/UX e integração das telas em React).
* **Bia:** Roteirização, gravação e edição do vídeo demonstrativo do MVP.
* **Dionísio:** Documentação técnica, diagramas de arquitetura e governança/DevOps.

```

---
```