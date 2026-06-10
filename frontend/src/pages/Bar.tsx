import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import type { BarStatus, ChatMessage, JukeboxState, PresencePayload, User, WSMessage, WalletPayload } from "../types";
import { COMMANDS } from "../components/constants";
import LeftSidebar from "../components/LeftSidebar";
import ChatHeader from "../components/ChatHeader";
import NowPlayingBanner from "../components/NowPlayingBanner";
import MessageList from "../components/MessageList";
import TypingIndicator from "../components/TypingIndicator";
import WhisperPanel from "../components/WhisperPanel";
import QueueOverlay from "../components/QueueOverlay";
import ChatInput from "../components/ChatInput";
import DmToast from "../components/DmToast";
import RightSidebar from "../components/RightSidebar";
import LoungePopup from "../components/LoungePopup";
import CheersOverlay from "../components/CheersOverlay";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function Bar({ user, onLogout }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PresencePayload["users"]>([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteCodes, setInviteCodes] = useState<string[]>([]);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [whisperTarget, setWhisperTarget] = useState<{ nickname: string; role: string } | null>(null);
  const [whisperChats, setWhisperChats] = useState<Record<string, ChatMessage[]>>({});
  const [unreadWhispers, setUnreadWhispers] = useState<Record<string, number>>({});
  const [whisperInput, setWhisperInput] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dmToast, setDmToast] = useState<{ from: string; fromRole: string } | null>(null);
  const [jukebox, setJukebox] = useState<JukeboxState | null>(null);
  const [hasVotedSkip, setHasVotedSkip] = useState(false);
  const [nowPlayingTitle, setNowPlayingTitle] = useState("");
  const [loopMode, setLoopMode] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [cmdQuery, setCmdQuery] = useState<string | null>(null);
  const [cmdIndex, setCmdIndex] = useState(0);
  const [loungeOpen, setLoungeOpen] = useState(false);
  const [cheersFrom, setCheersFrom] = useState<string | null>(null);
  const [barOpen, setBarOpen] = useState(true);
  const [lastCallAt, setLastCallAt] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const whisperBottomRef = useRef<HTMLDivElement>(null);
  const whisperTargetRef = useRef<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);
  const currentVideoIdRef = useRef<string | null>(null);
  const loopModeRef = useRef(false);

  useEffect(() => {
    fetch("/api/invite", { headers: { Authorization: `Bearer ${user.token}` } })
      .then((r) => r.json())
      .then((d) => setInviteCodes(d.codes ?? []))
      .catch(() => {});
  }, [user.token]);

  useEffect(() => {
    fetch("/api/wallet", { headers: { Authorization: `Bearer ${user.token}` } })
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(() => {});
  }, [user.token]);

  useEffect(() => {
    if (!dmToast) return;
    const t = setTimeout(() => setDmToast(null), 4000);
    return () => clearTimeout(t);
  }, [dmToast]);

  // Load YouTube IFrame API once (audio-only hidden player)
  useEffect(() => {
    if ((window as any).YT?.Player) return; // eslint-disable-line @typescript-eslint/no-explicit-any
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, []);

  // Keep loopModeRef in sync so the YT player closure always reads latest value
  useEffect(() => { loopModeRef.current = loopMode; }, [loopMode]);

  // Reset per-song state when the song changes
  useEffect(() => {
    setHasVotedSkip(false);
    setNowPlayingTitle("");
  }, [jukebox?.current?.videoId]);

  const handleMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "history": {
        const { messages: hist } = msg.payload as { messages: ChatMessage[] };
        setMessages(hist.map((m) => ({ ...m, reactions: m.reactions ?? {} })));
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 0);
        break;
      }
      case "chat": {
        const m = msg.payload as ChatMessage;
        setMessages((prev) => [...prev, { ...m, reactions: m.reactions ?? {} }]);
        if (isAtBottomRef.current) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
        }
        break;
      }
      case "presence":
        setOnlineUsers((msg.payload as PresencePayload).users);
        break;
      case "typing": {
        const { nickname } = msg.payload as { nickname: string };
        setTypingUsers((prev) => (prev.includes(nickname) ? prev : [...prev, nickname]));
        break;
      }
      case "typing_stop": {
        const { nickname } = msg.payload as { nickname: string };
        setTypingUsers((prev) => prev.filter((n) => n !== nickname));
        break;
      }
      case "reaction": {
        const { messageId, reactions } = msg.payload as { messageId: number; reactions: Record<string, string[]> };
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
        break;
      }
      case "edit_message": {
        const { messageId, content, editedAt } = msg.payload as { messageId: number; content: string; editedAt: string };
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, content, editedAt } : m)));
        break;
      }
      case "delete_message": {
        const { messageId } = msg.payload as { messageId: number };
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        break;
      }
      case "whisper": {
        const m = msg.payload as ChatMessage;
        const partner = m.senderNick === user.nickname ? (m.targetNick ?? "") : m.senderNick;
        if (!partner) break;
        setWhisperChats((prev) => ({
          ...prev,
          [partner]: [...(prev[partner] ?? []), { ...m, reactions: m.reactions ?? {} }],
        }));
        if (whisperTargetRef.current === partner) {
          setTimeout(() => whisperBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
        } else {
          setUnreadWhispers((prev) => ({ ...prev, [partner]: (prev[partner] ?? 0) + 1 }));
          setDmToast({ from: partner, fromRole: m.role });
        }
        break;
      }
      case "whisper_history": {
        const { messages: hist, targetNick } = msg.payload as { messages: ChatMessage[]; targetNick: string };
        setWhisperChats((prev) => ({
          ...prev,
          [targetNick]: hist.map((m) => ({ ...m, reactions: m.reactions ?? {} })),
        }));
        setTimeout(() => whisperBottomRef.current?.scrollIntoView({ behavior: "instant" }), 0);
        break;
      }
      case "jukebox_state": {
        const state = msg.payload as JukeboxState;
        setJukebox(state);
        if (state.current) {
          const videoId = state.current.videoId;
          if (videoId === currentVideoIdRef.current && ytPlayerRef.current) break;
          currentVideoIdRef.current = videoId;
          const elapsed = Math.floor(
            (Date.now() - new Date(state.current.startedAt).getTime()) / 1000
          );
          const doInit = () => {
            if (!ytContainerRef.current) return;
            ytContainerRef.current.innerHTML = "";
            const playerEl = document.createElement("div");
            ytContainerRef.current.appendChild(playerEl);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ytPlayerRef.current = new (window as any).YT.Player(playerEl, {
              videoId,
              width: "1",
              height: "1",
              playerVars: { autoplay: 1, start: elapsed, rel: 0 },
              events: {
                onReady: () => {
                  const title = ytPlayerRef.current?.getVideoData?.()?.title;
                  if (title) setNowPlayingTitle(title);
                  const savedVol = Number(localStorage.getItem("amber_volume") ?? 80);
                  ytPlayerRef.current?.setVolume?.(savedVol);
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onStateChange: (e: any) => {
                  if (e.data !== 0) return;
                  if (loopModeRef.current) {
                    send({ type: "jukebox_add", payload: { videoId } });
                  } else {
                    send({ type: "jukebox_ended", payload: { videoId } });
                  }
                },
              },
            });
          };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).YT?.Player) doInit();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          else (window as any).onYouTubeIframeAPIReady = doInit;
        } else {
          currentVideoIdRef.current = null;
          ytPlayerRef.current?.stopVideo?.();
        }
        break;
      }
      case "cheers": {
        const { from } = msg.payload as { from: string };
        setCheersFrom(from);
        break;
      }
      case "bar_status": {
        const s = msg.payload as BarStatus;
        setBarOpen(s.open);
        setLastCallAt(s.lastCallAt ?? null);
        break;
      }
      case "wallet": {
        const { balance: bal } = msg.payload as WalletPayload;
        setBalance(bal);
        break;
      }
      case "music":
      case "system":
        break;
    }
  }, []);

  const { send } = useWebSocket(user.token, handleMessage);

  const stopTyping = () => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    send({ type: "typing_stop", payload: {} });
  };

  const sendWhisper = () => {
    if (!whisperInput.trim() || !whisperTarget) return;
    send({ type: "whisper", payload: { content: whisperInput.trim(), targetNick: whisperTarget.nickname } });
    setWhisperInput("");
  };

  const openWhisper = (u: { nickname: string; role: string }) => {
    setWhisperTarget(u);
    whisperTargetRef.current = u.nickname;
    setUnreadWhispers((prev) => { const next = { ...prev }; delete next[u.nickname]; return next; });
    send({ type: "whisper_history", payload: { targetNick: u.nickname } });
  };

  const insertMention = (nickname: string) => {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? input.length;
    const before = input.slice(0, cursor).replace(/@\w*$/, `@${nickname} `);
    const after = input.slice(cursor);
    const next = before + after;
    setInput(next);
    setMentionQuery(null);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      if (el) {
        el.selectionStart = el.selectionEnd = before.length;
        el.focus();
      }
    });
  };

  const sendMessage = () => {
    if (!input.trim()) return;
    stopTyping();
    send({
      type: "chat",
      payload: {
        content: input.trim(),
        ...(replyingTo ? { replyTo: replyingTo.id } : {}),
      },
    });
    setInput("");
    setReplyingTo(null);
  };

  const startReply = (m: ChatMessage) => {
    setReplyingTo(m);
    setHoveredMsgId(null);
  };

  const startEdit = (m: ChatMessage) => {
    setEditingId(m.id);
    setEditText(m.content);
    setHoveredMsgId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  const saveEdit = (msgId: number) => {
    const text = editText.trim();
    if (!text) return;
    send({ type: "edit_message", payload: { messageId: msgId, content: text } });
    cancelEdit();
  };

  const uploadAndSend = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("upload failed");
      const { url } = await res.json();
      send({ type: "chat", payload: { content: "", mediaUrl: url } });
    } catch {
      alert("Upload failed. Only images are supported (max 10 MB).");
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const fileItem = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (!fileItem) return;
    e.preventDefault();
    const file = fileItem.getAsFile();
    if (file) uploadAndSend(file);
  };

  const handleScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const react = (msgId: number, emoji: string) => {
    send({ type: "reaction", payload: { messageId: msgId, emoji } });
  };

  const deleteMsg = (msgId: number) => {
    send({ type: "delete_message", payload: { messageId: msgId } });
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch { /* ignore */ }
  };

  const parseVideoId = (rawInput: string): string | null => {
    const m = rawInput.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{11}$/.test(rawInput) ? rawInput : null;
  };

  const executeInputOrCommand = () => {
    const val = input.trim();
    if (!val.startsWith("/")) { sendMessage(); return; }
    const parts = val.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ").trim();
    setInput("");
    setCmdQuery(null);
    switch (cmd) {
      case "play": {
        const videoId = parseVideoId(arg);
        if (videoId) send({ type: "jukebox_add", payload: { videoId } });
        break;
      }
      case "skip":
        if (!hasVotedSkip && jukebox?.current) {
          send({ type: "jukebox_vote_skip", payload: {} });
          setHasVotedSkip(true);
        }
        break;
      case "queue":
        setShowQueue(v => !v);
        break;
      case "loop":
        setLoopMode(arg === "on");
        break;
      case "w": {
        const target = arg.replace(/^@/, "").split(/\s+/)[0];
        const u = onlineUsers.find(u => u.nickname.toLowerCase() === target.toLowerCase());
        if (u) openWhisper(u);
        break;
      }
    }
  };

  // Derived values
  const staffUsers = onlineUsers.filter((u) => u.role === "staff");
  const guestUsers = onlineUsers.filter((u) => u.role === "customer");
  const effectiveBarOpen = barOpen && staffUsers.length > 0;
  const cmdCandidates = cmdQuery === null ? [] : COMMANDS.filter(c => c.name.startsWith(cmdQuery.toLowerCase()));
  const mentionCandidates = mentionQuery === null ? [] :
    onlineUsers.filter(u => u.nickname !== user.nickname && u.nickname.toLowerCase().startsWith(mentionQuery.toLowerCase()));
  const unreadWhisperTotal = Object.values(unreadWhispers).reduce((s, n) => s + n, 0);

  const handleInputChange = (value: string) => {
    setInput(value);
    if (value.startsWith("/")) {
      const afterSlash = value.slice(1);
      const spaceIdx = afterSlash.indexOf(" ");
      if (spaceIdx === -1) {
        setCmdQuery(afterSlash); setCmdIndex(0); setMentionQuery(null);
      } else {
        setCmdQuery(null);
        if (afterSlash.slice(0, spaceIdx) === "w") {
          const m = afterSlash.slice(spaceIdx + 1).match(/@(\w*)$/);
          if (m) { setMentionQuery(m[1]); setMentionIndex(0); } else setMentionQuery(null);
        } else { setMentionQuery(null); }
      }
      return;
    }
    setCmdQuery(null);
    send({ type: "typing", payload: {} });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(stopTyping, 2000);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const m = value.slice(0, cursor).match(/@(\w*)$/);
    if (m) { setMentionQuery(m[1]); setMentionIndex(0); } else setMentionQuery(null);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (cmdCandidates.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCmdIndex(i => Math.min(i + 1, cmdCandidates.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCmdIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter" && cmdQuery !== null)) { e.preventDefault(); setInput("/" + cmdCandidates[cmdIndex].hint + " "); setCmdQuery(null); return; }
      if (e.key === "Escape") { setCmdQuery(null); return; }
    }
    if (mentionCandidates.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionCandidates.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter" && mentionQuery !== null)) { e.preventDefault(); insertMention(mentionCandidates[mentionIndex].nickname); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); executeInputOrCommand(); }
    if (e.key === "Escape" && replyingTo) { e.preventDefault(); setReplyingTo(null); }
  };

  return (
    <div className="bar-root">
      {(sidebarOpen || membersOpen) && (
        <div
          onClick={() => { setSidebarOpen(false); setMembersOpen(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(80,40,10,0.28)", zIndex: 199 }}
        />
      )}

      <LeftSidebar
        open={sidebarOpen}
        user={user}
        inviteCodes={inviteCodes}
        copiedCode={copiedCode}
        loungeOpen={loungeOpen}
        barOpen={effectiveBarOpen}
        lastCallAt={lastCallAt}
        onToggleLounge={() => setLoungeOpen(v => !v)}
        onCheers={() => send({ type: "cheers", payload: {} })}
        onToggleBarStatus={(open, lc) => send({ type: "bar_status", payload: { open, ...(lc ? { lastCallAt: lc } : {}) } })}
        onCopyCode={copyCode}
        onLogout={() => { setSidebarOpen(false); onLogout(); }}
      />

      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <ChatHeader
          onlineUsers={onlineUsers}
          unreadWhisperTotal={unreadWhisperTotal}
          membersOpen={membersOpen}
          barOpen={effectiveBarOpen}
          lastCallAt={lastCallAt}
          balance={balance}
          onToggleSidebar={() => { setMembersOpen(false); setSidebarOpen(o => !o); }}
          onToggleMembers={() => { setSidebarOpen(false); setMembersOpen(o => !o); }}
        />

        {jukebox?.current && (
          <NowPlayingBanner
            current={jukebox.current}
            nowPlayingTitle={nowPlayingTitle}
            skipVotes={jukebox.skipVotes}
            skipThreshold={jukebox.skipThreshold}
            loopMode={loopMode}
            ytPlayerRef={ytPlayerRef}
          />
        )}

        <MessageList
          messages={messages}
          currentUserNick={user.nickname}
          currentUserRole={user.role}
          hoveredMsgId={hoveredMsgId}
          editingId={editingId}
          editText={editText}
          chatRef={chatRef}
          bottomRef={bottomRef}
          onScroll={handleScroll}
          onHover={setHoveredMsgId}
          onReact={react}
          onReply={startReply}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onDeleteMsg={deleteMsg}
          onEditTextChange={setEditText}
        />

        <TypingIndicator typingUsers={typingUsers} />

        {whisperTarget && (
          <WhisperPanel
            whisperTarget={whisperTarget}
            messages={whisperChats[whisperTarget.nickname] ?? []}
            whisperInput={whisperInput}
            currentUserNick={user.nickname}
            whisperBottomRef={whisperBottomRef}
            onClose={() => { setWhisperTarget(null); whisperTargetRef.current = null; }}
            onInputChange={setWhisperInput}
            onSend={sendWhisper}
          />
        )}

        {showQueue && jukebox && (
          <QueueOverlay
            jukebox={jukebox}
            nowPlayingTitle={nowPlayingTitle}
            onClose={() => setShowQueue(false)}
          />
        )}

        <ChatInput
          input={input}
          uploading={uploading}
          replyingTo={replyingTo}
          cmdCandidates={cmdCandidates}
          cmdIndex={cmdIndex}
          mentionCandidates={mentionCandidates}
          mentionIndex={mentionIndex}
          fileInputRef={fileInputRef}
          textareaRef={textareaRef}
          onInputChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onSend={executeInputOrCommand}
          onFileChange={uploadAndSend}
          onCancelReply={() => setReplyingTo(null)}
          onSelectCommand={(hint) => { setInput("/" + hint + " "); setCmdQuery(null); }}
          onSelectMention={insertMention}
        />

        {dmToast && (
          <DmToast
            toast={dmToast}
            onOpen={() => { openWhisper({ nickname: dmToast.from, role: dmToast.fromRole }); setDmToast(null); }}
          />
        )}
      </main>

      <RightSidebar
        open={membersOpen}
        staffUsers={staffUsers}
        guestUsers={guestUsers}
        currentUserNick={user.nickname}
        currentUserRole={user.role}
        token={user.token}
        whisperTargetNick={whisperTarget?.nickname ?? null}
        unreadWhispers={unreadWhispers}
        onOpenWhisper={openWhisper}
        onBalanceChange={setBalance}
      />

      {/* Hidden 1×1 YT player — audio only, not visible to user */}
      <div
        ref={ytContainerRef}
        style={{ position: "fixed", width: 1, height: 1, bottom: 0, right: 0, overflow: "hidden", pointerEvents: "none" }}
      />

      {loungeOpen && <LoungePopup onlineUsers={onlineUsers} onClose={() => setLoungeOpen(false)} />}
      {cheersFrom && <CheersOverlay from={cheersFrom} onDone={() => setCheersFrom(null)} />}
    </div>
  );
}
