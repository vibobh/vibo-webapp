"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  ImagePlus,
  Info,
  Mic,
  MoreHorizontal,
  Send,
  Smile,
  Sticker,
  X,
} from "@/components/ui/icons";
import { useAction, useMutation, useQuery } from "convex/react";

import { ForwardMessageSheet } from "@/components/messaging/ForwardMessageSheet";
import { MessageMediaBubble } from "@/components/messaging/MessageMediaBubble";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { putFileToAllDualRegionTargets } from "@/lib/media/dualRegionPut";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

interface PeerLite {
  id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

interface PinnedPreview {
  messageId: Id<"messages">;
  type: string;
  text?: string;
  thumbUrl?: string;
  postPreview?: ThreadMessage["postPreview"];
}

interface ConversationDetail {
  id: Id<"conversations">;
  peer: PeerLite | null;
  isGroup?: boolean;
  groupTitle?: string;
  pinnedMessageId?: Id<"messages">;
  pinnedPreview?: PinnedPreview | null;
}

interface ThreadMessage {
  id: Id<"messages">;
  type: string;
  postId?: Id<"posts">;
  text?: string;
  createdAt: number;
  fromMe: boolean;
  status: "sent" | "failed" | "deleted";
  replyToMessageId?: Id<"messages">;
  replySnippet?: string;
  replyToSenderId?: Id<"users">;
  reactions?: Array<{ userId: Id<"users">; emoji: string }>;
  mediaKey?: string;
  mediaStorageRegion?: string;
  mediaThumbKey?: string;
  mediaThumbStorageRegion?: string;
  gifPreviewUrl?: string;
  gifUrl?: string;
  postPreview?: {
    postId?: string;
    authorUsername?: string;
    authorFullName?: string;
    authorProfilePictureUrl?: string;
    authorProfilePictureKey?: string;
    authorProfilePictureStorageRegion?: string;
    verificationTier?: "blue" | "gold" | "gray";
    thumbnailUrl?: string;
    displayUrl?: string;
    displayStorageRegion?: string;
    thumbnailStorageRegion?: string;
    caption?: string;
    mediaType?: string;
  } | null;
}

type ConversationQueryResult = {
  _id: Id<"conversations">;
  isGroup: boolean;
  title?: string;
  pinnedMessageId?: Id<"messages">;
  pinnedPreview?: PinnedPreview | null;
  participants: Id<"users">[];
  members: Array<{
    _id: Id<"users">;
    username?: string;
    fullName?: string;
    profilePictureUrl?: string;
    profilePictureKey?: string;
    profilePictureStorageRegion?: string;
  } | null>;
} | null;

type ListMessagesResult = {
  items: Array<{
    _id: Id<"messages">;
    senderId: Id<"users">;
    type: string;
    postId?: Id<"posts">;
    text?: string;
    createdAt: number;
    status?: "sent" | "failed" | "deleted";
    replyToMessageId?: Id<"messages">;
    replySnippet?: string;
    replyToSenderId?: Id<"users">;
    reactions?: Array<{ userId: Id<"users">; emoji: string }>;
    mediaKey?: string;
    mediaStorageRegion?: string;
    mediaThumbKey?: string;
    mediaThumbStorageRegion?: string;
    gifPreviewUrl?: string;
    gifUrl?: string;
    postPreview?: ThreadMessage["postPreview"];
  }>;
  nextCursor?: number | null;
};

function replySnippetPreview(m: Pick<ThreadMessage, "type" | "text" | "postPreview">): string {
  const t = m.text?.trim();
  if (t) return t.length > 80 ? `${t.slice(0, 77)}…` : t;
  if (m.type === "post_share") {
    const c = m.postPreview?.caption?.trim();
    if (c) return c.length > 80 ? `${c.slice(0, 77)}…` : c;
    return "Shared a post";
  }
  if (m.type === "collab_invite") {
    return "Collaboration invite";
  }
  if (m.type === "image") return "Photo";
  if (m.type === "video") return "Video";
  if (m.type === "gif") return "GIF";
  if (m.type === "voice") return "Voice message";
  return "Message";
}

function replyContextLine(
  m: ThreadMessage,
  viewerId: Id<"users">,
  peer: PeerLite | null,
): string | null {
  if (!m.replyToMessageId || !m.replyToSenderId) return null;
  if (String(m.replyToSenderId) === String(viewerId)) {
    return "You replied to yourself";
  }
  if (peer?.username) {
    return `You replied to @${peer.username}`;
  }
  return "You replied to this chat";
}

function mapThreadMessage(
  row: ListMessagesResult["items"][number],
  viewerId: Id<"users">,
): ThreadMessage {
  return {
    id: row._id,
    type: row.type,
    postId: row.postId,
    text: row.text,
    createdAt: row.createdAt,
    fromMe: String(row.senderId) === String(viewerId),
    status: row.status ?? "sent",
    replyToMessageId: row.replyToMessageId,
    replySnippet: row.replySnippet,
    replyToSenderId: row.replyToSenderId,
    reactions: row.reactions,
    mediaKey: row.mediaKey,
    mediaStorageRegion: row.mediaStorageRegion,
    mediaThumbKey: row.mediaThumbKey,
    mediaThumbStorageRegion: row.mediaThumbStorageRegion,
    gifPreviewUrl: row.gifPreviewUrl,
    gifUrl: row.gifUrl,
    postPreview: row.postPreview ?? null,
  };
}

export default function MessageThreadPage() {
  const { user } = useViboAuth();
  const params = useParams<{ conversationId: string }>();
  const conversationId = (params?.conversationId ?? "") as Id<"conversations">;
  const viewerId = user?.id as Id<"users"> | undefined;

  const threadEnabled = Boolean(viewerId && conversationId);

  const conversationRaw = useQuery(
    api.messages.getConversation,
    threadEnabled ? { viewerId: viewerId!, conversationId } : "skip",
  ) as ConversationQueryResult | undefined;

  const messagesRaw = useQuery(
    api.messages.listMessages,
    threadEnabled ? { viewerId: viewerId!, conversationId, limit: 80 } : "skip",
  ) as ListMessagesResult | undefined;

  const conversation = useMemo((): ConversationDetail | null | undefined => {
    if (!threadEnabled) return undefined;
    if (conversationRaw === undefined) return undefined;
    if (conversationRaw === null) return null;
    const vid = String(viewerId);
    const others =
      conversationRaw.members?.filter((m) => m && String(m._id) !== vid) ?? [];
    const primary = others[0];
    const peer: PeerLite | null = primary
      ? {
          id: primary._id,
          username: primary.username,
          fullName: primary.fullName,
          profilePictureUrl: primary.profilePictureUrl,
          profilePictureKey: primary.profilePictureKey,
          profilePictureStorageRegion: primary.profilePictureStorageRegion,
        }
      : null;
    return {
      id: conversationRaw._id,
      peer,
      isGroup: conversationRaw.isGroup,
      groupTitle: conversationRaw.isGroup ? conversationRaw.title : undefined,
      pinnedMessageId: conversationRaw.pinnedMessageId,
      pinnedPreview: conversationRaw.pinnedPreview ?? null,
    };
  }, [threadEnabled, conversationRaw, viewerId]);

  const messages = useMemo((): ThreadMessage[] | undefined => {
    if (!threadEnabled || !viewerId) return undefined;
    if (messagesRaw === undefined) return undefined;
    const items = messagesRaw.items ?? [];
    return items.map((row) => mapThreadMessage(row, viewerId));
  }, [threadEnabled, viewerId, messagesRaw]);

  const sendMessage = useMutation(api.messages.sendMessage);
  const acceptPostCollaboration = useMutation(api.posts.acceptPostCollaboration);
  const declinePostCollaboration = useMutation(api.posts.declinePostCollaboration);
  const markRead = useMutation(api.messages.markConversationRead);
  const unsendMessage = useMutation(api.messages.unsendMessage);
  const setPinnedMessage = useMutation(api.messages.setPinnedMessage);
  const toggleMessageReaction = useMutation(api.messages.toggleMessageReaction);

  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const [forwardMessageId, setForwardMessageId] = useState<Id<"messages"> | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<Id<"messages"> | null>(null);
  const [messageMenuFor, setMessageMenuFor] = useState<Id<"messages"> | null>(null);

  const [sending, setSending] = useState(false);
  const getUploadUrl = useAction(api.media.generateUploadUrl);

  type ComposerAttachment = { kind: "voice"; file: File } | { kind: "image"; file: File };

  const [attachment, setAttachment] = useState<ComposerAttachment | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const normalizeMimeType = (t: string) => t.split(";")[0].trim().toLowerCase();

  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
    };
  }, [voicePreviewUrl]);

  useEffect(() => {
    if (!attachment || attachment.kind !== "image") {
      setImagePreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(attachment.file);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useEffect(() => {
    if (messageMenuFor === null && reactionPickerFor === null) return;
    const onDoc = () => {
      setMessageMenuFor(null);
      setReactionPickerFor(null);
    };
    const id = window.setTimeout(() => document.addEventListener("click", onDoc), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", onDoc);
    };
  }, [messageMenuFor, reactionPickerFor]);

  const stopStream = () => {
    const s = mediaStreamRef.current;
    if (!s) return;
    for (const tr of s.getTracks()) tr.stop();
    mediaStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (!viewerId) return;
    setRecordingError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone not available in this browser");
      }

      setAttachment(null);
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
      setVoicePreviewUrl(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ];
      const supported = candidates.find((c) => MediaRecorder.isTypeSupported(c));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        stopStream();
        setIsRecording(false);

        const mimeBase = normalizeMimeType(recorder.mimeType || "audio/webm");
        const blob = new Blob(audioChunksRef.current, { type: mimeBase });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: mimeBase });

        setAttachment({ kind: "voice", file });
        setVoicePreviewUrl(URL.createObjectURL(file));
      };

      recorder.start();
      setIsRecording(true);
    } catch (e) {
      setRecordingError(e instanceof Error ? e.message : "Could not start recording");
      setIsRecording(false);
      stopStream();
    }
  };

  const stopVoiceRecording = () => {
    if (!mediaRecorderRef.current) return;
    try {
      mediaRecorderRef.current.stop();
    } catch {
      // ignore
    }
  };

  const uploadMessageMedia = async (file: File) => {
    if (!viewerId) throw new Error("Not signed in");
    if (!conversationId) throw new Error("Missing conversation");

    const fileTypeBase = normalizeMimeType(file.type || "application/octet-stream");
    const uploadType = "message" as const;

    const res = await getUploadUrl({
      userId: viewerId,
      fileType: fileTypeBase,
      uploadType,
      chatId: String(conversationId),
    });

    const { storageRegion: mediaStorageRegion } = await putFileToAllDualRegionTargets(
      file,
      fileTypeBase,
      res,
    );

    const mediaKey = res.key;
    return { mediaKey, mediaStorageRegion, mediaMimeType: fileTypeBase };
  };
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!threadEnabled || !messages) return;
    void markRead({ viewerId: viewerId!, conversationId }).catch(() => {});
  }, [threadEnabled, conversationId, messages, markRead, viewerId]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const peer = conversation?.peer ?? null;
  const isGroup = conversation?.isGroup === true;
  const handle = isGroup
    ? (conversation?.groupTitle?.replace(/\s+/g, "").toLowerCase() ?? "group")
    : (peer?.username ?? "vibo");
  const name =
    isGroup && conversation?.groupTitle
      ? conversation.groupTitle
      : (peer?.fullName ?? peer?.username ?? handle);

  const replyThumb = useMemo(() => {
    if (!replyTarget) return null;
    if (replyTarget.postPreview?.thumbnailUrl || replyTarget.postPreview?.displayUrl) {
      return replyTarget.postPreview.thumbnailUrl ?? replyTarget.postPreview.displayUrl ?? null;
    }
    if (replyTarget.gifPreviewUrl) return replyTarget.gifPreviewUrl;
    return null;
  }, [replyTarget]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    const prevDraft = draft;
    const prevAttachment = attachment;
    const prevReply = replyTarget;

    if (sending || !viewerId) return;
    if (!prevAttachment && !trimmed) return;
    if (!conversationId) return;

    const replyToMessageId = replyTarget?.id;

    setSending(true);
    try {
      if (prevAttachment) {
        setUploadingMedia(true);
        try {
          const uploadRes = await uploadMessageMedia(prevAttachment.file);
          await sendMessage({
            viewerId,
            conversationId,
            type: prevAttachment.kind === "voice" ? "voice" : "image",
            text: trimmed || undefined,
            mediaKey: uploadRes.mediaKey,
            mediaStorageRegion: uploadRes.mediaStorageRegion,
            mediaMimeType: uploadRes.mediaMimeType,
            ...(replyToMessageId ? { replyToMessageId } : {}),
          });
        } finally {
          setUploadingMedia(false);
        }

        setDraft("");
        setAttachment(null);
        setReplyTarget(null);
        if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
        setVoicePreviewUrl(null);
        return;
      }

      await sendMessage({
        viewerId,
        conversationId,
        type: "text",
        text: trimmed,
        ...(replyToMessageId ? { replyToMessageId } : {}),
      });
      setDraft("");
      setReplyTarget(null);
    } catch {
      setDraft(prevDraft);
      setAttachment(prevAttachment);
      setReplyTarget(prevReply);
    } finally {
      setSending(false);
    }
  };

  const scrollToPinned = () => {
    const id = conversation?.pinnedPreview?.messageId;
    if (!id) return;
    document.getElementById(`dm-msg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  if (!user?.id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[14px] text-neutral-600 dark:text-neutral-400">
          Sign in to view this conversation.
        </p>
        <Link
          href="/login"
          className="text-[14px] font-semibold text-vibo-primary hover:opacity-80"
        >
          Log in
        </Link>
      </div>
    );
  }

  const headerTitle = (
    <span className="flex min-w-0 items-center gap-3">
      <PeerAvatar peer={peer} size={36} />
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
          {name}
        </span>
        <span className="block truncate text-[12px] text-neutral-500 dark:text-neutral-400">
          Active now
        </span>
      </span>
    </span>
  );

  const pinnedLabel =
    conversation?.pinnedPreview?.type === "post_share" ||
    conversation?.pinnedPreview?.type === "collab_invite"
      ? conversation.pinnedPreview.postPreview?.authorUsername
        ? `Post · @${conversation.pinnedPreview.postPreview.authorUsername}`
        : "Attachment"
      : (conversation?.pinnedPreview?.text?.trim() ?? "Attachment");

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-900">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/messages"
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 md:hidden dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {!isGroup && peer?.username ? (
            <Link href={`/${peer.username}`} className="min-w-0">
              {headerTitle}
            </Link>
          ) : (
            <span className="min-w-0">{headerTitle}</span>
          )}
        </div>
        <button
          type="button"
          aria-label="Conversation info"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          <Info className="h-5 w-5" strokeWidth={1.9} />
        </button>
      </header>

      {conversation?.pinnedPreview ? (
        <button
          type="button"
          onClick={scrollToPinned}
          className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-left hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900/80 dark:hover:bg-neutral-900"
        >
          <span className="text-[14px]" aria-hidden>
            📌
          </span>
          {conversation.pinnedPreview.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={conversation.pinnedPreview.thumbUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-md object-cover"
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
            {pinnedLabel}
          </span>
        </button>
      ) : null}

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
        <div className="mb-5 flex flex-col items-center gap-2">
          <PeerAvatar peer={peer} size={80} />
          <p className="text-[16px] font-semibold text-neutral-900 dark:text-white">{name}</p>
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {isGroup ? "Group chat" : `${handle} · Vibo`}
          </p>
          {!isGroup && peer?.username ? (
            <Link
              href={`/${peer.username}`}
              className="mt-2 rounded-md bg-neutral-100 px-3 py-1.5 text-[13px] font-semibold text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
            >
              View profile
            </Link>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-3">
          {messages === undefined ? (
            <p className="py-8 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              Loading…
            </p>
          ) : messages.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-neutral-500 dark:text-neutral-400">
              No messages yet. Say hi.
            </p>
          ) : (
            messages.map((m) => {
              const ctx = replyContextLine(m, viewerId!, peer);
              const isDeleted = m.status === "deleted";
              const reactionBuckets =
                m.reactions?.reduce<Record<string, number>>((acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                  return acc;
                }, {}) ?? {};

              const bubbleColumn = (
                <div className="flex max-w-[min(320px,90vw)] flex-col" id={`dm-msg-${m.id}`}>
                  {ctx ? (
                    <p className="mb-1 text-[11px] text-neutral-500 dark:text-neutral-400">{ctx}</p>
                  ) : null}
                  {isDeleted ? (
                    <p className="rounded-2xl border border-neutral-200/80 bg-neutral-50 px-3 py-2 text-[13px] italic text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900/50">
                      Message unsent
                    </p>
                  ) : (
                    <MessageMediaBubble
                      type={m.type}
                      text={m.text}
                      mediaKey={m.mediaKey}
                      mediaStorageRegion={m.mediaStorageRegion}
                      mediaThumbKey={m.mediaThumbKey}
                      mediaThumbStorageRegion={m.mediaThumbStorageRegion}
                      gifPreviewUrl={m.gifPreviewUrl}
                      gifUrl={m.gifUrl}
                      postPreview={m.postPreview}
                      collaborationInvite={
                        m.type === "collab_invite" && m.postId
                          ? {
                              showInviteActions: !m.fromMe,
                              onAccept: async () => {
                                await acceptPostCollaboration({
                                  userId: viewerId!,
                                  postId: m.postId!,
                                });
                              },
                              onDecline: async () => {
                                await declinePostCollaboration({
                                  userId: viewerId!,
                                  postId: m.postId!,
                                });
                              },
                            }
                          : undefined
                      }
                      fromMe={m.fromMe}
                    />
                  )}
                  {Object.keys(reactionBuckets).length > 0 ? (
                    <div
                      className={`mt-1 flex flex-wrap gap-1 ${m.fromMe ? "justify-end" : "justify-start"}`}
                    >
                      {Object.entries(reactionBuckets).map(([emoji, count]) => (
                        <span
                          key={emoji}
                          className="rounded-full bg-neutral-200/90 px-2 py-0.5 text-[12px] dark:bg-neutral-800"
                        >
                          {emoji}
                          {count > 1 ? count : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );

              const actions = isDeleted ? null : (
                <div
                  className={`relative flex shrink-0 flex-col items-center gap-0.5 pt-1 ${m.fromMe ? "order-first mr-0.5" : "order-last ml-0.5"}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="Message options"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMessageMenuFor((id) => (id === m.id ? null : m.id));
                        setReactionPickerFor(null);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                    >
                      <MoreHorizontal className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                    {messageMenuFor === m.id ? (
                      <div
                        className="absolute bottom-full left-1/2 z-30 mb-1 w-36 -translate-x-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-[13px] hover:bg-neutral-100 dark:hover:bg-neutral-900"
                          onClick={() => {
                            setForwardMessageId(m.id);
                            setMessageMenuFor(null);
                          }}
                        >
                          Forward
                        </button>
                        <button
                          type="button"
                          className="block w-full px-3 py-2 text-left text-[13px] hover:bg-neutral-100 dark:hover:bg-neutral-900"
                          onClick={() => {
                            void setPinnedMessage({
                              viewerId: viewerId!,
                              conversationId,
                              messageId:
                                String(conversation?.pinnedMessageId) === String(m.id)
                                  ? undefined
                                  : m.id,
                            }).catch(() => {});
                            setMessageMenuFor(null);
                          }}
                        >
                          {String(conversation?.pinnedMessageId) === String(m.id) ? "Unpin" : "Pin"}
                        </button>
                        {m.fromMe ? (
                          <button
                            type="button"
                            className="block w-full px-3 py-2 text-left text-[13px] text-red-600 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                            onClick={() => {
                              void unsendMessage({
                                viewerId: viewerId!,
                                conversationId,
                                messageId: m.id,
                              }).catch(() => {});
                              setMessageMenuFor(null);
                            }}
                          >
                            Unsend
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    aria-label="Reply"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplyTarget(m);
                      setReactionPickerFor(null);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                  >
                    <ArrowLeft className="h-4 w-4 -scale-x-100" strokeWidth={2.2} />
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      aria-label="React"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReactionPickerFor((id) => (id === m.id ? null : m.id));
                        setMessageMenuFor(null);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
                    >
                      <Smile className="h-4 w-4" strokeWidth={2.2} />
                    </button>
                    {reactionPickerFor === m.id ? (
                      <div
                        className="absolute bottom-full left-1/2 z-30 mb-1 flex -translate-x-1/2 gap-0.5 rounded-full border border-neutral-200 bg-white px-1 py-0.5 shadow-lg dark:border-neutral-800 dark:bg-neutral-950"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {QUICK_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-full text-[16px] hover:bg-neutral-100 dark:hover:bg-neutral-900"
                            onClick={() => {
                              void toggleMessageReaction({
                                viewerId: viewerId!,
                                conversationId,
                                messageId: m.id,
                                emoji,
                              }).catch(() => {});
                              setReactionPickerFor(null);
                            }}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );

              return (
                <div
                  key={String(m.id)}
                  className={`flex w-full items-start ${m.fromMe ? "justify-end" : "justify-start"}`}
                >
                  {m.fromMe ? (
                    <>
                      {actions}
                      {bubbleColumn}
                    </>
                  ) : (
                    <>
                      {bubbleColumn}
                      {actions}
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {forwardMessageId ? (
        <ForwardMessageSheet
          open
          onClose={() => setForwardMessageId(null)}
          viewerId={viewerId!}
          sourceConversationId={conversationId}
          messageId={forwardMessageId}
        />
      ) : null}

      <form onSubmit={onSubmit} className="shrink-0 px-3 pb-4 pt-2">
        {replyTarget ? (
          <div className="mb-2 flex items-stretch gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
                Replying to{" "}
                {replyTarget.fromMe
                  ? "yourself"
                  : peer?.username
                    ? `@${peer.username}`
                    : "message"}
              </p>
              <p className="truncate text-[13px] text-neutral-800 dark:text-neutral-200">
                {replySnippetPreview(replyTarget)}
              </p>
            </div>
            {replyThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={replyThumb} alt="" className="h-11 w-11 shrink-0 rounded-md object-cover" />
            ) : null}
            <button
              type="button"
              aria-label="Cancel reply"
              onClick={() => setReplyTarget(null)}
              className="grid h-9 w-9 shrink-0 place-items-center self-center rounded-full text-neutral-500 hover:bg-neutral-200/80 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <div className="flex w-full items-center gap-2 rounded-full border border-neutral-300 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-black">
          <button
            type="button"
            aria-label="Emoji"
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
          >
            <Smile className="h-5 w-5" strokeWidth={1.9} />
          </button>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message..."
            className="h-9 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none dark:text-white dark:placeholder:text-neutral-500"
          />
          {draft.trim().length === 0 && !attachment ? (
            <>
              <button
                type="button"
                aria-label="Voice"
                disabled={sending || uploadingMedia}
                onClick={() => {
                  if (isRecording) stopVoiceRecording();
                  else void startVoiceRecording();
                }}
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <Mic className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <button
                type="button"
                aria-label="Photo"
                disabled={sending || uploadingMedia}
                onClick={() => imageInputRef.current?.click()}
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <ImagePlus className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl);
                  setVoicePreviewUrl(null);
                  setAttachment({ kind: "image", file: f });
                  setDraft("");
                }}
              />
              <button
                type="button"
                aria-label="Sticker"
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <Sticker className="h-5 w-5" strokeWidth={1.9} />
              </button>
              <button
                type="button"
                aria-label="Like"
                className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
              >
                <Heart className="h-5 w-5" strokeWidth={1.9} />
              </button>
            </>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={sending || uploadingMedia || isRecording}
              className="grid h-9 w-9 place-items-center rounded-full text-vibo-primary hover:opacity-80 disabled:opacity-50"
            >
              <Send className="h-5 w-5" strokeWidth={1.9} />
            </button>
          )}
        </div>
        {attachment ? (
          <div className="mt-2 px-2">
            {attachment.kind === "voice" ? (
              voicePreviewUrl ? (
                <audio src={voicePreviewUrl} controls className="w-full" />
              ) : (
                <p className="text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
                  Voice ready
                </p>
              )
            ) : imagePreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagePreviewUrl}
                alt="Selected"
                className="max-h-[180px] w-full rounded-2xl object-cover"
              />
            ) : null}
          </div>
        ) : null}
        {recordingError ? (
          <p className="mt-2 px-2 text-[13px] text-red-600 dark:text-red-400">{recordingError}</p>
        ) : null}
      </form>
    </div>
  );
}

function PeerAvatar({ peer, size }: { peer: PeerLite | null; size: number }) {
  const initial = (peer?.username ?? peer?.fullName ?? "V").charAt(0);
  return (
    <ResolvedProfileAvatar
      profilePictureUrl={peer?.profilePictureUrl}
      profilePictureKey={peer?.profilePictureKey}
      profilePictureStorageRegion={peer?.profilePictureStorageRegion}
      initial={initial}
      size={size}
    />
  );
}
