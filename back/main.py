from datetime import datetime, date, timedelta
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


class TelemetriaResponse(TelemetriaInput):
    id: int

    class Config:
        from_attributes = True


class AlertaResponse(BaseModel):
    id: int
    tipo: str
    severidade: str
    mensagem: str
    lido: bool
    criado_em: datetime

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