// frontend/src/pages/Contacts.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listThreads, updateThread, getMessages, createContactAndSendMessage, type Thread } from "../api";
import { getOverrideLevel, type LeadLevel } from "../hooks/useLeadScore";
import { computeLeadScoreFromMessages, levelFromScore } from "../utils/leadScore";
import type { UIMessage } from "../types/lead";

/** ===== Visual helpers ===== */
type Row = Thread & {
  _lastText?: string;
  _lastAt?: string;
  _phone?: string;
  _level?: LeadLevel;
  _score?: number;
};
function chipColors(level: LeadLevel) {
  switch (level) {
    case "quente":
      return { bg: "#2d0f12", fg: "#fecaca", bd: "#dc2626" };
    case "morno":
      return { bg: "#1f2937", fg: "#fde68a", bd: "#f59e0b" };
    case "frio":
      return { bg: "#0f172a", fg: "#93c5fd", bd: "#1d4ed8" };
    default:
      return { bg: "var(--panel)", fg: "var(--muted)", bd: "var(--border)" };
  }
}
function LeadTag({ level, score }: { level: LeadLevel; score?: number }) {
  const { bg, fg, bd } = chipColors(level);
  const label = level === "quente" ? "Quente" : level === "morno" ? "Morno" : level === "frio" ? "Frio" : "—";
  return (
    <span className="chip" style={{ background: bg, color: fg, border: `1px solid ${bd}` }}>
      {label}
      {typeof score === "number" ? ` (${score})` : ""}
    </span>
  );
}
function getDisplayName(t: Thread) {
  const title = String(t.title || "").trim();
  if (title) return title;
  const wa = (t.metadata?.wa_id || t.metadata?.phone || "").toString();
  if (wa) return `Contato • ${wa.slice(-4)}`;
  return "Sem nome";
}
function getPhone(t: Thread) {
  const raw =
    (t as any)?.metadata?.wa_id ||
    (t as any)?.metadata?.phone ||
    (t as any)?.external_user_phone ||
    "";
  const s = String(raw).trim();
  if (!s) return "";
  const e164 = s.startsWith("whatsapp:") ? s.replace(/^whatsapp:/, "") : s;
  return e164.startsWith("+") ? e164 : `+${e164}`;
}
function fmtTimeShort(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString();
}

export default function Contacts() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState<string>("");
  const [level, setLevel] = useState<"todos" | "frio" | "morno" | "quente">("todos");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "ultimo", dir: "desc" });
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Modal para criar novo contato
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [existingThreadId, setExistingThreadId] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /** Carrega threads + enriquece com telefone e temperatura (OTIMIZADO: usa last_message do backend) */
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const ts = await listThreads();
        const base: Row[] = ts.map(t => {
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevel | undefined;
          const override = getOverrideLevel(String(t.id));
          const levelEff: LeadLevel =
            override && override !== "desconhecido"
              ? override
              : beLevel ?? levelFromScore(beScore);
          const scoreEff = typeof beScore === "number" ? beScore : undefined;
          
          // Usa last_message do backend se disponível (não precisa carregar todas as mensagens)
          const lastText = t.last_message || undefined;
          const lastAt = t.last_message_at || undefined;
          
          return { 
            ...t, 
            _phone: getPhone(t), 
            _level: levelEff, 
            _score: scoreEff,
            _lastText: lastText,
            _lastAt: lastAt,
          };
        });
        setRows(base);

        // Carrega mensagens para threads que não têm score do backend (mesmo que tenham last_message)
        // Isso garante que o score seja calculado localmente quando necessário
        const needsMessages = base.filter(t => 
          typeof t._score !== "number"
        );
        
        if (needsMessages.length > 0) {
          const CONC = 4;
          for (let i = 0; i < needsMessages.length; i += CONC) {
            await Promise.all(
              needsMessages.slice(i, i + CONC).map(async t => {
                try {
                  const msgs = (await getMessages(Number(t.id))) as UIMessage[];
                  if (!msgs?.length) return;
                  const last = msgs[msgs.length - 1];
                  const localScore = computeLeadScoreFromMessages(msgs);
                  // Recalcula o level considerando override, beLevel e score local
                  const override = getOverrideLevel(String(t.id));
                  const beLevel = (t as any).lead_level as LeadLevel | undefined;
                  const localLevel: LeadLevel = 
                    override && override !== "desconhecido"
                      ? override
                      : beLevel ?? levelFromScore(localScore);
                  setRows(prev =>
                    prev.map(r =>
                      r.id === t.id
                        ? { 
                            ...r, 
                            _lastText: last.content, 
                            _lastAt: last.created_at, 
                            _score: localScore, 
                            _level: localLevel 
                          }
                        : r
                    )
                  );
                } catch {
                  /* silencioso */
                }
              })
            );
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Atualização leve a cada 15s (sincroniza level/score vindos do backend e mantém override) */
  useEffect(() => {
    const id = window.setInterval(async () => {
      const ts = await listThreads();
      setRows(prev => {
        const map = new Map(prev.map(r => [String(r.id), r]));
        for (const t of ts) {
          const r = map.get(String(t.id));
          const beScore = (t as any).lead_score as number | undefined;
          const beLevel = (t as any).lead_level as LeadLevel | undefined;
          const override = getOverrideLevel(String(t.id));
          const levelEff: LeadLevel =
            override && override !== "desconhecido"
              ? override
              : beLevel ?? (r?._score !== undefined ? levelFromScore(r?._score) : r?._level ?? "desconhecido");
          const scoreEff = typeof beScore === "number" ? beScore : r?._score;
          if (r) map.set(String(t.id), { ...r, origin: t.origin, _level: levelEff, _score: scoreEff });
          else map.set(String(t.id), { ...(t as Row), _phone: getPhone(t), _level: levelEff, _score: scoreEff });
        }
        return Array.from(map.values());
      });
    }, 15000);
    return () => clearInterval(id);
  }, []);

  const origins = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(t => t.origin && s.add(String(t.origin)));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(t => {
      const matchesQ =
        !s ||
        getDisplayName(t).toLowerCase().includes(s) ||
        (t._phone || "").toLowerCase().includes(s) ||
        (t._lastText || "").toLowerCase().includes(s);
      const matchesOrigin = !origin || (t.origin || "") === origin;
      const lvl = t._level && t._level !== "desconhecido" ? t._level : (t.lead_level || "frio");
      const matchesLevel = level === "todos" || lvl === level;
      return matchesQ && matchesOrigin && matchesLevel;
    });
  }, [q, origin, level, rows]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const k = sort.key;
      if (k === "nome") return getDisplayName(a).localeCompare(getDisplayName(b)) * dir;
      if (k === "numero") return (a._phone || "").localeCompare(b._phone || "") * dir;
      if (k === "origem") return (a.origin || "").localeCompare(b.origin || "") * dir;
      if (k === "score") return ((a._score ?? -1) - (b._score ?? -1)) * dir;
      if (k === "tempo") {
        const da = a._lastAt ? new Date(a._lastAt).getTime() : 0;
        const db = b._lastAt ? new Date(b._lastAt).getTime() : 0;
        return (da - db) * dir;
      }
      if (k === "level") {
        const ord = { quente: 3, morno: 2, frio: 1 } as Record<string, number>;
        const la = a._level && a._level !== "desconhecido" ? a._level : (a.lead_level || "frio");
        const lb = b._level && b._level !== "desconhecido" ? b._level : (b.lead_level || "frio");
        return ((ord[la as string] || 0) - (ord[lb as string] || 0)) * dir;
      }
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  async function handleChangeOrigin(t: Row, next: string) {
    const old = t.origin || "";
    setRows(prev => prev.map(x => (x.id === t.id ? { ...x, origin: next || null } : x)));
    try {
      await updateThread(t.id, { origin: next || undefined });
    } catch {
      setRows(prev => prev.map(x => (x.id === t.id ? { ...x, origin: old || null } : x)));
      alert("Falha ao atualizar a origem.");
    }
  }

  function toggleSort(key: string) {
    setSort(s => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
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
      const { thread } = await createContactAndSendMessage(
        newContactName.trim(),
        formattedPhone,
        newContactMessage.trim()
      );

      // Recarrega a lista de contatos
      const ts = await listThreads();
      const base: Row[] = ts.map(t => {
        const beScore = (t as any).lead_score as number | undefined;
        const beLevel = (t as any).lead_level as LeadLevel | undefined;
        const override = getOverrideLevel(String(t.id));
        const levelEff: LeadLevel =
          override && override !== "desconhecido"
            ? override
            : beLevel ?? levelFromScore(beScore);
        const scoreEff = typeof beScore === "number" ? beScore : undefined;
        
        const lastText = t.last_message || undefined;
        const lastAt = t.last_message_at || undefined;
        
        return { 
          ...t, 
          _phone: getPhone(t), 
          _level: levelEff, 
          _score: scoreEff,
          _lastText: lastText,
          _lastAt: lastAt,
        };
      });
      setRows(base);

      // Fecha o modal e limpa os campos
      setShowNewContactModal(false);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactMessage("");

      // Navega para o chat com a nova thread
      navigate(`/#/chat?thread=${thread.id}`);
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
      navigate(`/#/chat?thread=${existingThreadId}`);
      setShowNewContactModal(false);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactMessage("");
      setExistingThreadId(null);
      setErrorMsg(null);
    }
  }

  return (
    <div style={{ 
      height: "calc(100vh - 56px)", 
      maxHeight: "calc(100vh - 56px)",
      display: "grid", 
      gridTemplateRows: "auto 1fr",
      overflow: "hidden",
    }}>
      {/* Filtros */}
      <div
        style={{
          display: "flex",
          gap: isMobile ? 6 : 8,
          alignItems: "center",
          padding: isMobile ? "8px 10px" : "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--panel)",
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <button
          onClick={() => setShowNewContactModal(true)}
          className="btn"
          style={{
            padding: isMobile ? "8px 12px" : "10px 16px",
            background: "var(--primary-color)",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: isMobile ? 13 : 14,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
          title="Criar novo contato e enviar mensagem"
        >
          + Novo Contato
        </button>
        <input
          className="input"
          placeholder={isMobile ? "Buscar..." : "Buscar (nome, número, mensagem)..."}
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{ 
            maxWidth: isMobile ? "100%" : 360,
            fontSize: isMobile ? 14 : 16,
            flex: isMobile ? "1 1 100%" : "auto",
          }}
        />
        <select 
          className="select select--sm" 
          value={origin} 
          onChange={e => setOrigin(e.target.value)}
          style={{ 
            fontSize: isMobile ? 13 : 14,
            flex: isMobile ? "1 1 calc(50% - 3px)" : "auto",
          }}
        >
          <option value="">Todas as origens</option>
          {[...new Set(origins)].map(o => (
            <option key={o} value={o}>
              {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select 
          className="select select--sm" 
          value={level} 
          onChange={e => setLevel(e.target.value as any)}
          style={{ 
            fontSize: isMobile ? 13 : 14,
            flex: isMobile ? "1 1 calc(50% - 3px)" : "auto",
          }}
        >
          <option value="todos">Todas as temperaturas</option>
          <option value="frio">Frio</option>
          <option value="morno">Morno</option>
          <option value="quente">Quente</option>
        </select>
        <div style={{ 
          marginLeft: isMobile ? 0 : "auto", 
          color: "var(--muted)",
          width: isMobile ? "100%" : "auto",
          marginTop: isMobile ? 4 : 0,
        }} className="small">
          {sorted.length} contato(s)
        </div>
      </div>

      {/* Tabela (desktop) ou Cards (mobile) */}
      {!isMobile ? (
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead style={{ position: "sticky", top: 0, background: "var(--panel)", zIndex: 1 }}>
            <tr>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("nome")}>
                  Nome {sort.key === "nome" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("numero")}>
                  Número {sort.key === "numero" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("origem")}>
                  Origem {sort.key === "origem" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Última mensagem</th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("tempo")}>
                  Último contato {sort.key === "tempo" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("level")}>
                  Temperatura {sort.key === "level" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <button className="btn soft" onClick={() => toggleSort("score")}>
                  Score {sort.key === "score" ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                </button>
              </th>
              <th style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} style={{ padding: 12 }} className="small">
                  Carregando…
                </td>
              </tr>
            )}
            {!loading && sorted.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 12, color: "var(--muted)" }} className="small">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
            {sorted.map(t => {
              const effLevel = t._level && t._level !== "desconhecido" ? t._level : (t.lead_level || "frio");
              const effScore = typeof t._score === "number" ? t._score : ((t as any).lead_score as number | undefined);
              return (
                <tr key={t.id}>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", maxWidth: 280 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>
                      {getDisplayName(t)}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <code style={{ color: "var(--text)" }}>{t._phone || "—"}</code>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <select
                      className="select select--sm"
                      value={t.origin || ""}
                      onChange={e => handleChangeOrigin(t, e.target.value)}
                    >
                      <option value="">Sem origem</option>
                      <option value="whatsapp_organico">WhatsApp (orgânico)</option>
                      <option value="meta_ads">Campanha (Meta)</option>
                      <option value="qr_code">QR Code</option>
                      <option value="site">Site</option>
                      <option value="indicacao">Indicação</option>
                    </select>
                  </td>
                  <td
                    style={{
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--border)",
                      maxWidth: 420,
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t._lastText || "—"}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    {fmtTimeShort(t._lastAt)}
                  </td>

                  {/* Temperatura somente leitura */}
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <LeadTag level={effLevel} score={effScore} />
                  </td>

                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    {typeof effScore === "number" ? effScore : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Link to={`/contacts/${t.id}`} className="btn soft" style={{ fontSize: 12, padding: "4px 8px" }}>
                        CRM
                      </Link>
                      <a className="btn soft" href={`/#/chat?thread=${t.id}`} style={{ fontSize: 12, padding: "4px 8px" }}>
                        Chat
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      ) : (
        /* Cards (mobile) */
        <div style={{ overflow: "auto", padding: 8 }}>
          {loading && (
            <div className="small" style={{ padding: 12, color: "var(--muted)" }}>
              Carregando…
            </div>
          )}
          {!loading && sorted.length === 0 && (
            <div className="card" style={{ padding: 16, textAlign: "center", color: "var(--muted)" }}>
              <div className="small">Nenhum contato encontrado.</div>
            </div>
          )}
          {sorted.map(t => {
            const effLevel = t._level && t._level !== "desconhecido" ? t._level : (t.lead_level || "frio");
            const effScore = typeof t._score === "number" ? t._score : ((t as any).lead_score as number | undefined);
            return (
              <div key={t.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      fontSize: 14,
                      marginBottom: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {getDisplayName(t)}
                    </div>
                    <code style={{ fontSize: 12, color: "var(--muted)" }}>{t._phone || "—"}</code>
                  </div>
                  <LeadTag level={effLevel} score={effScore} />
                </div>
                
                <div style={{ marginBottom: 8 }}>
                  <select
                    className="select select--sm"
                    value={t.origin || ""}
                    onChange={e => handleChangeOrigin(t, e.target.value)}
                    style={{ width: "100%", fontSize: 13 }}
                  >
                    <option value="">Sem origem</option>
                    <option value="whatsapp_organico">WhatsApp (orgânico)</option>
                    <option value="meta_ads">Campanha (Meta)</option>
                    <option value="qr_code">QR Code</option>
                    <option value="site">Site</option>
                    <option value="indicacao">Indicação</option>
                  </select>
                </div>

                {t._lastText && (
                  <div style={{ 
                    fontSize: 12, 
                    color: "var(--muted)", 
                    marginBottom: 8,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {t._lastText}
                  </div>
                )}

                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  marginBottom: 8,
                  fontSize: 11,
                  color: "var(--muted)",
                }}>
                  <span>Último: {fmtTimeShort(t._lastAt)}</span>
                  {typeof effScore === "number" && <span>Score: {effScore}</span>}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <Link 
                    to={`/contacts/${t.id}`} 
                    className="btn soft" 
                    style={{ fontSize: 12, padding: "6px 12px", flex: 1 }}
                  >
                    CRM
                  </Link>
                  <a 
                    className="btn soft" 
                    href={`/#/chat?thread=${t.id}`} 
                    style={{ fontSize: 12, padding: "6px 12px", flex: 1 }}
                  >
                    Chat
                  </a>
                </div>
              </div>
            );
          })}
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
                setErrorMsg(null);
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
