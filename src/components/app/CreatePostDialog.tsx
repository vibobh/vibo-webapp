"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { EmojiStyle, Theme } from "emoji-picker-react";

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ImagePlus,
  Loader2,
  Search,
  Smile,
  X,
  ZoomIn,
} from "@/components/ui/icons";
import { XStyleGlyph } from "@/components/ui/XStyleGlyph";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { readStoredLang } from "@/i18n/useViboLang";
import { putFileToAllDualRegionTargets } from "@/lib/media/dualRegionPut";
import { getConvexHttpOrigin } from "@/lib/convexHttp";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

const EmojiPickerLazy = dynamic(
  () => import("emoji-picker-react").then((mod) => mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="p-4 text-center text-[12px] text-neutral-500">Loading…</div>
    ),
  },
);

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  text: string,
  setValue: (v: string) => void,
  maxLen: number,
) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const next = (before + text + after).slice(0, maxLen);
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = Math.min(start + text.length, next.length);
    textarea.setSelectionRange(pos, pos);
  });
}

interface ViewerProfile {
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
}

interface CreatePostDialogProps {
  open: boolean;
  onClose: () => void;
  viewer: ViewerProfile;
  /** Called after a post is published successfully (refresh feed, etc). */
  onPublished?: () => void;
}

type Step = "select" | "crop" | "details";
type Aspect = "1:1" | "4:5" | "16:9";

interface LocalMedia {
  file: File;
  url: string;
  type: "image" | "video";
  /** Crop frame ratio for this item only (multi-image posts can mix 1:1, 4:5, etc.). */
  aspect: Aspect;
  /** Crop transform — center-based zoom + offset; aspect controls frame. */
  zoom: number;
  offsetX: number;
  offsetY: number;
}

/** People tagged on the post (caption options — not tied to image coordinates). */
interface PostPersonTag {
  userId: Id<"users">;
  username: string;
}

const ASPECTS: { id: Aspect; label: string; ratio: number }[] = [
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
];

const MAX_FILES = 10;

function getDict(lang: "en" | "ar") {
  if (lang === "ar") {
    return {
      createPost: "إنشاء منشور جديد",
      crop: "اقتصاص",
      next: "التالي",
      back: "رجوع",
      share: "مشاركة",
      sharing: "جارٍ المشاركة…",
      drag: "اسحب الصور والفيديوهات هنا",
      selectFromComputer: "اختيار من الجهاز",
      writeCaption: "اكتب تعليقًا…",
      addLocation: "إضافة موقع",
      tagPeople: "وسم أشخاص",
      inviteCollaborator: "دعوة متعاون",
      addMusic: "إضافة موسيقى",
      audience: "الجمهور",
      audiencePublic: "عام — أي شخص يمكنه الرد",
      audiencePrivate: "خاص — أنت فقط",
      pendingCollabNote:
        "سيُنشر المنشور بعد أن يقبل المتعاون الدعوة في الرسائل.",
      tagPeopleHint: "ابحث عن مستخدمين لإضافتهم",
      advanced: "إعدادات متقدمة",
      hideLikes: "إخفاء عدد الإعجابات",
      hideLikesHint: "لن يرى أحد عدد الإعجابات على هذا المنشور.",
      turnOffComments: "إيقاف التعليقات",
      visibility: "الخصوصية",
      visibilityPublic: "عام",
      visibilityFollowers: "المتابعون فقط",
      visibilityCloseFriends: "الأصدقاء المقربون",
      visibilityPrivate: "خاص",
      collabSearchHint: "ابحث عن شخص لدعوته كمتعاون",
      clearInvite: "إزالة",
      cropZoom: "تكبير",
      removeFile: "إزالة",
      addMore: "إضافة المزيد",
      tooManyFiles: `يمكنك رفع حتى ${MAX_FILES} ملفات في منشور واحد.`,
      uploadFailed: "فشل الرفع. حاول مرة أخرى.",
      tagSearchPlaceholder: "ابحث عن مستخدم لوسمه",
      removeTag: "إزالة الوسم",
      noUsers: "لا يوجد مستخدمون.",
      story: "قصة",
      post: "منشور",
      cropTitle: "اقتصاص",
      addEmoji: "إيموجي",
      searchPlaces: "ابحث عن مكان",
      placeSearchHint: "ابحث واختر — مثل إنستغرام",
      clearLocation: "إزالة الموقع",
      placesUnavailable: "لم يُضبط مفتاح أماكن Google. أضف GOOGLE_PLACES_API_KEY في الخادم.",
      musicSearchHint: "ابحث في Spotify واختر أغنية",
      musicUnavailable: "تعذر الاتصال ببحث الموسيقى. تحقق من نشر Convex.",
      clearMusic: "إزالة",
      noPlaceResults: "لا نتائج أماكن",
      noTracks: "لا نتائج موسيقى",
    };
  }
  return {
    createPost: "Create new post",
    crop: "Crop",
    next: "Next",
    back: "Back",
    share: "Share",
    sharing: "Sharing…",
    drag: "Drag photos and videos here",
    selectFromComputer: "Select from computer",
    writeCaption: "Write a caption…",
    addLocation: "Add location",
    tagPeople: "Tag people",
    inviteCollaborator: "Invite collaborator",
    addMusic: "Add music",
    audience: "Audience",
    audiencePublic: "Public — anyone can reply",
    audiencePrivate: "Private — only you",
    pendingCollabNote: "Your post goes live after they accept in messages.",
    tagPeopleHint: "Search people to tag",
    advanced: "Advanced settings",
    hideLikes: "Hide like and view counts",
    hideLikesHint: "Only you will see the total number of likes.",
    turnOffComments: "Turn off commenting",
    visibility: "Audience",
    visibilityPublic: "Public",
    visibilityFollowers: "Followers only",
    visibilityCloseFriends: "Close friends",
    visibilityPrivate: "Private",
    collabSearchHint: "Search someone to invite as collaborator",
    clearInvite: "Clear",
    cropZoom: "Zoom",
    removeFile: "Remove",
    addMore: "Add more",
    tooManyFiles: `You can upload up to ${MAX_FILES} files per post.`,
    uploadFailed: "Upload failed. Please try again.",
    tagSearchPlaceholder: "Search a user to tag",
    removeTag: "Remove tag",
    noUsers: "No users found.",
    story: "Story",
    post: "Post",
    cropTitle: "Crop",
    addEmoji: "Emoji",
    searchPlaces: "Search places",
    placeSearchHint: "Search and pick — like Instagram",
    clearLocation: "Remove location",
    placesUnavailable:
      "Google Places isn’t configured. Add GOOGLE_PLACES_API_KEY on the server.",
    musicSearchHint: "Search Spotify and pick a track",
    musicUnavailable: "Could not reach music search. Check Convex deploy and URL.",
    clearMusic: "Remove",
    noPlaceResults: "No matching places",
    noTracks: "No tracks found",
  };
}

export function CreatePostDialog({
  open,
  onClose,
  viewer,
  onPublished,
}: CreatePostDialogProps) {
  const { user } = useViboAuth();
  const viewerId = user?.id as Id<"users"> | undefined;

  const [lang, setLang] = useState<"en" | "ar">("en");
  useEffect(() => {
    if (!open) return;
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") setLang(stored);
    else if (typeof document !== "undefined" && document.documentElement.lang === "ar") setLang("ar");
  }, [open]);
  const t = useMemo(() => getDict(lang), [lang]);
  const isAr = lang === "ar";

  const [step, setStep] = useState<Step>("select");
  const [media, setMedia] = useState<LocalMedia[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Step 3 fields
  const [caption, setCaption] = useState("");
  const [locationName, setLocationName] = useState("");
  /** Google Place `place_id` (stored as `posts.locationId`). */
  const [locationPlaceId, setLocationPlaceId] = useState("");
  const [locationLat, setLocationLat] = useState<number | undefined>(undefined);
  const [locationLng, setLocationLng] = useState<number | undefined>(undefined);
  const [hideLikes, setHideLikes] = useState(false);
  const [commentsOff, setCommentsOff] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [peopleTags, setPeopleTags] = useState<PostPersonTag[]>([]);
  const [collaborator, setCollaborator] = useState<{
    userId: Id<"users">;
    username: string;
  } | null>(null);
  const [musicTitle, setMusicTitle] = useState("");
  const [peopleSearchQuery, setPeopleSearchQuery] = useState("");
  const [expandedSection, setExpandedSection] = useState<
    "tags" | "collab" | "location" | "music" | "visibility" | null
  >(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drag/drop visual state
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropFrameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    moving: boolean;
    startX: number;
    startY: number;
    initOffX: number;
    initOffY: number;
  }>({ moving: false, startX: 0, startY: 0, initOffX: 0, initOffY: 0 });

  const generateUploadUrl = useAction(api.media.generateUploadUrl);
  const createPost = useMutation(api.posts.createPost);
  const addPostMedia = useMutation(api.posts.addPostMedia);
  const addPostTags = useMutation(api.posts.addPostTags);
  const publishPost = useMutation(api.posts.publishPost);
  const invitePostCollaborator = useMutation(api.posts.invitePostCollaborator);

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (open) return;
    setStep("select");
    setMedia((arr) => {
      arr.forEach((m) => URL.revokeObjectURL(m.url));
      return [];
    });
    setActiveIndex(0);
    setCaption("");
    setLocationName("");
    setHideLikes(false);
    setCommentsOff(false);
    setVisibility("public");
    setShowAdvanced(false);
    setPeopleTags([]);
    setCollaborator(null);
    setMusicTitle("");
    setPeopleSearchQuery("");
    setExpandedSection(null);
    setSubmitting(false);
    setError(null);
    setDragOver(false);
  }, [open]);

  const acceptFiles = useCallback((files: FileList | File[]) => {
    const incoming = Array.from(files);
    const filtered = incoming
      .filter((f) => /^image\//.test(f.type) || /^video\//.test(f.type))
      .slice(0, MAX_FILES);
    if (filtered.length === 0) return;
    setError(null);
    setMedia((prev) => {
      const next: LocalMedia[] = [...prev];
      for (const f of filtered) {
        if (next.length >= MAX_FILES) break;
        next.push({
          file: f,
          url: URL.createObjectURL(f),
          type: /^video\//.test(f.type) ? "video" : "image",
          aspect: "1:1",
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
        });
      }
      return next;
    });
    setActiveIndex(0);
    setStep("crop");
  }, []);

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    acceptFiles(e.target.files);
    e.target.value = "";
  };

  const removeFileAt = (i: number) => {
    setMedia((prev) => {
      const item = prev[i];
      if (item) URL.revokeObjectURL(item.url);
      const next = prev.filter((_, idx) => idx !== i);
      if (next.length === 0) {
        setStep("select");
        return next;
      }
      return next;
    });
    setActiveIndex((i2) => Math.max(0, Math.min(i2, media.length - 2)));
  };

  // ---- User search (tag people / collaborator) ----
  const usersForPick = useQuery(
    api.users.searchUsers,
    expandedSection &&
      (expandedSection === "tags" || expandedSection === "collab") &&
      peopleSearchQuery.trim().length > 0 &&
      viewerId
      ? {
          query: peopleSearchQuery.trim(),
          limit: 8,
          excludeUserId: viewerId,
          viewerUserId: viewerId,
        }
      : "skip",
  ) as
    | Array<{
        _id: Id<"users">;
        username?: string;
        fullName?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
        profilePictureStorageRegion?: string;
      }>
    | undefined;

  // ---- Crop interactions ----
  const onPhotoMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (step !== "crop") return;
    if (!cropFrameRef.current) return;
    dragRef.current = {
      moving: true,
      startX: e.clientX,
      startY: e.clientY,
      initOffX: media[activeIndex]?.offsetX ?? 0,
      initOffY: media[activeIndex]?.offsetY ?? 0,
    };
  };
  const onPhotoMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current.moving) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setMedia((prev) =>
      prev.map((m, i) =>
        i === activeIndex
          ? { ...m, offsetX: dragRef.current.initOffX + dx, offsetY: dragRef.current.initOffY + dy }
          : m,
      ),
    );
  };
  const onPhotoMouseUp = () => {
    dragRef.current.moving = false;
  };

  /** Per-item crop frame; changing aspect resets pan for that image so the frame stays sensible. */
  const setActiveAspect = useCallback(
    (a: Aspect) => {
      setMedia((prev) =>
        prev.map((m, i) =>
          i === activeIndex ? { ...m, aspect: a, offsetX: 0, offsetY: 0 } : m,
        ),
      );
    },
    [activeIndex],
  );

  const addPeopleTag = (u: { _id: Id<"users">; username?: string }) => {
    setPeopleTags((prev) => {
      if (prev.some((p) => String(p.userId) === String(u._id))) return prev;
      return [...prev, { userId: u._id, username: u.username ?? "user" }];
    });
    setPeopleSearchQuery("");
  };

  const removePeopleTag = (userId: Id<"users">) => {
    setPeopleTags((prev) => prev.filter((p) => String(p.userId) !== String(userId)));
  };

  const pickCollaborator = (u: { _id: Id<"users">; username?: string }) => {
    setCollaborator({
      userId: u._id,
      username: u.username ?? "user",
    });
    setPeopleSearchQuery("");
    setExpandedSection(null);
  };

  // ---- Submit ----
  const submit = async () => {
    if (!viewerId) return;
    if (media.length === 0) return;
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1) Create the post draft.
      const postId = await createPost({
        userId: viewerId,
        caption: caption.trim() || undefined,
        locationName: locationName.trim() || undefined,
        locationId: locationPlaceId.trim() || undefined,
        locationLat,
        locationLng,
        musicTitle: musicTitle.trim() || undefined,
        visibility,
        commentsEnabled: !commentsOff,
        likesVisible: !hideLikes,
      });

      // 2) Upload each media file in turn.
      const mediaPayload: Array<{
        type: "image" | "video";
        position: number;
        displayUrl: string;
        displayStorageRegion?: string;
        cropData?: {
          x: number;
          y: number;
          width: number;
          height: number;
          scale: number;
          aspectRatio: string;
        };
      }> = [];

      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        const fileType = (m.file.type || "application/octet-stream").toLowerCase();
        const upload = await generateUploadUrl({
          userId: viewerId,
          fileType,
          uploadType: "post",
          postId: String(postId),
        });
        const { storageRegion: region } = await putFileToAllDualRegionTargets(
          m.file,
          fileType,
          upload,
        );

        mediaPayload.push({
          type: m.type,
          position: i,
          displayUrl: upload.key,
          displayStorageRegion: region,
          cropData: {
            x: m.offsetX,
            y: m.offsetY,
            width: 1,
            height: 1,
            scale: m.zoom,
            aspectRatio: m.aspect,
          },
        });
      }

      // 3) Attach media to post.
      await addPostMedia({
        userId: viewerId,
        postId,
        media: mediaPayload,
      });

      // 4) Tags (post-level — no tap-on-photo coordinates).
      if (peopleTags.length > 0) {
        await addPostTags({
          userId: viewerId,
          postId,
          tags: peopleTags.map((tg) => ({ taggedUserId: tg.userId })),
        });
      }

      // 5) Publish now, or send collaborator invite (publish after they accept in DMs).
      if (collaborator) {
        await invitePostCollaborator({
          userId: viewerId,
          postId,
          inviteeUserId: collaborator.userId,
        });
      } else {
        await publishPost({ userId: viewerId, postId });
      }

      onPublished?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.uploadFailed);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const activeMedia = media[activeIndex];
  const activeAspect = activeMedia?.aspect ?? "1:1";
  const aspectRatio = ASPECTS.find((a) => a.id === activeAspect)?.ratio ?? 1;

  // Compute final dialog width per step (Instagram uses different sizes).
  const dialogClass =
    step === "select"
      ? "w-[min(720px,92vw)]"
      : step === "crop"
        ? "w-[min(900px,94vw)]"
        : "w-[min(1100px,96vw)]";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.createPost}
      dir={isAr ? "rtl" : "ltr"}
      onMouseUp={onPhotoMouseUp}
      onMouseLeave={onPhotoMouseUp}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-white/85 hover:bg-white/10"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        className={`overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-950 ${dialogClass}`}
      >
        {/* Header bar */}
        <div className="flex items-center border-b border-neutral-200 px-3 py-2.5 dark:border-neutral-900">
          {step !== "select" ? (
            <button
              type="button"
              onClick={() => {
                if (step === "crop") {
                  setStep("select");
                  setMedia((arr) => {
                    arr.forEach((m) => URL.revokeObjectURL(m.url));
                    return [];
                  });
                } else if (step === "details") {
                  setStep("crop");
                }
              }}
              aria-label={t.back}
              className="grid h-8 w-8 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : (
            <span className="h-8 w-8" />
          )}
          <p className="flex-1 text-center text-[15px] font-semibold text-neutral-900 dark:text-white">
            {step === "crop" ? t.cropTitle : t.createPost}
          </p>
          {step === "crop" ? (
            <button
              type="button"
              onClick={() => setStep("details")}
              className="rounded-md px-2 py-1 text-[14px] font-semibold text-vibo-primary hover:opacity-80"
            >
              {t.next}
            </button>
          ) : step === "details" ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-md px-2 py-1 text-[14px] font-semibold text-vibo-primary hover:opacity-80 disabled:opacity-50"
            >
              {submitting ? t.sharing : t.share}
            </button>
          ) : (
            <span className="h-8 w-8" />
          )}
        </div>

        {/* Body */}
        {step === "select" ? (
          <div
            className={`flex h-[60vh] min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center ${
              dragOver ? "bg-neutral-100 dark:bg-neutral-900" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer?.files) acceptFiles(e.dataTransfer.files);
            }}
          >
            <div className="grid h-24 w-24 place-items-center rounded-full bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
              <ImagePlus className="h-12 w-12" />
            </div>
            <p className="text-[18px] text-neutral-900 dark:text-white">{t.drag}</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-vibo-primary px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-vibo-primary/90"
            >
              {t.selectFromComputer}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={onPickFiles}
            />
          </div>
        ) : step === "crop" ? (
          <CropStep
            t={t}
            media={media}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            aspect={activeAspect}
            setAspect={setActiveAspect}
            aspectRatio={aspectRatio}
            cropFrameRef={cropFrameRef}
            onMouseDown={onPhotoMouseDown}
            onMouseMove={onPhotoMouseMove}
            updateMedia={(updater) =>
              setMedia((prev) => prev.map((m, i) => (i === activeIndex ? updater(m) : m)))
            }
            onAdd={() => fileInputRef.current?.click()}
            onRemove={removeFileAt}
            fileInputRef={fileInputRef}
            onPickFiles={onPickFiles}
          />
        ) : (
          <DetailsStep
            t={t}
            isAr={isAr}
            viewer={viewer}
            media={media}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            aspectRatio={aspectRatio}
            cropFrameRef={cropFrameRef}
            caption={caption}
            setCaption={setCaption}
            peopleTags={peopleTags}
            addPeopleTag={addPeopleTag}
            removePeopleTag={removePeopleTag}
            collaborator={collaborator}
            pickCollaborator={pickCollaborator}
            clearCollaborator={() => setCollaborator(null)}
            musicTitle={musicTitle}
            setMusicTitle={setMusicTitle}
            locationName={locationName}
            setLocationName={setLocationName}
            setLocationFromPlaces={(meta) => {
              if (!meta) {
                setLocationName("");
                setLocationPlaceId("");
                setLocationLat(undefined);
                setLocationLng(undefined);
                return;
              }
              setLocationName(meta.label);
              setLocationPlaceId(meta.placeId);
              setLocationLat(meta.lat);
              setLocationLng(meta.lng);
            }}
            hideLikes={hideLikes}
            setHideLikes={setHideLikes}
            commentsOff={commentsOff}
            setCommentsOff={setCommentsOff}
            visibility={visibility}
            setVisibility={setVisibility}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            expandedSection={expandedSection}
            setExpandedSection={setExpandedSection}
            peopleSearchQuery={peopleSearchQuery}
            setPeopleSearchQuery={setPeopleSearchQuery}
            usersForPick={usersForPick}
          />
        )}

        {error ? (
          <p className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[13px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---- Step 2 — Crop ----

function CropStep({
  t,
  media,
  activeIndex,
  setActiveIndex,
  aspect,
  setAspect,
  aspectRatio,
  cropFrameRef,
  onMouseDown,
  onMouseMove,
  updateMedia,
  onAdd,
  onRemove,
  fileInputRef,
  onPickFiles,
}: {
  t: ReturnType<typeof getDict>;
  media: LocalMedia[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  aspect: Aspect;
  setAspect: (a: Aspect) => void;
  aspectRatio: number;
  cropFrameRef: React.MutableRefObject<HTMLDivElement | null>;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  updateMedia: (updater: (m: LocalMedia) => LocalMedia) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onPickFiles: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const m = media[activeIndex];
  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col">
      <div
        ref={cropFrameRef}
        className="relative flex-1 select-none overflow-hidden bg-black"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
      >
        {m ? (
          <div
            className="absolute inset-0 grid place-items-center"
            style={{
              aspectRatio,
            }}
          >
            <div className="relative h-full w-full overflow-hidden">
              {m.type === "video" ? (
                <video
                  src={m.url}
                  controls
                  playsInline
                  className="absolute left-1/2 top-1/2 h-full w-full object-contain"
                  style={{
                    transform: `translate(calc(-50% + ${m.offsetX}px), calc(-50% + ${m.offsetY}px)) scale(${m.zoom})`,
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.url}
                  alt=""
                  draggable={false}
                  className="absolute left-1/2 top-1/2 h-full w-full cursor-grab object-contain active:cursor-grabbing"
                  style={{
                    transform: `translate(calc(-50% + ${m.offsetX}px), calc(-50% + ${m.offsetY}px)) scale(${m.zoom})`,
                  }}
                />
              )}
            </div>
          </div>
        ) : null}

        {/* Bottom-left aspect picker */}
        <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1 rounded-full bg-black/60 px-2 py-1 backdrop-blur">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAspect(a.id)}
              className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                aspect === a.id ? "bg-white text-black" : "text-white hover:bg-white/10"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Bottom-right zoom */}
        <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-white backdrop-blur">
          <ZoomIn className="h-4 w-4" />
          <input
            aria-label={t.cropZoom}
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={m?.zoom ?? 1}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateMedia((mm) => ({ ...mm, zoom: v }));
            }}
            className="h-1 w-32 cursor-pointer accent-vibo-primary"
          />
        </div>

        {/* Side arrows for multi-media */}
        {media.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous media"
              onClick={() =>
                setActiveIndex((activeIndex - 1 + media.length) % media.length)
              }
              className="absolute left-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              aria-label="Next media"
              onClick={() => setActiveIndex((activeIndex + 1) % media.length)}
              className="absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </>
        ) : null}
      </div>

      {/* Thumbnails strip */}
      <div className="flex items-center gap-2 border-t border-neutral-200 bg-white p-3 dark:border-neutral-900 dark:bg-neutral-950">
        {media.map((mm, i) => (
          <div key={i} className="relative">
            <button
              type="button"
              onClick={() => setActiveIndex(i)}
              className={`relative h-16 w-16 overflow-hidden rounded-lg ring-2 ${
                i === activeIndex ? "ring-vibo-primary" : "ring-transparent"
              }`}
            >
              {mm.type === "video" ? (
                <video src={mm.url} muted className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mm.url} alt="" className="h-full w-full object-cover" />
              )}
            </button>
            <button
              type="button"
              aria-label={t.removeFile}
              onClick={() => onRemove(i)}
              className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-neutral-900 text-white shadow ring-2 ring-white dark:ring-neutral-950"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {media.length < MAX_FILES ? (
          <button
            type="button"
            onClick={onAdd}
            className="grid h-16 w-16 place-items-center rounded-lg border-2 border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-500 dark:hover:text-neutral-200"
            aria-label={t.addMore}
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={onPickFiles}
        />
      </div>
    </div>
  );
}

// ---- Step 3 — Caption / options (Instagram-style list) ----

function DetailsStep({
  t,
  isAr,
  viewer,
  media,
  activeIndex,
  setActiveIndex,
  aspectRatio,
  cropFrameRef,
  caption,
  setCaption,
  peopleTags,
  addPeopleTag,
  removePeopleTag,
  collaborator,
  pickCollaborator,
  clearCollaborator,
  musicTitle,
  setMusicTitle,
  locationName,
  setLocationName,
  setLocationFromPlaces,
  hideLikes,
  setHideLikes,
  commentsOff,
  setCommentsOff,
  visibility,
  setVisibility,
  showAdvanced,
  setShowAdvanced,
  expandedSection,
  setExpandedSection,
  peopleSearchQuery,
  setPeopleSearchQuery,
  usersForPick,
}: {
  t: ReturnType<typeof getDict>;
  isAr: boolean;
  viewer: ViewerProfile;
  media: LocalMedia[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  aspectRatio: number;
  cropFrameRef: React.MutableRefObject<HTMLDivElement | null>;
  caption: string;
  setCaption: (v: string) => void;
  peopleTags: PostPersonTag[];
  addPeopleTag: (u: { _id: Id<"users">; username?: string }) => void;
  removePeopleTag: (userId: Id<"users">) => void;
  collaborator: { userId: Id<"users">; username: string } | null;
  pickCollaborator: (u: { _id: Id<"users">; username?: string }) => void;
  clearCollaborator: () => void;
  musicTitle: string;
  setMusicTitle: (v: string) => void;
  locationName: string;
  setLocationName: (v: string) => void;
  setLocationFromPlaces: (
    meta: { label: string; placeId: string; lat: number; lng: number } | null,
  ) => void;
  hideLikes: boolean;
  setHideLikes: (v: boolean) => void;
  commentsOff: boolean;
  setCommentsOff: (v: boolean) => void;
  visibility: "public" | "private";
  setVisibility: (v: "public" | "private") => void;
  showAdvanced: boolean;
  setShowAdvanced: (v: boolean) => void;
  expandedSection: "tags" | "collab" | "location" | "music" | "visibility" | null;
  setExpandedSection: React.Dispatch<
    React.SetStateAction<"tags" | "collab" | "location" | "music" | "visibility" | null>
  >;
  peopleSearchQuery: string;
  setPeopleSearchQuery: (v: string) => void;
  usersForPick:
    | Array<{
        _id: Id<"users">;
        username?: string;
        fullName?: string;
        profilePictureUrl?: string;
        profilePictureKey?: string;
        profilePictureStorageRegion?: string;
      }>
    | undefined;
}) {
  const m = media[activeIndex];

  const captionRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiAnchorRef = useRef<HTMLDivElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [locQuery, setLocQuery] = useState("");
  const [locPredictions, setLocPredictions] = useState<
    Array<{ placeId: string; primary: string; secondary: string }>
  >([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [placesNotConfigured, setPlacesNotConfigured] = useState(false);

  const [musicQuery, setMusicQuery] = useState("");
  type MusicTrackRow = {
    id: string;
    title: string;
    artist: string;
    albumArt: string;
    preview_url: string | null;
    durationMs: number;
    provider: string;
  };
  const [musicTracks, setMusicTracks] = useState<MusicTrackRow[]>([]);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicErr, setMusicErr] = useState<string | null>(null);

  useEffect(() => {
    if (!emojiOpen) return;
    const onDoc = (e: MouseEvent) => {
      const root = emojiAnchorRef.current;
      if (root && !root.contains(e.target as Node)) setEmojiOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [emojiOpen]);

  useEffect(() => {
    if (expandedSection !== "location") {
      setLocQuery("");
      setLocPredictions([]);
      setLocErr(null);
      setPlacesNotConfigured(false);
    }
  }, [expandedSection]);

  useEffect(() => {
    if (expandedSection !== "music") {
      setMusicQuery("");
      setMusicTracks([]);
      setMusicErr(null);
    }
  }, [expandedSection]);

  useEffect(() => {
    if (expandedSection !== "location") return;
    const q = locQuery.trim();
    if (q.length < 2) {
      setLocPredictions([]);
      setLocErr(null);
      setPlacesNotConfigured(false);
      return;
    }
    setLocLoading(true);
    setLocErr(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const lang = isAr ? "ar" : "en";
          const res = await fetch(
            `/api/places/autocomplete?input=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}`,
          );
          const data = (await res.json()) as {
            predictions?: Array<{ placeId: string; primary: string; secondary: string }>;
            notConfigured?: boolean;
            error?: string;
          };
          if (data.notConfigured) {
            setPlacesNotConfigured(true);
            setLocPredictions([]);
            return;
          }
          if (!res.ok) {
            setLocErr(data.error ?? "Search failed");
            setLocPredictions([]);
            return;
          }
          setPlacesNotConfigured(false);
          setLocPredictions(data.predictions ?? []);
        } catch {
          setLocErr("Search failed");
          setLocPredictions([]);
        } finally {
          setLocLoading(false);
        }
      })();
    }, 320);
    return () => clearTimeout(timer);
  }, [locQuery, expandedSection, isAr]);

  useEffect(() => {
    if (expandedSection !== "music") return;
    const q = musicQuery.trim();
    if (q.length < 1) {
      setMusicTracks([]);
      setMusicErr(null);
      return;
    }
    setMusicLoading(true);
    setMusicErr(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const origin = getConvexHttpOrigin();
          if (!origin) {
            setMusicErr(t.musicUnavailable);
            setMusicTracks([]);
            return;
          }
          const res = await fetch(
            `${origin}/music/search?q=${encodeURIComponent(q.slice(0, 120))}`,
          );
          const data = (await res.json()) as {
            tracks?: MusicTrackRow[];
            error?: string;
          };
          if (!res.ok) {
            setMusicErr(data.error ?? t.musicUnavailable);
            setMusicTracks([]);
            return;
          }
          setMusicTracks(data.tracks ?? []);
        } catch {
          setMusicErr(t.musicUnavailable);
          setMusicTracks([]);
        } finally {
          setMusicLoading(false);
        }
      })();
    }, 320);
    return () => clearTimeout(timer);
  }, [musicQuery, expandedSection, t.musicUnavailable]);

  const pickPlace = async (placeId: string) => {
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(placeId)}`,
      );
      const data = (await res.json()) as {
        placeId?: string;
        name?: string;
        formattedAddress?: string;
        lat?: number;
        lng?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const label = (data.name || data.formattedAddress || "").trim();
      if (!label || data.lat == null || data.lng == null) throw new Error("Incomplete");
      setLocationFromPlaces({
        label,
        placeId: data.placeId ?? placeId,
        lat: data.lat,
        lng: data.lng,
      });
      setExpandedSection(null);
      setLocQuery("");
      setLocPredictions([]);
    } catch {
      setLocErr("Could not load this place");
    }
  };

  const toggleSection = (s: NonNullable<typeof expandedSection>) => {
    setExpandedSection((prev) => (prev === s ? null : s));
    setPeopleSearchQuery("");
  };

  const searchHint =
    expandedSection === "collab" ? t.collabSearchHint : t.tagPeopleHint;

  const renderUserPickList = (mode: "tags" | "collab") => (
    <div className="border-t border-neutral-100 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          placeholder={t.tagSearchPlaceholder}
          value={peopleSearchQuery}
          onChange={(e) => setPeopleSearchQuery(e.target.value)}
          className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-2 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus:border-vibo-primary/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
        />
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500">{searchHint}</p>
      <ul className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
        {!peopleSearchQuery.trim() ? (
          <li className="px-3 py-3 text-center text-[12px] text-neutral-500">{searchHint}</li>
        ) : usersForPick === undefined ? (
          <li className="px-3 py-3 text-center text-[12px] text-neutral-500">…</li>
        ) : usersForPick.length === 0 ? (
          <li className="px-3 py-3 text-center text-[12px] text-neutral-500">{t.noUsers}</li>
        ) : (
          usersForPick.map((u) => (
            <li key={String(u._id)} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
              <button
                type="button"
                onClick={() =>
                  mode === "tags" ? addPeopleTag(u) : pickCollaborator(u)
                }
                className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <ResolvedProfileAvatar
                  profilePictureUrl={u.profilePictureUrl}
                  profilePictureKey={u.profilePictureKey}
                  profilePictureStorageRegion={u.profilePictureStorageRegion}
                  initial={(u.username ?? u.fullName ?? "U").charAt(0)}
                  size={28}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
                    {u.username ?? "user"}
                  </span>
                  <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    {u.fullName ?? ""}
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );

  return (
    <div className="grid h-[80vh] min-h-[480px] grid-cols-1 md:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative bg-black">
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ aspectRatio }}
        >
          <div
            ref={cropFrameRef}
            className="relative h-full w-full overflow-hidden"
          >
            {m?.type === "video" ? (
              <video
                src={m.url}
                controls
                playsInline
                className="absolute left-1/2 top-1/2 h-full w-full object-contain"
                style={{
                  transform: `translate(calc(-50% + ${m.offsetX}px), calc(-50% + ${m.offsetY}px)) scale(${m.zoom})`,
                }}
              />
            ) : m ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.url}
                alt=""
                draggable={false}
                className="absolute left-1/2 top-1/2 h-full w-full object-contain"
                style={{
                  transform: `translate(calc(-50% + ${m.offsetX}px), calc(-50% + ${m.offsetY}px)) scale(${m.zoom})`,
                }}
              />
            ) : null}
          </div>
        </div>

        {media.length > 1 ? (
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 p-1 backdrop-blur">
            {media.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`h-2 w-2 rounded-full ${i === activeIndex ? "bg-white" : "bg-white/40"}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        ) : null}

        {media.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous media"
              onClick={() =>
                setActiveIndex((activeIndex - 1 + media.length) % media.length)
              }
              className="absolute left-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
            >
              <ChevronLeft className="h-4.5 w-4.5" />
            </button>
            <button
              type="button"
              aria-label="Next media"
              onClick={() => setActiveIndex((activeIndex + 1) % media.length)}
              className="absolute right-3 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white hover:bg-black/75"
            >
              <ChevronRight className="h-4.5 w-4.5" />
            </button>
          </>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-col overflow-y-auto border-neutral-200 dark:border-neutral-900 md:border-s">
        <div className="flex items-center gap-2 px-4 py-3">
          <ResolvedProfileAvatar
            profilePictureUrl={viewer.profilePictureUrl}
            profilePictureKey={viewer.profilePictureKey}
            profilePictureStorageRegion={viewer.profilePictureStorageRegion}
            initial={(viewer.username ?? viewer.fullName ?? "V").charAt(0)}
            size={28}
          />
          <span className="text-[13.5px] font-semibold text-neutral-900 dark:text-white">
            {viewer.username ?? "you"}
          </span>
        </div>

        <div className="relative mx-4 mb-1 flex gap-1.5">
          <textarea
            ref={captionRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
            rows={4}
            placeholder={t.writeCaption}
            dir="auto"
            spellCheck
            className="min-h-[96px] flex-1 resize-none rounded-md border-0 bg-transparent text-[14px] text-neutral-900 caret-vibo-primary placeholder:text-neutral-500 focus:outline-none dark:text-white dark:caret-vibo-primary [&::selection]:bg-vibo-primary/35 [&::selection]:text-neutral-900 dark:[&::selection]:bg-vibo-primary/45 dark:[&::selection]:text-white"
          />
          <div ref={emojiAnchorRef} className="relative shrink-0 pt-0.5">
            <button
              type="button"
              aria-label={t.addEmoji}
              title={t.addEmoji}
              onClick={() => setEmojiOpen((o) => !o)}
              className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            >
              <Smile className="h-5 w-5" strokeWidth={1.8} />
            </button>
            {emojiOpen ? (
              <div className="absolute end-0 top-full z-[80] mt-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-950">
                <EmojiPickerLazy
                  width={320}
                  height={380}
                  searchPlaceHolder={isAr ? "بحث…" : "Search emoji"}
                  previewConfig={{ showPreview: false }}
                  skinTonesDisabled={false}
                  emojiStyle={EmojiStyle.APPLE}
                  theme={
                    typeof document !== "undefined" &&
                    document.documentElement.classList.contains("dark")
                      ? Theme.DARK
                      : Theme.LIGHT
                  }
                  onEmojiClick={(emojiData) => {
                    const ta = captionRef.current;
                    if (ta) insertAtCursor(ta, emojiData.emoji, setCaption, 2200);
                    else setCaption((caption + emojiData.emoji).slice(0, 2200));
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
        <p
          className={`px-4 pb-3 text-[11px] text-neutral-400 ${
            isAr ? "text-start" : "text-end"
          }`}
        >
          {caption.length}/2,200
        </p>

        {/* Tag people */}
        <button
          type="button"
          onClick={() => toggleSection("tags")}
          className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3 text-start hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/40"
        >
          <XStyleGlyph name="person" size={20} className="shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">
              {t.tagPeople}
            </span>
            {peopleTags.length > 0 ? (
              <span className="mt-0.5 block truncate text-[12px] text-neutral-500">
                {peopleTags.map((p) => `@${p.username}`).join(", ")}
              </span>
            ) : (
              <span className="mt-0.5 block text-[12px] text-neutral-400">{t.tagPeopleHint}</span>
            )}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
              expandedSection === "tags" ? "rotate-180" : ""
            }`}
          />
        </button>
        {expandedSection === "tags" ? renderUserPickList("tags") : null}
        {peopleTags.length > 0 && expandedSection !== "tags" ? (
          <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 px-4 py-2 dark:border-neutral-800">
            {peopleTags.map((tg) => (
              <span
                key={String(tg.userId)}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[12px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100"
              >
                @{tg.username}
                <button
                  type="button"
                  onClick={() => removePeopleTag(tg.userId)}
                  aria-label={t.removeTag}
                  className="text-neutral-400 hover:text-rose-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* Invite collaborator */}
        <div className="flex w-full items-stretch border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => toggleSection("collab")}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
          >
            <XStyleGlyph name="peopleTwo" size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">
                {t.inviteCollaborator}
              </span>
              <span className="mt-0.5 block text-[12px] text-neutral-400">
                {collaborator
                  ? `@${collaborator.username} · ${t.pendingCollabNote}`
                  : t.collabSearchHint}
              </span>
            </span>
            {!collaborator ? (
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                  expandedSection === "collab" ? "rotate-180" : ""
                }`}
              />
            ) : null}
          </button>
          {collaborator ? (
            <button
              type="button"
              onClick={() => clearCollaborator()}
              className="shrink-0 self-center px-3 text-[12px] font-semibold text-rose-600 hover:underline"
            >
              {t.clearInvite}
            </button>
          ) : null}
        </div>
        {expandedSection === "collab" ? renderUserPickList("collab") : null}

        {/* Add location — search & pick (Google Places), Instagram-style */}
        <div className="flex w-full items-stretch border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => toggleSection("location")}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
          >
            <XStyleGlyph name="locationPin" size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">
                {t.addLocation}
              </span>
              {locationName.trim() ? (
                <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{locationName}</span>
              ) : (
                <span className="mt-0.5 block text-[12px] text-neutral-400">{t.placeSearchHint}</span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                expandedSection === "location" ? "rotate-180" : ""
              }`}
            />
          </button>
          {locationName.trim() ? (
            <button
              type="button"
              onClick={() => setLocationFromPlaces(null)}
              className="shrink-0 self-center px-3 text-[12px] font-semibold text-rose-600 hover:underline"
            >
              {t.clearLocation}
            </button>
          ) : null}
        </div>
        {expandedSection === "location" ? (
          <div className="border-t border-neutral-100 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={locQuery}
                onChange={(e) => setLocQuery(e.target.value)}
                placeholder={t.searchPlaces}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus:border-vibo-primary/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">{t.placeSearchHint}</p>
            {placesNotConfigured ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {t.placesUnavailable}
              </p>
            ) : null}
            {locErr ? (
              <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">{locErr}</p>
            ) : null}
            <ul className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
              {locLoading ? (
                <li className="flex items-center justify-center gap-2 px-3 py-4 text-[12px] text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  …
                </li>
              ) : locPredictions.length === 0 ? (
                <li className="px-3 py-3 text-center text-[12px] text-neutral-500">
                  {locQuery.trim().length < 2 ? t.placeSearchHint : t.noPlaceResults}
                </li>
              ) : (
                locPredictions.map((p) => (
                  <li key={p.placeId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => void pickPlace(p.placeId)}
                      className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    >
                      <span className="text-[13px] font-semibold text-neutral-900 dark:text-white">
                        {p.primary}
                      </span>
                      {p.secondary ? (
                        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {p.secondary}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {/* Music — Spotify search via Convex HTTP (`convex_app/music.ts` + `convex_app/http.ts`) */}
        <div className="flex w-full items-stretch border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => toggleSection("music")}
            className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900/40"
          >
            <XStyleGlyph name="musicNote" size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">
                {t.addMusic}
              </span>
              {musicTitle.trim() ? (
                <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{musicTitle}</span>
              ) : (
                <span className="mt-0.5 block text-[12px] text-neutral-400">
                  {isAr ? "اختياري — يظهر على المنشور" : "Optional — shows on your post"}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
                expandedSection === "music" ? "rotate-180" : ""
              }`}
            />
          </button>
          {musicTitle.trim() ? (
            <button
              type="button"
              onClick={() => setMusicTitle("")}
              className="shrink-0 self-center px-3 text-[12px] font-semibold text-rose-600 hover:underline"
            >
              {t.clearMusic}
            </button>
          ) : null}
        </div>
        {expandedSection === "music" ? (
          <div className="border-t border-neutral-100 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={musicQuery}
                onChange={(e) => setMusicQuery(e.target.value)}
                placeholder={isAr ? "ابحث عن أغنية أو فنان" : "Search song or artist"}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-8 pr-3 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus:border-vibo-primary/40 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
              />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">{t.musicSearchHint}</p>
            {musicErr ? (
              <p className="mt-2 text-[12px] text-rose-600 dark:text-rose-400">{musicErr}</p>
            ) : null}
            <ul className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
              {musicLoading ? (
                <li className="flex items-center justify-center gap-2 px-3 py-4 text-[12px] text-neutral-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  …
                </li>
              ) : musicTracks.length === 0 ? (
                <li className="px-3 py-3 text-center text-[12px] text-neutral-500">
                  {musicQuery.trim().length < 1 ? t.musicSearchHint : t.noTracks}
                </li>
              ) : (
                musicTracks.map((tr) => (
                  <li key={tr.id} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                    <button
                      type="button"
                      onClick={() => {
                        setMusicTitle(`${tr.title} — ${tr.artist}`.slice(0, 120));
                        setExpandedSection(null);
                        setMusicQuery("");
                        setMusicTracks([]);
                      }}
                      className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-neutral-50 dark:hover:bg-neutral-900"
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800">
                        {tr.albumArt ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={tr.albumArt}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
                          {tr.title}
                        </span>
                        <span className="block truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                          {tr.artist}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {/* Visibility — public / private */}
        <button
          type="button"
          onClick={() => toggleSection("visibility")}
          className="flex w-full items-center gap-3 border-t border-neutral-100 px-4 py-3 text-start hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900/40"
        >
          {visibility === "public" ? (
            <XStyleGlyph name="eyeOpen" size={20} className="shrink-0" />
          ) : (
            <XStyleGlyph name="eyeOff" size={20} className="shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">
              {t.audience}
            </span>
            <span className="mt-0.5 block text-[12px] text-neutral-500">
              {visibility === "public" ? t.audiencePublic : t.audiencePrivate}
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
              expandedSection === "visibility" ? "rotate-180" : ""
            }`}
          />
        </button>
        {expandedSection === "visibility" ? (
          <div className="space-y-2 border-t border-neutral-100 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/60">
            <button
              type="button"
              onClick={() => {
                setVisibility("public");
                setExpandedSection(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-start text-[13px] font-medium ${
                visibility === "public"
                  ? "border-vibo-primary bg-white text-vibo-primary dark:bg-neutral-950"
                  : "border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              }`}
            >
              {t.audiencePublic}
              {visibility === "public" ? <Check className="h-4 w-4" /> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                setVisibility("private");
                setExpandedSection(null);
              }}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-start text-[13px] font-medium ${
                visibility === "private"
                  ? "border-vibo-primary bg-white text-vibo-primary dark:bg-neutral-950"
                  : "border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
              }`}
            >
              {t.audiencePrivate}
              {visibility === "private" ? <Check className="h-4 w-4" /> : null}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-[13.5px] font-semibold text-neutral-900 dark:border-neutral-800 dark:text-white"
        >
          <span>{t.advanced}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
          />
        </button>

        {showAdvanced ? (
          <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
            <ToggleRow
              label={t.hideLikes}
              hint={t.hideLikesHint}
              checked={hideLikes}
              onChange={setHideLikes}
            />
            <ToggleRow
              label={t.turnOffComments}
              checked={commentsOff}
              onChange={setCommentsOff}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex items-start justify-between gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-neutral-900 dark:text-white">{label}</span>
        {hint ? (
          <span className="block text-[12px] text-neutral-500 dark:text-neutral-400">
            {hint}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-vibo-primary" : "bg-neutral-300 dark:bg-neutral-700"
        }`}
      >
        <span
          className={`grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        >
          {checked ? <Check className="h-3 w-3 text-vibo-primary" /> : null}
        </span>
      </button>
    </label>
  );
}
