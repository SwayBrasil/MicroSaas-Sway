import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listThreads,
  createThread,
  getMessages,
  postMessage,
  deleteThread,
  setTakeover,
  postHumanReply,
  createContactAndSendMessage,
  type Thread,
  type Message,
} from "../api";
import { useLeadScore, getOverrideLevel, setOverrideLevel, type LeadLevel } from "../hooks/useLeadScore";
import { computeLeadScoreFromMessages, levelFromScore } from "../utils/leadScore";
import type { UIMessage } from "../types/lead";

/** Utils */
function clsx(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function formatTime(dt: string | number | Date) {
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function formatTimeShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

/** SSE helper (mantido caso volte ao SSE depois) */
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
function sseUrlForThread(threadId: number | string) {
  const token = localStorage.getItem("token") || "";
  return `${API_BASE}/threads/${threadId}/stream?token=${encodeURIComponent(token)}`;
}

/* ==== Lead Tagging ====================================================== */

function colorForLevel(level: LeadLevel) {
  switch (level) {
    case "frio": return { bg: "#0f172a", fg: "#93c5fd", bd: "#1d4ed8" };
    case "morno": return { bg: "#1f2937", fg: "#fde68a", bd: "#f59e0b" };
    case "quente": return { bg: "#2d0f12", fg: "#fecaca", bd: "#dc2626" };
    default: return { bg: "var(--panel)", fg: "var(--muted)", bd: "var(--border)" };
  }
}

function LeadTag({ level, score }: { level: LeadLevel; score?: number }) {
  const { bg, fg, bd } = colorForLevel(level);
  const label =
    level === "quente" ? "Quente" :
    level === "morno" ? "Morno" :
    level === "frio" ? "Frio" : "—";
  const title = typeof score === "number" ? `${label} (${score})` : label;
  return (
    <span
      className="chip"
      title={title}
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${bd}`,
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        lineHeight: "16px",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: bd }} />
      {label}
    </span>
  );
}

/* ======================================================================= */

/** Sidebar de threads */
function Sidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
  leadFilter,
  setLeadFilter,
  leadScores,
  isMobile,
  onClose,
}: {
  threads: Thread[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading: boolean;
  leadFilter: LeadLevel | "todos";
  setLeadFilter: (l: LeadLevel | "todos") => void;
  leadScores: Record<string, { score?: number; level: LeadLevel }>;
  isMobile?: boolean;
  onClose?: () => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = threads;
    if (s) {
      // Busca tanto no nome do contato quanto no título e última mensagem
      list = list.filter((t) => {
        const searchText = (t.contact_name || t.title || "Sem título").toLowerCase();
        const lastMsg = (t.last_message || "").toLowerCase();
        return searchText.includes(s) || lastMsg.includes(s);
      });
    }
    if (leadFilter !== "todos") {
      list = list.filter((t) => (leadScores[String(t.id)]?.level ?? "desconhecido") === leadFilter);
    }
    
    // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
    return [...list].sort((a, b) => {
      const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
      const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
      return timeB - timeA; // Mais recente primeiro (descendente)
    });
  }, [q, threads, leadFilter, leadScores]);

  return (
    <aside
      style={{
        width: "100%",
        height: "100%",
        maxWidth: "100%",
        maxHeight: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        boxSizing: "border-box",
      }}
      aria-label="Lista de conversas"
    >
      {/* Header da sidebar */}
      <div style={{ 
        padding: "16px", 
        borderBottom: "1px solid var(--border)", 
        background: "var(--panel)",
        flexShrink: 0,
      }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "space-between", 
          gap: 12,
          marginBottom: 12 
        }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, flex: 1, minWidth: 0 }}>Conversas</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {isMobile && onClose && (
              <button
                onClick={onClose}
                style={{
                  padding: "8px",
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 18,
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                }}
                aria-label="Fechar lista de conversas"
              >
                ✕
              </button>
            )}
            <button 
              className="btn" 
              onClick={onNew} 
              style={{ 
                padding: "8px 14px",
                borderRadius: 8,
                background: "var(--primary-color)",
                color: "white",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }} 
              aria-label="Criar nova conversa"
            >
              + Nova
            </button>
          </div>
        </div>

        {/* Filtros de temperatura */}
        <div style={{ 
          display: "flex", 
          gap: 6,
          marginBottom: 12,
        }} role="tablist" aria-label="Filtros de temperatura">
          <button
            className={clsx("btn", leadFilter === "todos" ? "" : "soft")}
            onClick={() => setLeadFilter("todos")}
            title="Mostrar todas"
            style={{ flex: 1, padding: "6px 8px", fontSize: 13 }}
            aria-pressed={leadFilter === "todos"}
            aria-label="Mostrar todas as conversas"
          >
            Todos
          </button>
          <button
            className={clsx("btn", leadFilter === "frio" ? "" : "soft")}
            onClick={() => setLeadFilter("frio")}
            title="Somente Frios"
            style={{ flex: 1, padding: "6px 8px", fontSize: 16 }}
            aria-pressed={leadFilter === "frio"}
            aria-label="Filtrar conversas frias"
          >
            ❄️
          </button>
          <button
            className={clsx("btn", leadFilter === "morno" ? "" : "soft")}
            onClick={() => setLeadFilter("morno")}
            title="Somente Mornos"
            style={{ flex: 1, padding: "6px 8px", fontSize: 16 }}
            aria-pressed={leadFilter === "morno"}
            aria-label="Filtrar conversas mornas"
          >
            🌤️
          </button>
          <button
            className={clsx("btn", leadFilter === "quente" ? "" : "soft")}
            onClick={() => setLeadFilter("quente")}
            title="Somente Quentes"
            style={{ flex: 1, padding: "6px 8px", fontSize: 16 }}
            aria-pressed={leadFilter === "quente"}
            aria-label="Filtrar conversas quentes"
          >
            🔥
          </button>
        </div>

        {/* Busca */}
        <input
          className="input"
          placeholder="Buscar ou começar nova conversa"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar conversa"
          type="search"
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 20,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            fontSize: 14,
            boxSizing: "border-box",
          }}
        />
      </div>

      <div style={{ 
        overflowY: "auto", 
        overflowX: "hidden",
        flex: 1, 
        minHeight: 0,
        maxHeight: "100%",
        boxSizing: "border-box",
      }} role="list" aria-label="Lista de conversas">
        {loading && (
          <div className="small" style={{ color: "var(--muted)", padding: "16px" }} role="status" aria-live="polite">
            Carregando conversas...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="small" style={{ color: "var(--muted)", padding: "16px" }} role="status">
            Nenhuma conversa encontrada.
          </div>
        )}

        <ul style={{ 
          listStyle: "none", 
          padding: 0, 
          margin: 0, 
          display: "flex", 
          flexDirection: "column",
        }}>
          {filtered.map((t) => {
            const entry = leadScores[String(t.id)] || { level: "desconhecido" as LeadLevel, score: undefined };
            // Prioriza o nome do contato, depois o título, depois "Sem título"
            const displayName = t.contact_name || t.title || "Sem título";
            const lastMsg = t.last_message || "";
            const lastMsgTime = t.last_message_at ? formatTimeShort(t.last_message_at) : "";
            const isActive = activeId === String(t.id);
            return (
              <li key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <button
                  className={clsx("item", isActive && "active")}
                  onClick={() => onSelect(String(t.id))}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`Conversa com ${displayName}${lastMsg ? `, última mensagem: ${lastMsg}` : ""}`}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    padding: "12px 16px",
                    minHeight: "72px",
                    height: "auto",
                    boxSizing: "border-box",
                    position: "relative",
                    cursor: "pointer",
                    background: isActive ? "var(--bg)" : "transparent",
                    border: "none",
                    gap: 6,
                    transition: "background 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = "var(--bg)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = "transparent";
                  }}
                  title={lastMsg ? `${displayName}\n${lastMsg}` : displayName}
                >
                  {/* Linha superior: Nome + Timestamp + Tag */}
                  <div style={{ 
                    display: "flex", 
                    alignItems: "flex-start", 
                    justifyContent: "space-between", 
                    gap: 8, 
                    width: "100%",
                    marginBottom: 2,
                  }}>
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        pointerEvents: "none",
                        fontWeight: 500,
                        fontSize: 15,
                        color: "var(--text)",
                        flex: 1,
                        minWidth: 0,
                        lineHeight: "1.3",
                      }}
                    >
                      {displayName}
                    </span>
                    <div style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: 8, 
                      flexShrink: 0,
                    }}>
                      {lastMsgTime && (
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                            lineHeight: "1.2",
                          }}
                        >
                          {lastMsgTime}
                        </span>
                      )}
                      <LeadTag level={entry.level} score={entry.score} />
                    </div>
                  </div>
                  
                  {/* Linha inferior: Preview da mensagem (limitado a 2 linhas) */}
                  {lastMsg && (
                    <div style={{ 
                      display: "flex", 
                      alignItems: "flex-start", 
                      width: "100%",
                      minHeight: 0,
                      marginTop: 2,
                    }}>
                      <span
                        style={{
                          fontSize: 14,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          lineHeight: "1.5",
                          flex: 1,
                          pointerEvents: "none",
                          wordBreak: "break-word",
                          maxWidth: "100%",
                        }}
                        title={lastMsg}
                      >
                        {lastMsg}
                      </span>
                    </div>
                  )}
                  
                  {!lastMsg && (
                    <div style={{ 
                      fontSize: 14,
                      color: "var(--muted)",
                      fontStyle: "italic",
                      marginTop: 2,
                      pointerEvents: "none",
                      lineHeight: "1.5",
                    }}>
                      Sem mensagens
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

/** Bolha de mensagem */
function Bubble({ m, isMobile, thread }: { m: UIMessage; isMobile?: boolean; thread?: Thread }) {
  const isUser = m.role === "user";
  const assistantLabel = (m as any).is_human ? "Assistente (Humano)" : "Assistente";
  
  // Para mensagens do usuário, tenta pegar o nome do contato
  let userLabel = "Usuário";
  if (isUser && thread) {
    const name = thread.contact_name || 
                 thread.title || 
                 (thread.metadata as any)?.name ||
                 (thread.metadata as any)?.profile_name;
    
    if (name && name.trim()) {
      userLabel = name.trim();
    } else {
      // Fallback: mostra número de telefone
      const phone = (thread.metadata as any)?.wa_id || 
                   (thread.metadata as any)?.phone || 
                   thread.external_user_phone;
      if (phone) {
        const phoneStr = String(phone).replace(/[^\d]/g, "");
        userLabel = phoneStr.length > 4 ? `+${phoneStr}` : phoneStr;
      }
    }
  }
  
  return (
    <div
      className={clsx("bubble", isUser ? "user" : "assistant")}
      aria-label={isUser ? "Mensagem do usuário" : "Resposta do assistente"}
      style={{
        maxWidth: isMobile ? "85%" : "min(720px, 100%)",
        padding: isMobile ? "8px 10px" : "10px 12px",
      }}
    >
      <div className="meta" style={{ 
        fontSize: isMobile ? 11 : 12,
        marginBottom: isMobile ? 4 : 6,
        gap: isMobile ? 6 : 10,
      }}>
        <span className="role">{isUser ? userLabel : assistantLabel}</span>
        <span className="time">{formatTime(m.created_at || Date.now())}</span>
      </div>
      <div className="content" style={{ 
        fontSize: isMobile ? 14 : 14,
        lineHeight: isMobile ? 1.4 : 1.5,
      }}>{m.content}</div>
    </div>
  );
}

/** Indicador de digitando */
function Typing() {
  return (
    <div className="typing">
      <span className="dot" />
      <span className="dot" />
      <span className="dot" />
    </div>
  );
}

/** Composer */
function Composer({
  value,
  setValue,
  onSend,
  disabled,
  takeoverActive,
}: {
  value: string;
  setValue: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  takeoverActive: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(220, Math.max(48, el.scrollHeight)) + "px";
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  const isDisabled = disabled || !takeoverActive;

  return (
    <div style={{ 
      padding: isMobile ? "8px 10px" : "12px 16px", 
      borderTop: "1px solid var(--border)", 
      background: "var(--panel)",
      flexShrink: 0,
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
      opacity: takeoverActive ? 1 : 0.6,
    }}>
      {!takeoverActive && (
        <div style={{
          padding: "8px 12px",
          marginBottom: 8,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          fontSize: isMobile ? 12 : 13,
          color: "var(--muted)",
          textAlign: "center",
        }}>
          ⚠️ Ative "👤 Assumir conversa" acima para enviar mensagens
        </div>
      )}
      <div className="composer" style={{ 
        display: "flex", 
        gap: isMobile ? 6 : 8, 
        alignItems: "flex-end",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}>
        <textarea
          ref={ref}
          className="input"
          placeholder={takeoverActive ? "Você está respondendo como HUMANO..." : "Ative 'Assumir conversa' para enviar mensagens"}
          value={value}
          onChange={(e) => {
            if (takeoverActive) {
              setValue(e.target.value);
            }
          }}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Caixa de mensagem"
          disabled={isDisabled}
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: "100%",
            borderRadius: isMobile ? 18 : 20,
            padding: isMobile ? "8px 12px" : "10px 16px",
            border: "1px solid var(--border)",
            background: isDisabled ? "var(--panel)" : "var(--bg)",
            resize: "none",
            fontSize: isMobile ? 14 : 14,
            maxHeight: isMobile ? 100 : 120,
            overflowY: "auto",
            minHeight: isMobile ? 36 : 40,
            boxSizing: "border-box",
            cursor: isDisabled ? "not-allowed" : "text",
            opacity: isDisabled ? 0.6 : 1,
          }}
        />
        <button 
          className="btn" 
          onClick={onSend} 
          disabled={isDisabled || !value.trim()}
          style={{
            padding: isMobile ? "8px 16px" : "10px 20px",
            borderRadius: isMobile ? 18 : 20,
            background: isDisabled || !value.trim() ? "var(--muted)" : "var(--primary-color)",
            color: "white",
            border: "none",
            cursor: isDisabled || !value.trim() ? "not-allowed" : "pointer",
            fontWeight: 600,
            fontSize: isMobile ? 13 : 14,
            minWidth: isMobile ? 70 : 80,
            maxWidth: isMobile ? 70 : "none",
            height: isMobile ? 36 : "auto",
            flexShrink: 0,
            boxSizing: "border-box",
            opacity: isDisabled ? 0.5 : 1,
          }}
        >
          Enviar
        </button>
      </div>
      {!isMobile && takeoverActive && (
        <div className="small" style={{ color: "var(--muted)", marginTop: 6, fontSize: 11 }}>
          Enter para enviar • Shift + Enter para nova linha
        </div>
      )}
    </div>
  );
}

/** Página principal do Chat (sem Header interno) */
export default function Chat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // estados de tempo real (mantidos caso você use SSE depois)
  const [isTyping, setIsTyping] = useState(false);
  const [assistantBuffer, setAssistantBuffer] = useState<string>("");

  // takeover (estado local; persistido no backend ao alternar)
  const [takeoverActive, setTakeoverActive] = useState<boolean>(false);

  // Lead Tagging (tempo real)
  const [leadFilter, setLeadFilter] = useState<LeadLevel | "todos">("todos");
  const [leadScores, setLeadScores] = useState<Record<string, { score?: number; level: LeadLevel }>>({});

  // Modal para criar novo contato
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [existingThreadId, setExistingThreadId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<number | null>(null);

  async function refreshLeadForThread(t: Thread, msgsCache?: UIMessage[]) {
    const override = getOverrideLevel(String(t.id));
    if (override && override !== "desconhecido") {
      const score = override === "quente" ? 75 : override === "morno" ? 45 : 15;
      setLeadScores((m) => ({
        ...m,
        [String(t.id)]: { score, level: override },
      }));
      return;
    }

    const beScore = t.lead_score;
    const beLevel = t.lead_level;

    let msgs = msgsCache;
    if (!msgs && (!beScore || !beLevel)) {
      try {
        msgs = await getMessages(Number(t.id)) as UIMessage[];
      } catch {
        setLeadScores((m) => ({ ...m, [String(t.id)]: { score: undefined, level: "desconhecido" } }));
        return;
      }
    }

    // Usa o hook logic (mas não pode usar hook aqui, então usa as funções diretamente)
    const score = beScore ?? (msgs ? computeLeadScoreFromMessages(msgs) : 0);
    // Prioridade: override > beLevel > calcular do score
    const level: LeadLevel = beLevel ? beLevel : levelFromScore(score);
    
    setLeadScores((m) => ({ ...m, [String(t.id)]: { score, level } }));
  }

  /** Carrega threads e pontua todas em background */
  useEffect(() => {
    (async () => {
      try {
        setLoadingThreads(true);
        const ts = await listThreads();
        // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
        const sorted = [...ts].sort((a, b) => {
          const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return timeB - timeA; // Mais recente primeiro
        });
        setThreads(sorted);
        if (sorted.length > 0) setActiveId(String(sorted[0].id));

        const CONC = 4;
        for (let i = 0; i < sorted.length; i += CONC) {
          await Promise.all(sorted.slice(i, i + CONC).map(t => refreshLeadForThread(t)));
        }
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar conversas.");
      } finally {
        setLoadingThreads(false);
      }
    })();
  }, []);

  /** Carrega mensagens ao trocar de thread + repontua a ativa */
  useEffect(() => {
    if (!activeId) return;
    (async () => {
      try {
        if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
        }

        setLoadingMessages(true);
        setErrorMsg(null);
        const msgs = await getMessages(Number(activeId));
        setMessages(msgs as any);
        
        // Verifica o estado do takeover da thread
        const t = threads.find(x => String(x.id) === activeId);
        if (t) {
          setTakeoverActive(t.human_takeover || false);
          refreshLeadForThread(t, msgs as any);
        } else {
          setTakeoverActive(false);
        }
        
        setAssistantBuffer("");
        setIsTyping(false);

        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
        });
      } catch (e: any) {
        setErrorMsg(e?.message || "Falha ao carregar mensagens.");
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Polling de mensagens da ativa a cada 2s (merge) */
  useEffect(() => {
    if (!activeId) return;

    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const fetchAndMerge = async () => {
      try {
        const serverMsgs = await getMessages(Number(activeId));
        let shouldClearTyping = false;
        
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [String(m.id), m]));
          
          // Remove mensagens temporárias que já têm correspondente real
          const tempToRemove: string[] = [];
          for (const [id, msg] of map.entries()) {
            if (id.startsWith("temp-")) {
              // Verifica se já existe mensagem real com mesmo conteúdo e role
              const hasReal = serverMsgs.some((m: UIMessage) => 
                m.role === msg.role && 
                m.content.trim() === msg.content.trim() &&
                Math.abs(new Date(m.created_at).getTime() - new Date(msg.created_at).getTime()) < 5000
              );
              if (hasReal) {
                tempToRemove.push(id);
              }
            }
          }
          tempToRemove.forEach(id => map.delete(id));
          
          // Adiciona/atualiza mensagens do servidor
          for (const m of serverMsgs as UIMessage[]) {
            map.set(String(m.id), m);
          }
          
          // Verifica se a última mensagem do servidor é do assistente
          // e se é mais recente que a última mensagem do usuário
          if (serverMsgs.length > 0) {
            const lastMsg = serverMsgs[serverMsgs.length - 1];
            const lastUserMsg = [...serverMsgs].reverse().find((m: UIMessage) => m.role === "user");
            
            // Se a última mensagem é do assistente e é mais recente que a última do usuário,
            // significa que o assistente já respondeu
            if (lastMsg.role === "assistant") {
              if (!lastUserMsg || new Date(lastMsg.created_at) > new Date(lastUserMsg.created_at)) {
                shouldClearTyping = true;
              }
            }
          }
          
          return Array.from(map.values()).sort((a, b) => {
            const ai = String(a.id), bi = String(b.id);
            if (ai.startsWith("temp-") && !bi.startsWith("temp-")) return -1;
            if (!ai.startsWith("temp-") && bi.startsWith("temp-")) return 1;
            return Number(a.id) - Number(b.id);
          });
        });
        
        // Limpa isTyping se o assistente já respondeu
        if (shouldClearTyping) {
          setIsTyping(false);
          setAssistantBuffer("");
        }

        // repontua a ativa e atualiza thread (move para o topo se tiver nova mensagem)
        const t = threads.find(x => String(x.id) === activeId);
        if (t) {
          refreshLeadForThread(t, serverMsgs as any);
          // Atualiza a thread na lista para refletir nova mensagem
          if (serverMsgs && serverMsgs.length > 0) {
            const lastMsg = serverMsgs[serverMsgs.length - 1];
            setThreads((prev) => {
              const updated = prev.map((th) => 
                String(th.id) === activeId
                  ? { ...th, last_message: lastMsg.content, last_message_at: lastMsg.created_at }
                  : th
              );
              // Reordena: thread atualizada vai para o topo
              return updated.sort((a, b) => {
                const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                return timeB - timeA;
              });
            });
          }
        }
      } catch {
        // silencioso
      }
    };

    fetchAndMerge();
    pollRef.current = window.setInterval(fetchAndMerge, 2000) as unknown as number;

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeId, threads]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Polling leve para TODAS as threads a cada 15s (atualiza do backend primeiro) */
  useEffect(() => {
    if (!threads.length) return;
    const interval = window.setInterval(async () => {
      try {
        // Atualiza threads do backend primeiro para pegar beScore/beLevel atualizados
        const ts = await listThreads();
        // Ordena por última mensagem (mais recente primeiro) - estilo WhatsApp
        const sorted = [...ts].sort((a, b) => {
          const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
          const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
          return timeB - timeA; // Mais recente primeiro
        });
        setThreads(sorted);
        
        const CONC = 3;
        for (let i = 0; i < sorted.length; i += CONC) {
          await Promise.all(sorted.slice(i, i + CONC).map(t => refreshLeadForThread(t)));
        }
      } catch {
        // silencioso
      }
    }, 15000);
    return () => window.clearInterval(interval);
  }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Scroll automático quando chegam novas mensagens */
  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [messages.length, assistantBuffer]);

  async function handleNewThread() {
    try {
      const t = await createThread();
      setThreads((prev) => [t, ...prev]);
      setActiveId(String(t.id));
      setMessages([]);
      setInput("");
      setTakeoverActive(false);
      setAssistantBuffer("");
      setIsTyping(false);
      refreshLeadForThread(t); // já calcula
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível criar a conversa.");
    }
  }

  async function handleDeleteThread(id: string) {
    try {
      await deleteThread(Number(id));
      setThreads((prev) => prev.filter((t) => String(t.id) !== id));
      if (activeId === id) {
        const rest = threads.filter((t) => String(t.id) !== id);
        setActiveId(rest[0] ? String(rest[0].id) : undefined);
        setMessages([]);
        setTakeoverActive(false);
        setAssistantBuffer("");
        setIsTyping(false);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Não foi possível excluir a conversa.");
    }
  }

  async function toggleTakeover(next: boolean) {
    if (!activeId) return;
    try {
      await setTakeover(Number(activeId), next);
      setTakeoverActive(next);
    } catch (e: any) {
      setErrorMsg(e?.message || "Falha ao alternar takeover.");
    }
  }

  async function handleSend() {
    if (!activeId) {
      await handleNewThread();
    }
    if (!activeId) return;
    const content = input.trim();
    if (!content) return;

    const optimistic: UIMessage = {
      id: "temp-" + Date.now(),
      role: takeoverActive ? "assistant" : "user",
      is_human: takeoverActive ? true : undefined,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setSending(true);
    if (!takeoverActive) setIsTyping(true);
    setErrorMsg(null);

    try {
      if (takeoverActive) {
        await postHumanReply(Number(activeId), content);
        setIsTyping(false);
      } else {
        await postMessage(Number(activeId), content);
        // isTyping será limpo quando a resposta do assistente chegar via polling
      }
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail || e?.message || "Falha ao enviar. Tente novamente.");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
      setIsTyping(false);
    } finally {
      setSending(false);
      const t = threads.find(x => String(x.id) === activeId);
      if (t) {
        refreshLeadForThread(t); // repontua depois do envio
        // Atualiza thread e move para o topo (estilo WhatsApp)
        setThreads((prev) => {
          const now = new Date().toISOString();
          const updated = prev.map((th) => 
            String(th.id) === activeId
              ? { ...th, last_message: content, last_message_at: now }
              : th
          );
          // Reordena: thread atualizada vai para o topo
          return updated.sort((a, b) => {
            const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
            const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
            return timeB - timeA;
          });
        });
      }
    }
  }

  const activeLead = useMemo(() => {
    if (!activeId) return { level: "desconhecido" as LeadLevel, score: undefined as number | undefined };
    const entry = leadScores[activeId];
    return entry || { level: "desconhecido" as LeadLevel, score: undefined };
  }, [activeId, leadScores]);

  function handleOverride(level: LeadLevel | null) {
    if (!activeId) return;
    if (level) {
      setOverrideLevel(activeId, level);
    } else {
      localStorage.removeItem(`lead_override_${activeId}`);
    }
    const t = threads.find(x => String(x.id) === activeId);
    if (t) refreshLeadForThread(t, messages); // aplica na hora
  }

  // Função para validar e formatar telefone
  function validateAndFormatPhone(phone: string): string | null {
    // Remove espaços, parênteses, hífens e outros caracteres
    let cleaned = phone.replace(/[\s\(\)\-\.]/g, "");
    
    // Remove o prefixo "whatsapp:" se existir
    cleaned = cleaned.replace(/^whatsapp:/i, "");
    
    // Se começar com +, remove temporariamente
    const hasPlus = cleaned.startsWith("+");
    if (hasPlus) {
      cleaned = cleaned.substring(1);
    }
    
    // Remove o "9" inicial se o número tiver 11 dígitos e começar com 9
    // Isso é para números brasileiros no formato: 961984081114 -> 6184081114
    if (cleaned.length === 11 && cleaned.startsWith("9")) {
      cleaned = cleaned.substring(1);
    }
    
    // Se o número tem 10 dígitos e começa com código de área brasileiro (11-99), adiciona código do país
    if (cleaned.length === 10 && /^[1-9][1-9]/.test(cleaned)) {
      cleaned = "55" + cleaned; // Adiciona código do Brasil
    }
    
    // Validação básica: deve ter pelo menos 10 dígitos (DDD + número)
    if (cleaned.length < 10) {
      return null;
    }
    
    // Garante que começa com +
    return "+" + cleaned;
  }

  async function handleCreateContactAndSend() {
    if (!newContactName.trim() || !newContactPhone.trim() || !newContactMessage.trim()) {
      setErrorMsg("Por favor, preencha todos os campos.");
      return;
    }

    // Valida e formata o telefone
    const formattedPhone = validateAndFormatPhone(newContactPhone.trim());
    if (!formattedPhone) {
      setErrorMsg("Telefone inválido. Use o formato: +5511984081114 ou 6184081114");
      return;
    }

    setCreatingContact(true);
    setErrorMsg(null);

    try {
      const { thread, message } = await createContactAndSendMessage(
        newContactName.trim(),
        formattedPhone,
        newContactMessage.trim()
      );

      // Adiciona a thread à lista e seleciona
      setThreads((prev) => [thread, ...prev]);
      setActiveId(String(thread.id));
      setMessages([message as any]);
      
      // Ativa takeover se a thread tiver telefone (modo manual)
      setTakeoverActive(thread.human_takeover || false);
      
      setAssistantBuffer("");
      setIsTyping(false);
      refreshLeadForThread(thread);

      // Fecha o modal e limpa os campos
      setShowNewContactModal(false);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactMessage("");

      // Scroll para a última mensagem
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
      });
    } catch (e: any) {
      const errorDetail = e?.response?.data?.detail || e?.message || "Falha ao criar contato e enviar mensagem.";
      
      // Se o erro for sobre número duplicado, mostra mensagem mais clara
      if (errorDetail.includes("Já existe um contato") || errorDetail.includes("já existe")) {
        const threadIdMatch = errorDetail.match(/Thread ID: (\d+)/);
        if (threadIdMatch) {
          const threadId = threadIdMatch[1];
          setExistingThreadId(threadId);
          setErrorMsg(`Este número já está cadastrado. Clique em "Abrir conversa existente" para continuar.`);
        } else {
          setErrorMsg("Este número já está cadastrado. Verifique a lista de contatos.");
        }
      } else {
        setErrorMsg(errorDetail);
      }
    } finally {
      setCreatingContact(false);
    }
  }

  function handleOpenExistingThread() {
    if (existingThreadId) {
      setActiveId(existingThreadId);
      setShowNewContactModal(false);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactMessage("");
      setExistingThreadId(null);
      setErrorMsg(null);
    }
  }

  const [showSidebar, setShowSidebar] = useState(true); // Para mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Detecta mudanças no tamanho da tela
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setShowSidebar(true); // Sempre mostra sidebar no desktop
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize(); // Chama uma vez no mount
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // No mobile, esconde sidebar quando chat está aberto
  useEffect(() => {
    if (activeId && isMobile) {
      setShowSidebar(false);
    }
  }, [activeId, isMobile]);

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        maxHeight: "100vh",
        maxWidth: "100vw",
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        boxSizing: "border-box",
      }}
    >
      {/* Sidebar - Lista de Conversas */}
      <div
        style={{
          width: activeId && isMobile && !showSidebar ? 0 : isMobile ? "100%" : 350,
          minWidth: activeId && isMobile && !showSidebar ? 0 : isMobile ? 0 : 350,
          maxWidth: activeId && isMobile && !showSidebar ? 0 : isMobile ? "100%" : 350,
          height: "100%",
          maxHeight: "100%",
          borderRight: isMobile ? "none" : "1px solid var(--border)",
          background: "var(--panel)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "all 0.3s ease",
          position: isMobile ? "absolute" : "relative",
          zIndex: isMobile ? 10 : 1,
          left: isMobile && !showSidebar ? "-100%" : 0,
          top: 0,
          boxShadow: isMobile && showSidebar ? "2px 0 8px rgba(0,0,0,0.1)" : "none",
          boxSizing: "border-box",
        }}
      >
        <Sidebar
          threads={threads}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id);
            if (isMobile) setShowSidebar(false);
          }}
          onNew={handleNewThread}
          onDelete={handleDeleteThread}
          loading={loadingThreads}
          leadFilter={leadFilter}
          setLeadFilter={setLeadFilter}
          leadScores={leadScores}
          isMobile={isMobile}
          onClose={() => setShowSidebar(false)}
        />
      </div>

      {/* Área do Chat */}
      {activeId ? (
        <main
          style={{
            flex: 1,
            height: "100%",
            maxHeight: "100%",
            width: isMobile && showSidebar ? 0 : "100%",
            minHeight: 0,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--bg)",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
          aria-label="Janela do chat"
        >
          {/* Header do Chat com Menu */}
          <div
            style={{
              minHeight: isMobile ? 50 : 60,
              height: "auto",
              maxHeight: isMobile ? "60px" : "80px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isMobile ? "8px 10px" : "10px 12px",
              position: "relative",
              flexShrink: 0,
              gap: isMobile ? 6 : 8,
              boxSizing: "border-box",
              overflow: "visible",
            }}
          >
            {/* Botão voltar/fechar conversa */}
            <button
              onClick={() => {
                setActiveId(undefined);
                if (isMobile) {
                  setShowSidebar(true);
                }
              }}
              style={{
                padding: isMobile ? "8px 12px" : "8px 12px",
                marginRight: isMobile ? 6 : 8,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isMobile ? 20 : 18,
                color: "var(--text)",
                flexShrink: 0,
                minWidth: isMobile ? 40 : 36,
                height: isMobile ? 40 : 36,
                lineHeight: 1,
                fontWeight: 600,
              }}
              aria-label="Fechar chat e voltar para lista"
              title="Fechar chat"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--panel)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--bg)";
              }}
            >
              {isMobile ? "←" : "✕"}
            </button>

            {/* Botão criar novo contato */}
            <button
              onClick={() => setShowNewContactModal(true)}
              style={{
                padding: isMobile ? "8px 12px" : "8px 12px",
                marginRight: isMobile ? 6 : 8,
                background: "var(--primary-color)",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: isMobile ? 14 : 13,
                color: "white",
                flexShrink: 0,
                fontWeight: 600,
                gap: 6,
              }}
              aria-label="Criar novo contato e enviar mensagem"
              title="Novo contato"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--primary-color)";
                e.currentTarget.style.filter = "brightness(0.95)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--primary-color)";
                e.currentTarget.style.filter = "none";
              }}
            >
              <span>+</span>
              {!isMobile && <span>Novo contato</span>}
            </button>

            {/* Info da conversa */}
            <div style={{ 
              flex: 1, 
              display: "flex", 
              alignItems: "center", 
              gap: 8,
              minWidth: 0,
              overflow: "hidden",
            }}>
              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div style={{ 
                  fontWeight: 600, 
                  fontSize: isMobile ? 14 : 16,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {(() => {
                    const thread = threads.find(t => String(t.id) === activeId);
                    
                    // Debug: log para ver o que tem no thread
                    if (thread) {
                      console.log("[CHAT HEADER] Thread encontrado:", {
                        id: thread.id,
                        contact_name: thread.contact_name,
                        title: thread.title,
                        metadata: thread.metadata,
                        external_user_phone: thread.external_user_phone,
                      });
                    } else {
                      console.log("[CHAT HEADER] Thread não encontrado. activeId:", activeId, "Threads:", threads.map(t => ({ id: t.id, contact_name: t.contact_name, title: t.title })));
                    }
                    
                    if (!thread) return "Nova conversa";
                    
                    // Prioridade: contact_name > title > metadata.name > metadata.profile_name > número
                    const name = thread.contact_name || 
                                 thread.title || 
                                 (thread.metadata as any)?.name ||
                                 (thread.metadata as any)?.profile_name;
                    
                    console.log("[CHAT HEADER] Nome encontrado:", name);
                    
                    if (name && name.trim()) return name.trim();
                    
                    // Fallback: mostra últimos 4 dígitos do número
                    const phone = (thread.metadata as any)?.wa_id || 
                                 (thread.metadata as any)?.phone || 
                                 thread.external_user_phone;
                    if (phone) {
                      const phoneStr = String(phone).replace(/[^\d]/g, "");
                      const display = `Contato • ${phoneStr.slice(-4)}`;
                      console.log("[CHAT HEADER] Usando fallback com telefone:", display);
                      return display;
                    }
                    
                    console.log("[CHAT HEADER] Usando fallback 'Nova conversa'");
                    return "Nova conversa";
                  })()}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                  {takeoverActive ? "Modo humano ativo" : "Online"}
                </div>
              </div>
            </div>

            {/* Controles */}
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 8,
              flexShrink: 0,
            }}>
              {/* Lead tag */}
              <LeadTag level={activeLead.level} score={activeLead.score} />
            </div>
          </div>

          {/* Barra de controles (takeover, temperatura) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: isMobile ? 6 : 8,
              padding: isMobile ? "6px 10px" : "8px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel)",
              flexWrap: "wrap",
              flexShrink: 0,
              boxSizing: "border-box",
              fontSize: isMobile ? 11 : 14,
            }}
          >
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: isMobile ? 6 : 8,
              flexWrap: "wrap",
            }}>
              <label style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: isMobile ? 4 : 8, 
                cursor: "pointer", 
                fontSize: isMobile ? 12 : 14 
              }}>
                <input
                  type="checkbox"
                  checked={takeoverActive}
                  onChange={(e) => toggleTakeover(e.target.checked)}
                  style={{ width: isMobile ? 14 : 16, height: isMobile ? 14 : 16 }}
                />
                <span>👤 {isMobile ? "Assumir" : "Assumir conversa"}</span>
              </label>

              {takeoverActive && (
                <span className="chip" style={{ 
                  background: "#1e3a8a", 
                  color: "white", 
                  fontSize: isMobile ? 10 : 12,
                  padding: isMobile ? "2px 6px" : "4px 8px",
                }}>
                  {isMobile ? "Humano" : "Modo humano ativo"}
                </span>
              )}
            </div>

            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: isMobile ? 6 : 8,
            }}>
              <span style={{ 
                fontSize: isMobile ? 11 : 12, 
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}>
                {isMobile ? "Temp:" : "Temperatura:"}
              </span>
              <select
                className="select select--sm"
                value={getOverrideLevel(activeId || "") || "auto"}
                onChange={(e) => {
                  const v = e.target.value as LeadLevel | "auto";
                  handleOverride(v === "auto" ? null : (v as LeadLevel));
                }}
                style={{ 
                  fontSize: isMobile ? 12 : 13, 
                  padding: isMobile ? "4px 8px" : "6px 10px",
                  minWidth: isMobile ? 80 : 100,
                  height: isMobile ? 28 : "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              >
                <option value="auto">Auto</option>
                <option value="frio">Frio</option>
                <option value="morno">Morno</option>
                <option value="quente">Quente</option>
              </select>
              
              {/* Botão fechar conversa */}
              <button
                onClick={() => {
                  setActiveId(undefined);
                  if (isMobile) {
                    setShowSidebar(true);
                  }
                }}
                style={{
                  padding: isMobile ? "4px 8px" : "6px 10px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: isMobile ? 12 : 13,
                  color: "var(--text)",
                  flexShrink: 0,
                  minWidth: isMobile ? 60 : 70,
                  height: isMobile ? 28 : 32,
                  lineHeight: 1,
                  fontWeight: 500,
                }}
                aria-label="Fechar chat e voltar para lista"
                title="Fechar chat"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--panel)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg)";
                }}
              >
                {isMobile ? "✕ Sair" : "✕ Fechar"}
              </button>
            </div>
          </div>

          {/* Barra com nome/número do contato */}
          {(() => {
            const thread = threads.find(t => String(t.id) === activeId);
            
            // Debug
            console.log("[BARRA CONTATO] Thread encontrado:", thread ? {
              id: thread.id,
              contact_name: thread.contact_name,
              title: thread.title,
              metadata: thread.metadata,
              external_user_phone: thread.external_user_phone,
            } : "Thread não encontrado. activeId:", activeId);
            
            if (!thread) return null;
            
            const name = thread.contact_name || 
                        thread.title || 
                        (thread.metadata as any)?.name ||
                        (thread.metadata as any)?.profile_name;
            
            const phone = (thread.metadata as any)?.wa_id || 
                         (thread.metadata as any)?.phone || 
                         thread.external_user_phone;
            
            const displayName = name && name.trim() 
              ? name.trim() 
              : phone 
                ? `+${String(phone).replace(/[^\d]/g, "")}` 
                : "Contato sem nome";
            
            console.log("[BARRA CONTATO] Nome:", name, "Phone:", phone, "DisplayName:", displayName);
            
            const phoneFormatted = phone 
              ? String(phone).replace(/[^\d]/g, "").replace(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/, "+$1 ($2) $3-$4")
              : null;
            
            return (
              <div
                style={{
                  padding: isMobile ? "8px 10px" : "10px 12px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg)",
                  flexShrink: 0,
                  boxSizing: "border-box",
                }}
              >
                <div style={{
                  fontSize: isMobile ? 13 : 14,
                  fontWeight: 600,
                  color: "var(--text)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}>
                  <span>👤</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {displayName}
                  </span>
                  {phoneFormatted && (
                    <span style={{
                      fontSize: isMobile ? 11 : 12,
                      color: "var(--muted)",
                      fontWeight: 400,
                      whiteSpace: "nowrap",
                    }}>
                      {phoneFormatted}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Lista de mensagens */}
          <div
            ref={listRef}
            style={{
              overflowY: "auto",
              overflowX: "hidden",
              padding: isMobile ? "8px 6px" : "12px 16px",
              background: "var(--bg)",
              minHeight: 0,
              flex: 1,
              maxHeight: "100%",
              boxSizing: "border-box",
            }}
          >
          {loadingMessages && (
            <div className="small" style={{ 
              color: "var(--muted)", 
              padding: isMobile ? 6 : 8,
              fontSize: isMobile ? 12 : 13,
            }}>
              Carregando mensagens...
            </div>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="card" style={{ 
              maxWidth: isMobile ? "90%" : 560, 
              margin: isMobile ? "20px auto" : "40px auto", 
              textAlign: "center", 
              padding: isMobile ? 16 : 20 
            }}>
              <h3 style={{ marginTop: 0, fontSize: isMobile ? 18 : 20 }}>Bem-vindo 👋</h3>
              <p className="small" style={{ 
                color: "var(--muted)",
                fontSize: isMobile ? 12 : 13,
              }}>
                Comece uma conversa enviando uma mensagem abaixo ou crie uma nova conversa.
              </p>
            </div>
          )}

          <div style={{ 
            display: "flex", 
            flexDirection: "column",
            gap: isMobile ? 8 : 10,
            paddingBottom: isMobile ? 8 : 12,
          }}>
            {messages.map((m) => {
              const thread = threads.find(t => String(t.id) === activeId);
              return <Bubble key={m.id} m={m} isMobile={isMobile} thread={thread} />;
            })}

            {assistantBuffer && (
              <div 
                className="bubble assistant"
                style={{
                  maxWidth: isMobile ? "85%" : "min(720px, 100%)",
                  padding: isMobile ? "8px 10px" : "10px 12px",
                }}
              >
                <div className="meta" style={{ 
                  fontSize: isMobile ? 11 : 12,
                  marginBottom: isMobile ? 4 : 6,
                  gap: isMobile ? 6 : 10,
                }}>
                  <span className="role">Assistente</span>
                  <span className="time">{formatTime(Date.now())}</span>
                </div>
                <div className="content" style={{ 
                  fontSize: isMobile ? 14 : 14,
                  lineHeight: isMobile ? 1.4 : 1.5,
                }}>{assistantBuffer}</div>
              </div>
            )}

            {!assistantBuffer && !takeoverActive && isTyping && (
              <div 
                className="bubble assistant"
                style={{
                  maxWidth: isMobile ? "85%" : "min(720px, 100%)",
                  padding: isMobile ? "8px 10px" : "10px 12px",
                }}
              >
                <div className="meta" style={{ 
                  fontSize: isMobile ? 11 : 12,
                  marginBottom: isMobile ? 4 : 6,
                  gap: isMobile ? 6 : 10,
                }}>
                  <span className="role">Assistente</span>
                  <span className="time">{formatTime(Date.now())}</span>
                </div>
                <Typing />
              </div>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              style={{
                border: "1px solid #7f1d1d",
                background: "#1b0f10",
                color: "#fecaca",
                padding: isMobile ? "8px 10px" : "10px 12px",
                borderRadius: 10,
                fontSize: isMobile ? 12 : 14,
                marginTop: isMobile ? 8 : 12,
                maxWidth: isMobile ? "90%" : 560,
              }}
            >
              {errorMsg}{" "}
              <button
                className="btn soft"
                onClick={() => {
                  setErrorMsg(null);
                  if (messages.length === 0) return;
                  const lastUser = [...messages].reverse().find((m) => m.role === "user");
                  if (lastUser) setInput(lastUser.content);
                }}
                style={{ marginLeft: 8 }}
              >
                Recarregar / Reenviar
              </button>
            </div>
          )}
        </div>

          {/* Composer - Só funciona quando takeover está ativo */}
          <Composer
            value={input}
            setValue={setInput}
            onSend={handleSend}
            disabled={sending || !takeoverActive}
            takeoverActive={takeoverActive}
          />
        </main>
      ) : (
        /* Tela quando nenhuma conversa está selecionada */
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            color: "var(--muted)",
            textAlign: "center",
            padding: 40,
          }}
        >
          <div>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
            <h3 style={{ margin: "0 0 8px 0", color: "var(--text)" }}>Selecione uma conversa</h3>
            <p style={{ margin: 0, fontSize: 14 }}>
              Escolha uma conversa da lista ao lado para começar a conversar
            </p>
          </div>
        </div>
      )}

      {/* Modal para criar novo contato */}
      {showNewContactModal && (
        <>
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.5)",
              zIndex: 10000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: isMobile ? 16 : 20,
            }}
            onClick={() => {
              if (!creatingContact) {
                setShowNewContactModal(false);
                setNewContactName("");
                setNewContactPhone("");
                setNewContactMessage("");
              }
            }}
          >
            <div
              className="card"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: isMobile ? 20 : 24,
                maxWidth: isMobile ? "100%" : 500,
                width: "100%",
                maxHeight: "90vh",
                overflowY: "auto",
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: "0 0 20px 0", fontSize: isMobile ? 20 : 24, fontWeight: 600 }}>
                Novo Contato
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text)",
                    }}
                  >
                    Nome *
                  </label>
                  <input
                    className="input"
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Nome do contato"
                    disabled={creatingContact}
                    style={{ width: "100%", fontSize: 14 }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text)",
                    }}
                  >
                    Telefone *
                  </label>
                  <input
                    className="input"
                    type="tel"
                    value={newContactPhone}
                    onChange={(e) => {
                      setNewContactPhone(e.target.value);
                      // Limpa o erro e thread existente quando o usuário digita
                      if (errorMsg || existingThreadId) {
                        setErrorMsg(null);
                        setExistingThreadId(null);
                      }
                    }}
                    placeholder="+5511984081114 ou 6184081114"
                    disabled={creatingContact}
                    style={{ width: "100%", fontSize: 14 }}
                  />
                  <div className="small" style={{ marginTop: 4, color: "var(--muted)" }}>
                    Formato: +5511984081114 ou 6184081114 (sem o 9 na frente)
                  </div>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      marginBottom: 8,
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text)",
                    }}
                  >
                    Mensagem Inicial *
                  </label>
                  <textarea
                    className="input"
                    value={newContactMessage}
                    onChange={(e) => setNewContactMessage(e.target.value)}
                    placeholder="Digite a mensagem que deseja enviar..."
                    disabled={creatingContact}
                    rows={4}
                    style={{
                      width: "100%",
                      fontSize: 14,
                      resize: "vertical",
                      minHeight: 100,
                    }}
                  />
                </div>

                {errorMsg && (
                  <div
                    style={{
                      padding: "12px",
                      background: existingThreadId ? "var(--primary-soft)" : "var(--danger-soft)",
                      border: `1px solid ${existingThreadId ? "var(--primary-color)" : "var(--danger)"}`,
                      borderRadius: 8,
                      color: existingThreadId ? "var(--primary-color)" : "var(--danger)",
                      fontSize: 13,
                    }}
                  >
                    {errorMsg}
                    {existingThreadId && (
                      <div style={{ marginTop: 8 }}>
                        <button
                          className="btn"
                          onClick={handleOpenExistingThread}
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 600,
                            background: "var(--primary-color)",
                            color: "white",
                            border: "none",
                            borderRadius: 6,
                            cursor: "pointer",
                          }}
                        >
                          Abrir conversa existente
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
                  <button
                    className="btn soft"
                    onClick={() => {
                      setShowNewContactModal(false);
                      setNewContactName("");
                      setNewContactPhone("");
                      setNewContactMessage("");
                      setErrorMsg(null);
                      setExistingThreadId(null);
                    }}
                    disabled={creatingContact}
                    style={{
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn"
                    onClick={handleCreateContactAndSend}
                    disabled={
                      creatingContact ||
                      !newContactName.trim() ||
                      !newContactPhone.trim() ||
                      !newContactMessage.trim()
                    }
                    style={{
                      padding: "10px 20px",
                      fontSize: 14,
                      fontWeight: 600,
                      background:
                        creatingContact ||
                        !newContactName.trim() ||
                        !newContactPhone.trim() ||
                        !newContactMessage.trim()
                          ? "var(--muted)"
                          : "var(--primary-color)",
                      color: "white",
                      border: "none",
                      cursor:
                        creatingContact ||
                        !newContactName.trim() ||
                        !newContactPhone.trim() ||
                        !newContactMessage.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {creatingContact ? "Criando..." : "Criar e Enviar"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
