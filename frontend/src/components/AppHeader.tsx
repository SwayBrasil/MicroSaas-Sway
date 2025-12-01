// src/components/AppHeader.tsx
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { useDarkMode } from "../hooks/useDarkMode";

/** Botão de navegação compacto (pill, sem borda/linha) */
function NavBtn({
  to,
  children,
  title,
  onClick,
}: { to: string; children: React.ReactNode; title?: string; onClick?: () => void }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const active = loc.pathname === to || loc.pathname.startsWith(to + "/");

  const baseStyle: React.CSSProperties = {
    padding: "4px 9px",
    borderRadius: 999,
    fontSize: 13,
    lineHeight: 1.1,
    fontWeight: 600,
    border: "none",                       // ✅ sem linhas
    background: "transparent",
    color: "var(--text)",
    textDecoration: "none",               // ✅ sem sublinhado
    boxShadow: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    transition: "background .15s ease, color .15s ease, transform .06s ease",
    transform: "translateY(0)",
    cursor: "pointer",
  };

  const activeStyle: React.CSSProperties = active
    ? {
        background: "var(--primary-soft, rgba(37,99,235,.12))",
        color: "var(--primary-color)",
        fontWeight: 700,
      }
    : {};

  return (
    <button
      className="btn soft"
      aria-current={active ? "page" : undefined}
      title={title}
      onClick={() => {
        navigate(to);
        if (onClick) onClick();
      }}
      style={{ ...baseStyle, ...activeStyle }}
      onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)"; }}
      onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "var(--panel)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      {children}
    </button>
  );
}

export default function AppHeader() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <header
      style={{
        minHeight: 50,
        height: "auto",
        maxHeight: "100vh",
        width: "100%",
        maxWidth: "100vw",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobile ? "8px 10px" : "0 12px",
        position: "sticky",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        background: "var(--bg)",
        backdropFilter: "saturate(120%) blur(4px)",
        boxSizing: "border-box",
        flexWrap: "nowrap",
        gap: isMobile ? 8 : 0,
        overflow: "visible",
      }}
      aria-label="Barra superior"
    >
      {/* Logo */}
      <div
        className="logo"
        style={{ 
          cursor: "pointer", 
          display: "flex", 
          gap: 8, 
          alignItems: "center",
          flexShrink: 0,
        }}
        onClick={() => navigate("/")}
      >
        <svg width={isMobile ? 18 : 20} height={isMobile ? 18 : 20} viewBox="0 0 24 24" aria-hidden>
          <defs>
            <linearGradient id="g2" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" />
              <stop offset="1" stopColor="var(--brand-2)" />
            </linearGradient>
          </defs>
        <circle cx="12" cy="12" r="10" fill="url(#g2)" />
        <path d="M7 12h10M12 7v10" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span style={{ 
          fontWeight: 800, 
          fontSize: isMobile ? 14 : 15, 
          letterSpacing: 0.2, 
          userSelect: "none" 
        }}>
          Sway
        </span>
      </div>

      {/* Navegação - Desktop */}
      {!isMobile && (
        <nav aria-label="Principal" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <NavBtn to="/" title="Chat"><span>Chat</span></NavBtn>
          <NavBtn to="/contacts" title="Contatos"><span>Contatos</span></NavBtn>
          <NavBtn to="/kanban" title="Kanban"><span>Kanban</span></NavBtn>
          <NavBtn to="/tasks" title="Tarefas"><span>Tarefas</span></NavBtn>
          <NavBtn to="/profile" title="Minha conta"><span>Minha conta</span></NavBtn>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          <button
            className="btn soft"
            onClick={toggle}
            aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
            title={isDark ? "Modo claro" : "Modo escuro"}
            style={{
              padding: "4px 9px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              background: "transparent",
              color: "var(--text)",
              border: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              transition: "background .15s ease, color .15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "var(--panel)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "transparent")}
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 2px" }} />

          <button
            className="btn soft"
            onClick={logout}
            aria-label="Sair"
            title="Sair"
            style={{
              padding: "4px 9px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              background: "var(--danger-soft)",
              color: "var(--danger)",
              border: "none",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "brightness(0.98)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.filter = "none")}
          >
            Sair
          </button>
        </nav>
      )}

      {/* Mobile - Menu e controles */}
      {isMobile && (
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: 6, 
          flexShrink: 0,
          minWidth: 0,
        }}>
          {/* Botão Modo Escuro */}
          <button
            className="btn soft"
            onClick={toggle}
            aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              fontSize: 16,
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          {/* Menu dropdown */}
          <div style={{ position: "relative" }}>
            <button
              className="btn soft"
              onClick={() => setShowMenu(!showMenu)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 18,
                background: "transparent",
                color: "var(--text)",
                border: "1px solid var(--border)",
                display: "inline-flex",
                alignItems: "center",
              }}
              aria-label="Menu"
            >
              {showMenu ? "✕" : "☰"}
            </button>

            {showMenu && (
              <>
                <div
                  style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 9999,
                    background: "rgba(0,0,0,0.3)",
                  }}
                  onClick={() => setShowMenu(false)}
                />
                <div
                  style={{
                    position: "fixed",
                    top: "50px",
                    right: "10px",
                    background: "var(--panel)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 0",
                    minWidth: 200,
                    maxWidth: "90vw",
                    zIndex: 10000,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
                    maxHeight: "calc(100vh - 70px)",
                    overflowY: "auto",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
                    <button
                      onClick={() => { navigate("/dashboard"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      📊 Dashboard
                    </button>
                    <button
                      onClick={() => { navigate("/"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      💬 Chat
                    </button>
                    <button
                      onClick={() => { navigate("/contacts"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      👥 Contatos
                    </button>
                    <button
                      onClick={() => { navigate("/kanban"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      📋 Kanban
                    </button>
                    <button
                      onClick={() => { navigate("/tasks"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      ✅ Tarefas
                    </button>
                    <button
                      onClick={() => { navigate("/profile"); setShowMenu(false); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        background: "transparent",
                        border: "none",
                        borderRadius: 6,
                        color: "var(--text)",
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      👤 Minha conta
                    </button>
                  </div>
                  <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />
                  <button
                    className="btn soft"
                    onClick={() => {
                      logout();
                      setShowMenu(false);
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      color: "var(--danger)",
                      background: "var(--danger-soft)",
                    }}
                  >
                    🚪 Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}