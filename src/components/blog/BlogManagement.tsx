"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import "react-quill/dist/quill.snow.css";
import type { BlogCategory } from "@/types/blog";
import { parseApiJson } from "@/lib/parseApiJson";

const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

type AdminPost = {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  authorName: string;
  authorImageId: string | null;
  coverImageId: string | null;
  authorImageUrl: string | null;
  coverImageUrl: string | null;
  bodyHtml: string;
  published: boolean;
  publishedAt?: number;
  updatedAt: number;
};

const CATEGORIES: { value: BlogCategory; label: string }[] = [
  { value: "article", label: "Article" },
  { value: "case_study", label: "Case study" },
  { value: "featured", label: "Featured" },
  { value: "guide", label: "Guide" },
];

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ color: [] }, { background: [] }],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ align: [] }],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "list",
  "bullet",
  "align",
  "link",
];

async function uploadToConvex(file: File): Promise<string> {
  const r = await fetch("/api/blog/upload-url", {
    method: "POST",
    credentials: "include",
  });
  const data = await parseApiJson<{ uploadUrl?: string; error?: string }>(r);
  if (!r.ok) {
    throw new Error(data.error ?? "Could not get upload URL");
  }
  const uploadUrl = data.uploadUrl;
  if (!uploadUrl) throw new Error("No upload URL");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!up.ok) throw new Error("Upload failed");
  const j = await parseApiJson<{ storageId?: string }>(up);
  if (!j.storageId) throw new Error("No storage id");
  return j.storageId;
}

export type BlogManagementUi = {
  title: string;
  backToSite: string;
  email: string;
  password: string;
  signIn: string;
  signOut: string;
  slug: string;
  slugHint: string;
  postTitle: string;
  excerpt: string;
  category: string;
  coverImage: string;
  authorName: string;
  authorImage: string;
  body: string;
  bodyHint: string;
  publish: string;
  saveDraft: string;
  update: string;
  create: string;
  newPost: string;
  edit: string;
  delete: string;
  loading: string;
  posts: string;
  loginError: string;
  saveError: string;
  configuredHint: string;
  publicUrl: string;
  publishHint: string;
};

type Props = { ui: BlogManagementUi };

export default function BlogManagement({ ui }: Props) {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState<BlogCategory>("article");
  const [authorName, setAuthorName] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [coverImageId, setCoverImageId] = useState<string | null>(null);
  const [authorImageId, setAuthorImageId] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [authorPreview, setAuthorPreview] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const r = await fetch("/api/blog/me", { credentials: "include" });
    const j = (await r.json()) as { ok?: boolean };
    setLoggedIn(!!j.ok);
  }, []);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/blog/posts", { credentials: "include" });
      const j = await parseApiJson<{ posts?: AdminPost[] }>(r);
      if (!r.ok) {
        setPosts([]);
        return;
      }
      setPosts(j.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (loggedIn) loadPosts();
  }, [loggedIn, loadPosts]);

  const resetForm = () => {
    setEditingId(null);
    setSlug("");
    setTitle("");
    setExcerpt("");
    setCategory("article");
    setAuthorName("");
    setBodyHtml("");
    setCoverImageId(null);
    setAuthorImageId(null);
    setCoverPreview(null);
    setAuthorPreview(null);
  };

  const fillFromPost = (p: AdminPost) => {
    setEditingId(p._id);
    setSlug(p.slug);
    setTitle(p.title);
    setExcerpt(p.excerpt);
    setCategory(p.category);
    setAuthorName(p.authorName);
    setBodyHtml(p.bodyHtml ?? "");
    setCoverImageId(p.coverImageId);
    setAuthorImageId(p.authorImageId);
    setCoverPreview(p.coverImageUrl);
    setAuthorPreview(p.authorImageUrl);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    const r = await fetch("/api/blog/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password: password.replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, ""),
      }),
      credentials: "include",
    });
    let j: { ok?: boolean; error?: string };
    try {
      j = await parseApiJson<{ ok?: boolean; error?: string }>(r);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : ui.loginError);
      return;
    }
    if (!r.ok) {
      setLoginError(j.error ?? ui.loginError);
      return;
    }
    setPassword("");
    setLoggedIn(true);
    loadPosts();
  };

  const handleLogout = async () => {
    await fetch("/api/blog/logout", { method: "POST", credentials: "include" });
    setLoggedIn(false);
    resetForm();
  };

  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const id = await uploadToConvex(file);
      setCoverImageId(id);
      setCoverPreview(URL.createObjectURL(file));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    e.target.value = "";
  };

  const onAuthorChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const id = await uploadToConvex(file);
      setAuthorImageId(id);
      setAuthorPreview(URL.createObjectURL(file));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    }
    e.target.value = "";
  };

  const save = async (wantPublished: boolean) => {
    setSaving(true);
    try {
      const payload = {
        slug: slug.trim(),
        title: title.trim(),
        excerpt: excerpt.trim(),
        category,
        authorName: authorName.trim(),
        bodyHtml,
        published: wantPublished,
        coverImageId: coverImageId ?? undefined,
        authorImageId: authorImageId ?? undefined,
      };

      if (editingId) {
        const r = await fetch("/api/blog/posts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: editingId, ...payload }),
        });
        const j = await parseApiJson<{ error?: string }>(r);
        if (!r.ok) throw new Error(j.error ?? ui.saveError);
      } else {
        const r = await fetch("/api/blog/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
        const j = await parseApiJson<{ error?: string }>(r);
        if (!r.ok) throw new Error(j.error ?? ui.saveError);
      }
      await loadPosts();
      resetForm();
    } catch (e) {
      alert(e instanceof Error ? e.message : ui.saveError);
    } finally {
      setSaving(false);
    }
  };

  const removePost = async (id: string) => {
    if (!confirm("Delete this post?")) return;
    const r = await fetch(`/api/blog/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!r.ok) {
      alert("Delete failed");
      return;
    }
    if (editingId === id) resetForm();
    loadPosts();
  };

  if (loggedIn === null) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-neutral-500 text-sm">
        {ui.loading}
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="max-w-md mx-auto">
        <form onSubmit={handleLogin} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">{ui.signIn}</h2>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.email}</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.password}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
              required
            />
          </div>
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button
            type="submit"
            className="w-full rounded-full bg-vibo-primary text-white py-2.5 text-sm font-medium hover:bg-vibo-primary-light transition-colors"
          >
            {ui.signIn}
          </button>
          <p className="text-xs text-neutral-400">{ui.configuredHint}</p>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">{ui.title}</h2>
          <p className="text-sm text-neutral-500 mt-1">
            {ui.publicUrl}: <span className="font-mono text-xs">/blogs/your-slug</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetForm}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            {ui.newPost}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-neutral-200 px-4 py-2 text-sm font-medium hover:bg-neutral-50"
          >
            {ui.signOut}
          </button>
          <Link href="/blogs" className="rounded-full bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800">
            {ui.backToSite}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 space-y-5">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.slug}</label>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-post-url"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm font-mono"
            />
            <p className="text-[0.7rem] text-neutral-400 mt-1">{ui.slugHint}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.postTitle}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.excerpt}</label>
            <textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.category}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as BlogCategory)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.coverImage}</label>
              <input type="file" accept="image/*" onChange={onCoverChange} className="text-sm w-full" />
              {coverPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPreview} alt="" className="mt-2 rounded-lg max-h-40 object-cover border border-neutral-100" />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.authorImage}</label>
              <input type="file" accept="image/*" onChange={onAuthorChange} className="text-sm w-full" />
              {authorPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={authorPreview} alt="" className="mt-2 rounded-full w-16 h-16 object-cover border border-neutral-100" />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">{ui.authorName}</label>
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-2">{ui.body}</label>
            <p className="text-[0.7rem] text-neutral-400 mb-2">{ui.bodyHint}</p>
            <div className="rounded-lg border border-neutral-200 overflow-hidden bg-white [&_.ql-editor]:min-h-[220px] [&_.ql-container]:text-sm">
              <ReactQuill
                theme="snow"
                value={bodyHtml}
                onChange={setBodyHtml}
                modules={quillModules}
                formats={quillFormats}
              />
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            {ui.publishHint}
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => save(true)}
              className="rounded-full bg-vibo-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-vibo-primary-light disabled:opacity-50"
            >
              {editingId ? ui.update : ui.create}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save(false)}
              className="rounded-full border border-neutral-200 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
            >
              {ui.saveDraft}
            </button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <h3 className="text-sm font-semibold text-neutral-900 mb-3">{ui.posts}</h3>
          {loading ? (
            <p className="text-sm text-neutral-400">{ui.loading}</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-neutral-500">No posts yet.</p>
          ) : (
            <ul className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {posts.map((p) => (
                <li
                  key={p._id}
                  className="rounded-xl border border-neutral-100 bg-neutral-50/80 p-4 flex flex-col gap-2"
                >
                  <p className="text-xs text-neutral-400 font-mono">/blogs/{p.slug}</p>
                  <p className="font-medium text-neutral-900 text-sm">{p.title}</p>
                  <p className="text-xs text-neutral-500">
                    {p.published ? "Published" : "Draft"}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => fillFromPost(p)}
                      className="text-xs font-medium text-vibo-primary hover:underline"
                    >
                      {ui.edit}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePost(p._id)}
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      {ui.delete}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
