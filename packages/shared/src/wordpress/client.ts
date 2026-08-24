import { fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { WordPressError, classifyWpHttpStatus } from "./errors.js";
import { assertPublicHttpsUrl } from "./url-guard.js";

export interface WpSiteCredentials {
  url: string;
  usuario: string;
  appPassword: string;
}

export interface WpTestConnectionResult {
  userId: number;
  roles: string[];
  isAdmin: boolean;
}

export interface WpCategory {
  id: number;
  name: string;
}

export interface WpMediaUploadInput {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface WpMediaUploadResult {
  id: number;
  sourceUrl: string;
}

export interface WpCreatePostInput {
  title: string;
  contentHtml: string;
  status: "publish" | "draft";
  excerpt?: string;
  slug?: string;
  categoryId?: number;
  featuredMediaId?: number;
}

export interface WpCreatePostResult {
  id: number;
  link: string;
}

const USER_AGENT = "WordbeeClone/1.0 (+uso-pessoal)";

function authHeader(creds: WpSiteCredentials): string {
  return "Basic " + Buffer.from(`${creds.usuario}:${creds.appPassword}`).toString("base64");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof WordPressError && (err.code === "network" || err.code === "timeout");
      if (!retryable || attempt === attempts - 1) throw err;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function wpFetch(creds: WpSiteCredentials, path: string, init: UndiciRequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const base = assertPublicHttpsUrl(creds.url);
  const restBase = `${base.origin}${base.pathname.replace(/\/$/, "")}/wp-json/wp/v2`;
  const target = `${restBase}${path}`;

  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = (await undiciFetch(target, {
        ...init,
        headers: {
          Authorization: authHeader(creds),
          "User-Agent": USER_AGENT,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      })) as unknown as Response;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new WordPressError("timeout");
      throw new WordPressError("network", err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new WordPressError(classifyWpHttpStatus(res.status), bodyText.slice(0, 200));
    }
    return res;
  });
}

export async function testConnection(creds: WpSiteCredentials): Promise<WpTestConnectionResult> {
  const res = await wpFetch(creds, "/users/me?context=edit");
  const json = (await res.json()) as { id: number; roles?: string[] };
  const roles = json.roles ?? [];
  const isAdmin = roles.includes("administrator");
  if (!isAdmin) throw new WordPressError("not_admin");
  return { userId: json.id, roles, isAdmin };
}

export async function listCategories(creds: WpSiteCredentials): Promise<WpCategory[]> {
  const res = await wpFetch(creds, "/categories?per_page=100&orderby=name&order=asc");
  const json = (await res.json()) as Array<{ id: number; name: string }>;
  return json.map((c) => ({ id: c.id, name: c.name }));
}

export async function uploadMedia(creds: WpSiteCredentials, input: WpMediaUploadInput): Promise<WpMediaUploadResult> {
  const res = await wpFetch(
    creds,
    "/media",
    {
      method: "POST",
      headers: {
        "Content-Type": input.mimeType,
        "Content-Disposition": `attachment; filename="${input.filename.replace(/"/g, "")}"`,
      },
      body: input.data,
    },
    30_000
  );
  const json = (await res.json()) as { id: number; source_url: string };
  return { id: json.id, sourceUrl: json.source_url };
}

export async function createPost(creds: WpSiteCredentials, input: WpCreatePostInput): Promise<WpCreatePostResult> {
  const body: Record<string, unknown> = {
    title: input.title,
    content: input.contentHtml,
    status: input.status,
  };
  if (input.excerpt) body.excerpt = input.excerpt;
  if (input.slug) body.slug = input.slug;
  if (input.categoryId) body.categories = [input.categoryId];
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId;

  const res = await wpFetch(creds, "/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { id: number; link: string };
  return { id: json.id, link: json.link };
}
