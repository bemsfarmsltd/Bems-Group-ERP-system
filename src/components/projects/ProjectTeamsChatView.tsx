'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Crown,
  FileText,
  Hash,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pin,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { AssigneeAvatarChip } from '@/components/projects/pmUiPrimitives';

interface ProjectTeamsChatViewProps {
  projects: any[];
  departments: Array<{ id: string; name: string }>;
  workItems: any[];
  actor: { id: string; legalName: string; role: string };
  isExecutive: boolean;
  initialProjectId?: string;
  onRefreshWorkspace?: () => Promise<void>;
}

const QUICK_EMOJIS = ['👍', '🚀', '✅', '🔥', '👀'];

export default function ProjectTeamsChatView({
  projects,
  departments,
  workItems,
  actor,
  isExecutive,
  initialProjectId,
  onRefreshWorkspace,
}: ProjectTeamsChatViewProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    initialProjectId || projects[0]?.id || ''
  );
  const [channels, setChannels] = useState<any[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // New Department / Chat Group modal
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newChanName, setNewChanName] = useState('');
  const [newChanDeptId, setNewChanDeptId] = useState('');
  const [newChanType, setNewChanType] = useState('DEPARTMENT');
  const [newChanDesc, setNewChanDesc] = useState('');

  // Composer state
  const [draft, setDraft] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [linkedWorkItemId, setLinkedWorkItemId] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ title: string; fileUrl: string; assetKind: string }>
  >([]);
  const [sending, setSending] = useState(false);

  // Thread drawer state
  const [threadRootId, setThreadRootId] = useState<string | null>(null);
  const [threadDraft, setThreadDraft] = useState('');

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) || channels[0] || null,
    [channels, activeChannelId]
  );

  const projectWorkItems = useMemo(
    () => workItems.filter((w) => w.projectId === activeProject?.id),
    [workItems, activeProject?.id]
  );

  const fetchChat = useCallback(
    async (projId: string, chanId?: string) => {
      if (!projId) return;
      setLoading(true);
      try {
        const qs = new URLSearchParams({ projectId: projId });
        if (chanId) qs.set('channelId', chanId);
        const res = await fetch(`/api/projects/chat?${qs.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (res.ok) {
          setChannels(json.channels || []);
          const nextChanId = chanId && (json.channels || []).some((c: any) => c.id === chanId)
            ? chanId
            : json.activeChannelId || json.channels?.[0]?.id || '';
          setActiveChannelId(nextChanId);
          setMessages(json.messages || []);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeProject?.id) {
      fetchChat(activeProject.id);
      setThreadRootId(null);
    }
  }, [activeProject?.id, fetchChat]);

  // Smart 5s polling while chat is open
  useEffect(() => {
    if (!activeProject?.id || !activeChannelId) return;
    const timer = setInterval(() => {
      fetchChat(activeProject.id, activeChannelId);
    }, 5000);
    return () => clearInterval(timer);
  }, [activeProject?.id, activeChannelId, fetchChat]);

  const rootMessages = useMemo(
    () => messages.filter((m) => !m.parentMessageId),
    [messages]
  );

  const pinnedMessages = useMemo(
    () => rootMessages.filter((m) => m.isPinned),
    [rootMessages]
  );

  const threadRoot = useMemo(
    () => rootMessages.find((m) => m.id === threadRootId) || null,
    [rootMessages, threadRootId]
  );

  const threadReplies = useMemo(
    () => messages.filter((m) => m.parentMessageId === threadRootId),
    [messages, threadRootId]
  );

  const deptNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    departments.forEach((d) => {
      map[d.id] = d.name;
    });
    return map;
  }, [departments]);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject?.id || !newChanName.trim()) return;
    const res = await fetch('/api/projects/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_CHANNEL',
        projectId: activeProject.id,
        name: newChanName.trim(),
        departmentId: newChanDeptId || null,
        channelType: newChanType,
        description: newChanDesc.trim() || null,
      }),
    });
    const json = await res.json();
    if (res.ok && json.channel) {
      setShowNewChannel(false);
      setNewChanName('');
      setNewChanDeptId('');
      setNewChanDesc('');
      await fetchChat(activeProject.id, json.channel.id);
    }
  };

  const handleUploadChatFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProject?.id) return;
    const fd = new FormData();
    fd.append('projectId', activeProject.id);
    fd.append('title', file.name);
    fd.append('category', 'FIELD_MEDIA');
    fd.append('file', file);
    const res = await fetch('/api/projects/attachments', { method: 'POST', body: fd });
    const json = await res.json();
    if (res.ok && json.document) {
      setPendingAttachments((prev) => [
        ...prev,
        {
          title: json.document.title,
          fileUrl: json.document.fileUrl,
          assetKind: json.document.assetKind,
        },
      ]);
    }
    e.target.value = '';
  };

  const handleSendMessage = async (e?: React.FormEvent, parentMessageId?: string) => {
    if (e) e.preventDefault();
    const text = (parentMessageId ? threadDraft : draft).trim();
    if (!text && pendingAttachments.length === 0) return;
    if (!activeProject?.id || !activeChannel?.id) return;

    setSending(true);
    try {
      const res = await fetch('/api/projects/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SEND_MESSAGE',
          projectId: activeProject.id,
          channelId: activeChannel.id,
          parentMessageId: parentMessageId || null,
          body: text || 'Shared attachment',
          isAnnouncement: parentMessageId ? false : isAnnouncement,
          linkedWorkItemId: parentMessageId ? null : linkedWorkItemId || null,
          attachments: parentMessageId ? [] : pendingAttachments,
        }),
      });
      if (res.ok) {
        if (parentMessageId) {
          setThreadDraft('');
        } else {
          setDraft('');
          setIsAnnouncement(false);
          setLinkedWorkItemId('');
          setPendingAttachments([]);
        }
        await fetchChat(activeProject.id, activeChannel.id);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
      }
    } finally {
      setSending(false);
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    await fetch('/api/projects/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TOGGLE_REACTION', messageId, emoji }),
    });
    if (activeProject?.id && activeChannel?.id) {
      await fetchChat(activeProject.id, activeChannel.id);
    }
  };

  const handleTogglePin = async (messageId: string) => {
    await fetch('/api/projects/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'TOGGLE_PIN', messageId }),
    });
    if (activeProject?.id && activeChannel?.id) {
      await fetchChat(activeProject.id, activeChannel.id);
    }
  };

  const handleConvertToIssue = async (msg: any) => {
    if (!activeProject?.id) return;
    const res = await fetch('/api/projects/work-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CREATE_WORK_ITEM',
        projectId: activeProject.id,
        title: msg.body.slice(0, 120),
        description: `Created from #${activeChannel?.name || 'chat'} message by ${msg.author?.legalName}:\n\n${msg.body}`,
        status: 'TODO',
        priority: 'MEDIUM',
      }),
    });
    if (res.ok && onRefreshWorkspace) {
      await onRefreshWorkspace();
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    await fetch(`/api/projects/chat?messageId=${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    if (activeProject?.id && activeChannel?.id) {
      await fetchChat(activeProject.id, activeChannel.id);
    }
  };

  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        Create or join a project to open its Microsoft Teams-style department chat rooms.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col lg:flex-row min-h-[640px] max-h-[78vh]">
      {/* Left Rail: Project Selector + Department Chat Groups + Members */}
      <aside className="w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 flex flex-col">
        <div className="p-3.5 border-b border-slate-200 bg-white">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
            Project Workspace
          </label>
          <select
            value={activeProject?.id || ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-orange-400 focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.projectCode} · {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="p-3 flex-1 overflow-y-auto space-y-4">
          {/* Channels / Department Chat Groups */}
          <div>
            <div className="flex items-center justify-between px-1 mb-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                Department &amp; Chat Groups ({channels.length})
              </span>
              <button
                type="button"
                onClick={() => setShowNewChannel(true)}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-orange-600"
                title="Create new department / group chat"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-1">
              {channels.map((ch) => {
                const active = ch.id === activeChannel?.id;
                const deptName = ch.departmentId ? deptNameMap[ch.departmentId] : null;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => {
                      setActiveChannelId(ch.id);
                      setThreadRootId(null);
                      fetchChat(activeProject.id, ch.id);
                    }}
                    className={`w-full text-left rounded-xl px-2.5 py-2 transition flex items-center justify-between gap-2 ${
                      active
                        ? 'bg-orange-600 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      {ch.departmentId ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 opacity-85" />
                      ) : (
                        <Hash className="h-3.5 w-3.5 shrink-0 opacity-85" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{ch.name}</div>
                        {deptName && (
                          <div className={`text-[10px] truncate ${active ? 'text-orange-100' : 'text-slate-400'}`}>
                            {deptName}
                          </div>
                        )}
                      </div>
                    </div>
                    {ch._count?.messages > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          active ? 'bg-orange-700 text-white' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {ch._count.messages}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assigned Members Roster */}
          <div>
            <div className="px-1 mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              <Users className="h-3 w-3" /> Project Members ({activeProject?.members?.length || 0})
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto">
              {(activeProject?.members || []).map((m: any) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <AssigneeAvatarChip name={m.employee?.legalName || 'Staff'} size={20} />
                    <span className="truncate font-semibold text-slate-700">{m.employee?.legalName}</span>
                  </div>
                  {(activeProject.teamLeadId === m.employeeId || m.projectRole === 'TEAM_LEAD') && (
                    <span title="Team Lead" className="shrink-0">
                      <Crown className="h-3 w-3 text-orange-600" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* Center Stream: Channel Messages & Composer */}
      <section className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Channel Header */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-orange-600" />
              <h3 className="text-sm font-extrabold text-slate-900 truncate">
                {activeChannel?.name || 'General'}
              </h3>
              {activeChannel?.departmentId && deptNameMap[activeChannel.departmentId] && (
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                  {deptNameMap[activeChannel.departmentId]}
                </span>
              )}
            </div>
            {activeChannel?.description && (
              <p className="text-[11px] text-slate-500 truncate mt-0.5">{activeChannel.description}</p>
            )}
          </div>
          {loading && <span className="text-[11px] font-semibold text-slate-400">Syncing...</span>}
        </div>

        {/* Pinned Decisions Bar */}
        {pinnedMessages.length > 0 && (
          <div className="px-5 py-2 bg-amber-50/70 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-900 overflow-x-auto">
            <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="font-bold shrink-0">Pinned:</span>
            <span className="truncate font-medium">
              {pinnedMessages[0].author?.legalName}: &ldquo;{pinnedMessages[0].body}&rdquo;
            </span>
          </div>
        )}

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {rootMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-12 text-slate-400 space-y-2">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <div className="text-sm font-bold text-slate-600">
                Start the conversation in #{activeChannel?.name || 'General'}
              </div>
              <p className="text-xs max-w-sm">
                Post updates, @mention teammates, attach site photos or specs, link issues, or reply in threads just like Microsoft Teams.
              </p>
            </div>
          ) : (
            rootMessages.map((msg) => {
              let reactions: Record<string, string[]> = {};
              try {
                reactions = msg.reactionsJson ? JSON.parse(msg.reactionsJson) : {};
              } catch {}
              let attachments: any[] = [];
              try {
                attachments = msg.attachmentsJson ? JSON.parse(msg.attachmentsJson) : [];
              } catch {}
              const replyCount = messages.filter((r) => r.parentMessageId === msg.id).length;
              const linkedIssue = msg.linkedWorkItemId
                ? workItems.find((w) => w.id === msg.linkedWorkItemId)
                : null;

              return (
                <div
                  key={msg.id}
                  className={`group rounded-2xl border p-3.5 transition ${
                    msg.isAnnouncement
                      ? 'border-orange-300 bg-orange-50/50'
                      : 'border-slate-200/80 bg-white hover:border-slate-300'
                  }`}
                >
                  {msg.isAnnouncement && (
                    <div className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-orange-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                      <Megaphone className="h-3 w-3" /> ANNOUNCEMENT
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <AssigneeAvatarChip name={msg.author?.legalName || 'User'} size={28} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-900">{msg.author?.legalName}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(msg.createdAt).toLocaleString()}
                          </span>
                          {msg.isPinned && <Pin className="h-3 w-3 text-amber-600" />}
                        </div>
                      </div>
                    </div>

                    {/* Hover Toolbar */}
                    <div className="opacity-0 group-hover:opacity-100 transition flex items-center gap-1">
                      {QUICK_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => handleToggleReaction(msg.id, em)}
                          className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs hover:bg-slate-50"
                        >
                          {em}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setThreadRootId(msg.id)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:border-orange-300"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConvertToIssue(msg)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:border-orange-300"
                        title="Create tracked task from this message"
                      >
                        + Issue
                      </button>
                      {(isExecutive || activeProject?.teamLeadId === actor.id) && (
                        <button
                          type="button"
                          onClick={() => handleTogglePin(msg.id)}
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-500 hover:text-amber-600"
                          title="Pin / Unpin"
                        >
                          <Pin className="h-3 w-3" />
                        </button>
                      )}
                      {(isExecutive || msg.authorId === actor.id) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="rounded-md border border-slate-200 bg-white p-1 text-slate-400 hover:text-rose-600"
                          title="Delete message"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed pl-9">
                    {msg.body}
                  </p>

                  {linkedIssue && (
                    <div className="mt-2 ml-9 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px]">
                      <span className="font-mono font-bold text-orange-700">{linkedIssue.itemKey}</span>
                      <span className="font-semibold text-slate-700">{linkedIssue.title}</span>
                    </div>
                  )}

                  {attachments.length > 0 && (
                    <div className="mt-2 ml-9 flex flex-wrap gap-2">
                      {attachments.map((att, idx) =>
                        att.assetKind === 'IMAGE' ? (
                          <a key={idx} href={att.fileUrl} target="_blank" rel="noreferrer">
                            <img
                              src={att.fileUrl}
                              alt={att.title}
                              className="h-24 w-36 rounded-xl border border-slate-200 object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            key={idx}
                            href={att.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-orange-300"
                          >
                            <FileText className="h-3.5 w-3.5 text-orange-600" />
                            {att.title}
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {/* Reactions + Thread Reply Counter */}
                  <div className="mt-2.5 ml-9 flex flex-wrap items-center gap-2">
                    {Object.entries(reactions).map(([em, users]) =>
                      users.length > 0 ? (
                        <button
                          key={em}
                          type="button"
                          onClick={() => handleToggleReaction(msg.id, em)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                            users.includes(actor.id)
                              ? 'border-orange-300 bg-orange-50 text-orange-800'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {em} {users.length}
                        </button>
                      ) : null
                    )}
                    {replyCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setThreadRootId(msg.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:underline"
                      >
                        <MessageSquare className="h-3 w-3" /> {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Teams-Style Composer */}
        <form onSubmit={(e) => handleSendMessage(e)} className="border-t border-slate-200 p-3.5 bg-slate-50/70 space-y-2">
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pendingAttachments.map((att, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700"
                >
                  {att.title}
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={`Message #${activeChannel?.name || 'General'}... (Enter to send, Shift+Enter for new line)`}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-orange-400 focus:outline-none resize-none"
            />
            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-orange-300">
                <Paperclip className="h-3 w-3 text-orange-600" /> Attach File / Photo
                <input type="file" className="hidden" onChange={handleUploadChatFile} />
              </label>
              <select
                value={linkedWorkItemId}
                onChange={(e) => setLinkedWorkItemId(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700 max-w-[200px]"
              >
                <option value="">Link Issue (Optional)</option>
                {projectWorkItems.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.itemKey} · {w.title}
                  </option>
                ))}
              </select>
            </div>
            {(isExecutive || activeProject?.teamLeadId === actor.id) && (
              <label className="inline-flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAnnouncement}
                  onChange={(e) => setIsAnnouncement(e.target.checked)}
                  className="rounded border-slate-300 text-orange-600"
                />
                Post as Announcement
              </label>
            )}
          </div>
        </form>
      </section>

      {/* Right Pane: Threaded Replies Drawer */}
      {threadRoot && (
        <aside className="w-full lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-200 bg-slate-50/60 flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-900">Thread</span>
            <button
              type="button"
              onClick={() => setThreadRootId(null)}
              className="rounded p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1">
              <div className="text-xs font-extrabold text-slate-900">{threadRoot.author?.legalName}</div>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{threadRoot.body}</p>
            </div>
            <div className="text-[10px] font-bold uppercase text-slate-400">
              Replies ({threadReplies.length})
            </div>
            {threadReplies.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-900">{r.author?.legalName}</span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(r.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{r.body}</p>
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => handleSendMessage(e, threadRoot.id)}
            className="p-3 border-t border-slate-200 bg-white flex gap-2"
          >
            <input
              value={threadDraft}
              onChange={(e) => setThreadDraft(e.target.value)}
              placeholder="Reply in thread..."
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 focus:border-orange-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending}
              className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              Reply
            </button>
          </form>
        </aside>
      )}

      {/* New Department / Group Chat Modal */}
      {showNewChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form
            onSubmit={handleCreateChannel}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900">Create Department / Group Chat</h3>
              <button type="button" onClick={() => setShowNewChannel(false)}>
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <input
              required
              value={newChanName}
              onChange={(e) => setNewChanName(e.target.value)}
              placeholder="Channel / Group Name (e.g. Lagos Field Ops, Finance, Backend)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newChanType}
                onChange={(e) => setNewChanType(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="DEPARTMENT">Department Group</option>
                <option value="SQUAD">Squad / Sub-Team</option>
                <option value="BLOCKERS">Blockers &amp; Escalations</option>
                <option value="HANDOVER">Handover &amp; QA</option>
              </select>
              <select
                value={newChanDeptId}
                onChange={(e) => setNewChanDeptId(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={newChanDesc}
              onChange={(e) => setNewChanDesc(e.target.value)}
              placeholder="Channel purpose / topic (optional)"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNewChannel(false)}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-orange-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
              >
                Create Chat Group
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

