from datetime import datetime, date, timedelta, timezone
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Date, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# ==========================================
# 1. CONFIGURAÇÃO DO BANCO (SQLite)
# ==========================================
DATABASE_URL = "sqlite:///./agrosmart.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class TelemetriaDB(Base):
    __tablename__ = "telemetria"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    sensor_id = Column(String)
    temperatura_ar = Column(Float)
    umidade_ar = Column(Float)
    umidade_solo = Column(Float)
    timestamp = Column(DateTime)


class AlertaDB(Base):
    __tablename__ = "alertas"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, index=True)
    tipo = Column(String)        # Ex: "CLIMA", "SOLO", "ESTOQUE"
    severidade = Column(String)  # Ex: "ALTA", "MEDIA"
    mensagem = Column(String)
    lido = Column(Boolean, default=False)
    criado_em = Column(DateTime, default=datetime.utcnow)


class ProdutoDB(Base):
    __tablename__ = "produtos"

    id = Column(Integer, primary_key=True, index=True)
    produtor_id = Column(Integer, default=1, index=True)
    nome = Column(String, index=True)
    categoria = Column(String)       # Ex: "Hortaliças", "Frutas", "Grãos"
    quantidade = Column(Float)
    unidade = Column(String)         # Ex: "kg", "cx", "un"
    custo_unitario = Column(Float)
    preco_venda = Column(Float)
    preco_mercado = Column(Float)    # Referência regional (ex: CEASA)
    data_validade = Column(Date)
    atualizado_em = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# 2. POPULAÇÃO INICIAL PARA DEMO (SEED ESTOQUE)
# ==========================================
def inicializar_dados_demo():
    db = SessionLocal()
    try:
        if db.query(ProdutoDB).count() == 0:
            hoje = date.today()
            itens_iniciais = [
                ProdutoDB(
                    produtor_id=1,
                    nome="Tomate Carmem",
                    categoria="Hortaliças",
                    quantidade=120.0,
                    unidade="kg",
                    custo_unitario=3.20,
                    preco_venda=5.50,
                    preco_mercado=6.20,
                    data_validade=hoje + timedelta(days=3),  # Risco crítico de validade
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Alface Crespa",
                    categoria="Hortaliças",
                    quantidade=85.0,
                    unidade="un",
                    custo_unitario=1.10,
                    preco_venda=2.50,
                    preco_mercado=2.40,
                    data_validade=hoje + timedelta(days=2),  # Risco crítico de validade
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Morango Albion",
                    categoria="Frutas",
                    quantidade=45.0,
                    unidade="cx",
                    custo_unitario=9.50,
                    preco_venda=11.00,  # Margem baixa (< 20%)
                    preco_mercado=14.50,
                    data_validade=hoje + timedelta(days=5),
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Cenoura Nantes",
                    categoria="Hortaliças",
                    quantidade=200.0,
                    unidade="kg",
                    custo_unitario=1.80,
                    preco_venda=3.40,
                    preco_mercado=3.50,
                    data_validade=hoje + timedelta(days=14),
                ),
                ProdutoDB(
                    produtor_id=1,
                    nome="Feijão Carioca",
                    categoria="Grãos",
                    quantidade=300.0,
                    unidade="kg",
                    custo_unitario=4.50,
                    preco_venda=7.20,
                    preco_mercado=7.00,
                    data_validade=hoje + timedelta(days=90),
                ),
            ]
            db.add_all(itens_iniciais)
            db.commit()
    finally:
        db.close()


inicializar_dados_demo()


# ==========================================
# 3. SCHEMAS PYDANTIC (Contratos JSON)
# ==========================================
class TelemetriaInput(BaseModel):
    produtor_id: int
    sensor_id: str
    temperatura_ar: float
    umidade_ar: float
    umidade_solo: float
    timestamp: datetime


def marcar_como_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """O SQLite guarda datas sem fuso; todas são gravadas em UTC. Marca o fuso para o JSON sair com +00:00
    e o navegador converter para o horário local corretamente."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def utc_para_local(dt: Optional[datetime]) -> Optional[str]:
    """Converte uma data UTC do banco para o horário local do servidor (texto legível)."""
    if dt is None:
        return None
    return marcar_como_utc(dt).astimezone().strftime("%d/%m/%Y %H:%M")


class TelemetriaResponse(TelemetriaInput):
    id: int

    validar_timestamp_utc = field_validator("timestamp")(marcar_como_utc)

    class Config:
        from_attributes = True


class AlertaResponse(BaseModel):
    id: int
    tipo: str
    severidade: str
    mensagem: str
    lido: bool
    criado_em: datetime

    validar_criado_em_utc = field_validator("criado_em")(marcar_como_utc)

    class Config:
        from_attributes = True


class ProdutoInput(BaseModel):
    produtor_id: int = 1
    nome: str
    categoria: str
    quantidade: float
    unidade: str
    custo_unitario: float
    preco_venda: float
    preco_mercado: float
    data_validade: date


class ProdutoUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    unidade: Optional[str] = None
    custo_unitario: Optional[float] = None
    preco_venda: Optional[float] = None
    preco_mercado: Optional[float] = None
    data_validade: Optional[date] = None


class ProdutoResponse(ProdutoInput):
    id: int
    valor_total_estoque: float
    margem_percentual: float
    dias_para_vencer: int
    status_validade: str

    class Config:
        from_attributes = True


def enriquecer_produto(p: ProdutoDB) -> dict:
    """Calcula métricas comerciais e de risco de validade em tempo real."""
    hoje = date.today()
    dias_vencer = (p.data_validade - hoje).days
    valor_total = round(p.quantidade * p.preco_venda, 2)

    if p.preco_venda > 0:
        margem = round(((p.preco_venda - p.custo_unitario) / p.preco_venda) * 100, 1)
    else:
        margem = 0.0

    if dias_vencer <= 3:
        status_val = "CRITICO"
    elif dias_vencer <= 7:
        status_val = "ATENCAO"
    else:
        status_val = "SAUDAVEL"

    return {
        "id": p.id,
        "produtor_id": p.produtor_id,
        "nome": p.nome,
        "categoria": p.categoria,
        "quantidade": p.quantidade,
        "unidade": p.unidade,
        "custo_unitario": p.custo_unitario,
        "preco_venda": p.preco_venda,
        "preco_mercado": p.preco_mercado,
        "data_validade": p.data_validade,
        "valor_total_estoque": valor_total,
        "margem_percentual": margem,
        "dias_para_vencer": dias_vencer,
        "status_validade": status_val,
    }


# ==========================================
# 4. MOTOR DE AUTOMAÇÃO (Regras Climáticas)
# ==========================================
def avaliar_regras_automacao(db: Session, leitura: TelemetriaInput):
    alertas_gerados = []

    if leitura.temperatura_ar > 32.0:
        alertas_gerados.append(
            AlertaDB(
                produtor_id=leitura.produtor_id,
                tipo="CLIMA",
                severidade="ALTA",
                mensagem=f"Alerta de Calor Extremo ({leitura.temperatura_ar}°C) no sensor {leitura.sensor_id}. Risco de estresse térmico nas culturas.",
            )
        )

    if leitura.umidade_solo < 30.0:
        alertas_gerados.append(
            AlertaDB(
                produtor_id=leitura.produtor_id,
                tipo="SOLO",
                severidade="ALTA",
                mensagem=f"Umidade do solo crítica ({leitura.umidade_solo}%) em {leitura.sensor_id}. Acionar irrigação imediatamente.",
            )
        )

    if alertas_gerados:
        db.add_all(alertas_gerados)
        db.commit()

    return len(alertas_gerados)


# ==========================================
# 5. APLICAÇÃO E ENDPOINTS FASTAPI
# ==========================================
app = FastAPI(title="AgroSmart API - Telemetria, Estoque & Inteligência", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- ENDPOINTS DE TELEMETRIA & ALERTAS ---
@app.post("/api/v1/telemetria", status_code=201)
def registrar_telemetria(payload: TelemetriaInput, db: Session = Depends(get_db)):
    nova_leitura = TelemetriaDB(**payload.model_dump())
    db.add(nova_leitura)
    db.commit()
    db.refresh(nova_leitura)

    qtd_alertas = avaliar_regras_automacao(db, payload)
    return {
        "status": "registrado",
        "leitura_id": nova_leitura.id,
        "alertas_disparados": qtd_alertas,
    }


@app.get("/api/v1/telemetria", response_model=List[TelemetriaResponse])
def listar_telemetria(limite: int = 20, produtor_id: int = 1, db: Session = Depends(get_db)):
    registros = (
        db.query(TelemetriaDB)
        .filter(TelemetriaDB.produtor_id == produtor_id)
        .order_by(TelemetriaDB.timestamp.desc())
        .limit(limite)
        .all()
    )
    return list(reversed(registros))


@app.get("/api/v1/alertas", response_model=List[AlertaResponse])
def listar_alertas(produtor_id: int = 1, db: Session = Depends(get_db)):
    return (
        db.query(AlertaDB)
        .filter(AlertaDB.produtor_id == produtor_id)
        .order_by(AlertaDB.criado_em.desc())
        .limit(10)
        .all()
    )


# --- ENDPOINTS CRUD DE ESTOQUE ---
@app.post("/api/v1/produtos", response_model=ProdutoResponse, status_code=201)
def criar_produto(payload: ProdutoInput, db: Session = Depends(get_db)):
    novo_produto = ProdutoDB(**payload.model_dump())
    db.add(novo_produto)
    db.commit()
    db.refresh(novo_produto)
    return enriquecer_produto(novo_produto)


@app.get("/api/v1/produtos", response_model=List[ProdutoResponse])
def listar_produtos(
    produtor_id: int = 1,
    categoria: Optional[str] = None,
    apenas_risco: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id)

    if categoria and categoria.upper() != "TODAS":
        query = query.filter(ProdutoDB.categoria == categoria)

    produtos = query.order_by(ProdutoDB.data_validade.asc()).all()
    resultado = [enriquecer_produto(p) for p in produtos]

    if apenas_risco:
        resultado = [r for r in resultado if r["dias_para_vencer"] <= 5 or r["margem_percentual"] < 20.0]

    return resultado


@app.put("/api/v1/produtos/{produto_id}", response_model=ProdutoResponse)
def atualizar_produto(produto_id: int, payload: ProdutoUpdate, db: Session = Depends(get_db)):
    produto = db.query(ProdutoDB).filter(ProdutoDB.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    dados_atualizados = payload.model_dump(exclude_unset=True)
    for campo, valor in dados_atualizados.items():
        setattr(produto, campo, valor)

    db.commit()
    db.refresh(produto)
    return enriquecer_produto(produto)


@app.delete("/api/v1/produtos/{produto_id}", status_code=204)
def deletar_produto(produto_id: int, db: Session = Depends(get_db)):
    produto = db.query(ProdutoDB).filter(ProdutoDB.id == produto_id).first()
    if not produto:
        raise HTTPException(status_code=404, detail="Produto não encontrado")

    db.delete(produto)
    db.commit()
    return None


# --- ENDPOINT CONSOLIDADO PARA OS 3 INDICADORES COMERCIAIS ---
@app.get("/api/v1/dashboard/comercial")
def obter_indicadores_comerciais(produtor_id: int = 1, db: Session = Depends(get_db)):
    produtos = db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id).all()
    itens = [enriquecer_produto(p) for p in produtos]

    valor_total_estoque = round(sum(i["valor_total_estoque"] for i in itens), 2)
    capital_em_risco = round(
        sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] <= 5), 2
    )
    margem_media = (
        round(sum(i["margem_percentual"] for i in itens) / len(itens), 1) if itens else 0.0
    )

    # Agrupamento por faixa de risco de validade (Indicador 2)
    risco_validade = [
        {
            "faixa": "Crítico (≤ 3 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] <= 3), 2),
        },
        {
            "faixa": "Atenção (4 a 7 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if 4 <= i["dias_para_vencer"] <= 7), 2),
        },
        {
            "faixa": "Saudável (> 7 dias)",
            "valor": round(sum(i["valor_total_estoque"] for i in itens if i["dias_para_vencer"] > 7), 2),
        },
    ]

    return {
        "kpis": {
            "valor_total_estoque": valor_total_estoque,
            "capital_em_risco": capital_em_risco,
            "margem_media_percentual": margem_media,
            "total_itens": len(itens),
        },
        "risco_validade": risco_validade,
        "produtos": itens,
    }

# ==========================================
# 6. ASSISTENTE IA (CHAT)
# ==========================================
# A chave fica em back/.env (veja back/.env.example), carregada automaticamente abaixo.
#   Chave grátis em: https://aistudio.google.com/apikey
import os
import json
from pathlib import Path
from typing import Literal
from dotenv import load_dotenv
from pydantic import Field
from google import genai
from google.genai import types
from google.genai import errors as genai_errors

load_dotenv(Path(__file__).resolve().parent / ".env")

# flash-lite: respostas em ~2-4s; os "flash" maiores estavam sobrecarregados (timeouts de 25s+)
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
# Se o principal falhar (sobrecarga, limite, timeout), tenta estes em ordem
GEMINI_MODELOS_RESERVA = ["gemini-3.5-flash-lite", "gemini-3.8-flash"]
_gemini_client = None


def get_gemini_client():
    """Cria o cliente uma única vez (lê GEMINI_API_KEY do ambiente)."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(
            http_options=types.HttpOptions(
                timeout=20_000,  # ms: se um modelo travar, desiste e passa para o próximo
                retry_options=types.HttpRetryOptions(attempts=1),  # sem retry interno; a troca de modelo cuida disso
            )
        )
    return _gemini_client


class MensagemChat(BaseModel):
    papel: Literal["user", "model"]
    texto: str = Field(max_length=4000)


class ChatInput(BaseModel):
    produtor_id: int = 1
    mensagem: str = Field(min_length=1, max_length=2000)
    historico: List[MensagemChat] = []


# "Parametrização do sistema": regras de comportamento da IA
SYSTEM_PROMPT = """Você é o AgroSmart Assistente, consultor de um pequeno produtor rural brasileiro.
Regras:
- Responda em português do Brasil, de forma curta, prática e direta (no máximo ~8 linhas, use listas quando ajudar).
- Baseie-se PRIMEIRO nos DADOS ATUAIS abaixo (estoque, margens, validade, clima e alertas). Cite números concretos.
- "Melhor produto" = considere margem %, valor em estoque, preço de venda vs. preço de mercado e risco de validade. Explique o critério.
- Perguntas sobre "melhor momento para produzir/plantar X": combine os dados de clima dos sensores com conhecimento agronômico geral
  (sazonalidade no Brasil, temperatura ideal, ciclo da cultura). Deixe claro o que vem dos dados e o que é recomendação geral.
- Se faltar dado para responder (ex.: não há histórico de vendas), diga isso e responda com o que existe.
- Nunca invente números que não estejam nos dados.
- Assuntos fora de agro/gestão do negócio: recuse educadamente."""


def montar_contexto(db: Session, produtor_id: int) -> str:
    """Coleta os dados do produtor e transforma em JSON para a IA."""
    produtos = [
        enriquecer_produto(p)
        for p in db.query(ProdutoDB).filter(ProdutoDB.produtor_id == produtor_id).all()
    ]

    leituras = (
        db.query(TelemetriaDB)
        .filter(TelemetriaDB.produtor_id == produtor_id)
        .order_by(TelemetriaDB.timestamp.desc())
        .limit(50)
        .all()
    )
    clima = None
    if leituras:
        n = len(leituras)
        clima = {
            "leituras_consideradas": n,
            "ultima_leitura": {
                "temperatura_ar": leituras[0].temperatura_ar,
                "umidade_ar": leituras[0].umidade_ar,
                "umidade_solo": leituras[0].umidade_solo,
                "horario_local": utc_para_local(leituras[0].timestamp),
            },
            "media_temperatura_ar": round(sum(l.temperatura_ar for l in leituras) / n, 1),
            "media_umidade_ar": round(sum(l.umidade_ar for l in leituras) / n, 1),
            "media_umidade_solo": round(sum(l.umidade_solo for l in leituras) / n, 1),
        }

    alertas = (
        db.query(AlertaDB)
        .filter(AlertaDB.produtor_id == produtor_id)
        .order_by(AlertaDB.criado_em.desc())
        .limit(10)
        .all()
    )

    contexto = {
        "agora_horario_local": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "estoque_produtos": produtos,
        "clima_sensores": clima or "sem leituras de sensores ainda",
        "alertas_recentes": [
            {"tipo": a.tipo, "severidade": a.severidade, "mensagem": a.mensagem, "horario_local": utc_para_local(a.criado_em)}
            for a in alertas
        ],
    }
    return json.dumps(contexto, default=str, ensure_ascii=False)


@app.post("/api/v1/chat")
def conversar_com_assistente(payload: ChatInput, db: Session = Depends(get_db)):
    contexto = montar_contexto(db, payload.produtor_id)

    # Histórico curto (últimas 10 mensagens) + pergunta atual
    contents = [
        types.Content(role=m.papel, parts=[types.Part(text=m.texto)])
        for m in payload.historico[-10:]
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=payload.mensagem)]))

    config = types.GenerateContentConfig(
        system_instruction=f"{SYSTEM_PROMPT}\n\nDADOS ATUAIS DO PRODUTOR (JSON):\n{contexto}",
        temperature=0.3,
    )

    ultimo_erro = None
    for modelo in [GEMINI_MODEL] + [m for m in GEMINI_MODELOS_RESERVA if m != GEMINI_MODEL]:
        try:
            resposta = get_gemini_client().models.generate_content(
                model=modelo, contents=contents, config=config
            )
            return {"resposta": resposta.text or "Não consegui gerar uma resposta agora."}
        except genai_errors.APIError as e:
            ultimo_erro = e
            if e.code in (400, 401, 403):  # requisição/chave inválida: trocar de modelo não resolve
                break
        except Exception as e:  # timeout de rede etc. → próximo modelo
            ultimo_erro = e

    print(f"[chat] todos os modelos falharam. Último erro: {ultimo_erro}")
    codigo = getattr(ultimo_erro, "code", None)
    if codigo in (401, 403) or (codigo == 400 and "API key" in str(ultimo_erro)):
        msg = "A chave da IA é inválida ou expirou. Verifique o GEMINI_API_KEY em back/.env."
    elif codigo == 400:
        msg = "A IA não conseguiu processar essa pergunta. Tente reformular."
    else:
        msg = "A IA está sobrecarregada no momento. Tente novamente em alguns segundos."
    raise HTTPException(status_code=503, detail=msg)
