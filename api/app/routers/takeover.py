# app/routers/takeover.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Thread, Message, User
from app.schemas import TakeoverToggle, HumanReplyBody, MessageRead
from app.auth import get_current_user

# ✅ providers
from app.providers import twilio as twilio_provider
from app.providers import meta as meta_provider
import asyncio
import logging

router = APIRouter(prefix="/threads", tags=["takeover"])
logger = logging.getLogger(__name__)

@router.post("/{thread_id}/takeover")
def set_takeover(thread_id: int, body: TakeoverToggle,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    t = db.get(Thread, thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")
    t.human_takeover = bool(body.active)
    db.add(t); db.commit(); db.refresh(t)
    return {"ok": True, "human_takeover": t.human_takeover}

@router.post("/{thread_id}/human-reply", response_model=MessageRead)
async def human_reply(thread_id: int, body: HumanReplyBody,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    t = db.get(Thread, thread_id)
    if not t:
        raise HTTPException(404, "Thread not found")

    # 1) salva no histórico (marcado como mensagem humana)
    msg = Message(thread_id=t.id, role="assistant", content=body.content, is_human=True)
    db.add(msg); db.commit(); db.refresh(msg)

    # 2) envia para o cliente via WhatsApp (Twilio ou Meta)
    phone = (t.external_user_phone or "").strip()
    if not phone:
        logger.warning(f"[HUMAN-REPLY] thread {t.id} sem external_user_phone; nada enviado")
        return {"ok": True, "message_id": msg.id, "sent": False}

    sent = False
    # Tenta enviar via Twilio primeiro
    try:
        sid = twilio_provider.send_text(phone, body.content, "HUMANO")
        logger.info(f"[HUMAN-REPLY][TWILIO] ✅ thread={t.id} to={phone} sid={sid}")
        sent = True
    except Exception as twilio_error:
        logger.warning(f"[HUMAN-REPLY][TWILIO] ⚠️ Falhou para {phone}: {twilio_error}")
        # Se Twilio falhar, tenta Meta
        try:
            phone_for_meta = phone.replace("whatsapp:", "").replace("+", "").strip()
            await meta_provider.send_text(phone_for_meta, body.content)
            logger.info(f"[HUMAN-REPLY][META] ✅ thread={t.id} to={phone} (formatado: {phone_for_meta})")
            sent = True
        except Exception as meta_error:
            logger.error(f"[HUMAN-REPLY] ❌ Falha ao enviar via ambos os provedores. Twilio: {twilio_error}, Meta: {meta_error}")
            sent = False

    return MessageRead(
        id=msg.id,
        role=msg.role,
        content=msg.content,
        created_at=msg.created_at,
    )
