import axios from "axios";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absoluteTikwmUrl(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://www.tikwm.com${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function mapLegacyTikTokItem(item = {}) {
  return {
    id: String(item.id || item.aweme_id || item.video_id || item.play || ""),
    title: cleanText(item.title || item.desc || "Video TikTok"),
    author: cleanText(item?.author?.unique_id || item?.author || "usuario").toLowerCase(),
    play: absoluteTikwmUrl(item.play || item.video || item.url || ""),
    cover: absoluteTikwmUrl(item.cover || item.origin_cover || item.thumbnail || ""),
    stats: {
      likes: Number(item.digg_count || item.likes || 0),
      comments: Number(item.comment_count || item.comments || 0),
      views: Number(item.play_count || item.views || 0),
    },
    source: "legacy",
  };
}

function mapTikwmItem(item = {}) {
  return {
    id: String(item.id || item.video_id || item.play || ""),
    title: cleanText(item.title || item.content_desc?.join(" ") || "Video TikTok"),
    author: cleanText(item?.author?.unique_id || "usuario").toLowerCase(),
    play: absoluteTikwmUrl(item.play || ""),
    cover: absoluteTikwmUrl(item.cover || ""),
    stats: {
      likes: Number(item.digg_count || 0),
      comments: Number(item.comment_count || 0),
      views: Number(item.play_count || 0),
    },
    source: "tikwm",
  };
}

async function requestLegacyTikTokSearch(query) {
  const { data } = await axios.get(
    `https://nexevo.onrender.com/search/tiktok?q=${encodeURIComponent(query)}`,
    {
      timeout: 15000,
      headers: {
        "User-Agent": USER_AGENT,
      },
      validateStatus: () => true,
    }
  );

  if (!data?.status || !Array.isArray(data?.result) || !data.result.length) {
    throw new Error("legacy tiktok search unavailable");
  }

  return data.result.map(mapLegacyTikTokItem).filter((item) => item.play);
}

async function requestTikwmSearch(query, limit = 10) {
  const { data } = await axios.get("https://www.tikwm.com/api/feed/search", {
    timeout: 20000,
    headers: {
      "User-Agent": USER_AGENT,
    },
    params: {
      keywords: query,
      count: Math.max(limit, 1),
      cursor: 0,
      web: 1,
    },
    validateStatus: () => true,
  });

  const items = Array.isArray(data?.data?.videos)
    ? data.data.videos
    : Array.isArray(data?.data)
      ? data.data
      : [];

  if (!items.length) {
    throw new Error("tikwm search unavailable");
  }

  return items.map(mapTikwmItem).filter((item) => item.play);
}

function decodeHtmlUrl(value = "") {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\\u002f/g, "/")
    .replace(/\\/g, "");
}

async function requestBingImageSearch(query, limit = 10) {
  const { data } = await axios.get("https://www.bing.com/images/search", {
    timeout: 20000,
    headers: {
      "User-Agent": USER_AGENT,
    },
    params: {
      q: query,
      form: "HDRSC2",
      first: 1,
    },
    responseType: "text",
  });

  const html = String(data || "");
  const matches = [
    ...html.matchAll(/murl&quot;:&quot;(https?:[^&]+?)&quot;/g),
  ];
  const images = [];
  const seen = new Set();

  for (const match of matches) {
    const url = decodeHtmlUrl(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    images.push({
      title: cleanText(query),
      image_large_url: url,
      image_medium_url: url,
      image_small_url: url,
      source: "bing",
    });
    if (images.length >= limit) break;
  }

  if (!images.length) {
    throw new Error("bing image search unavailable");
  }

  return images;
}

export async function searchTikTokVideos(query, limit = 5) {
  try {
    const legacy = await requestLegacyTikTokSearch(query);
    if (legacy.length) return legacy.slice(0, limit);
  } catch {}

  const fallback = await requestTikwmSearch(query, Math.max(limit * 3, 8));
  return fallback.slice(0, limit);
}

export async function searchTikTokVideosByUser(username, limit = 3) {
  const normalizedUser = cleanText(String(username || "").replace(/^@/, "")).toLowerCase();
  const queries = [normalizedUser, `@${normalizedUser}`];
  const collected = new Map();

  for (const query of queries) {
    let items = [];

    try {
      items = await searchTikTokVideos(query, Math.max(limit * 6, 12));
    } catch {
      continue;
    }

    for (const item of items) {
      if (item.author !== normalizedUser) continue;
      if (!collected.has(item.id)) {
        collected.set(item.id, item);
      }
    }
    if (collected.size >= limit) break;
  }

  return [...collected.values()].slice(0, limit);
}

export async function searchPinterestImages(query, limit = 10) {
  try {
    const { data } = await axios.get(
      `https://nexevo.onrender.com/search/pinterest?q=${encodeURIComponent(query)}`,
      {
        timeout: 15000,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
        },
        validateStatus: () => true,
      }
    );

    if (data?.status && Array.isArray(data?.result) && data.result.length) {
      return data.result
        .slice(0, limit)
        .map((item) => ({
          title: cleanText(item?.titulo || item?.title || "Pinterest"),
          image_large_url: item?.image_large_url || item?.image_medium_url || item?.image_small_url,
          image_medium_url: item?.image_medium_url || item?.image_large_url || item?.image_small_url,
          image_small_url: item?.image_small_url || item?.image_medium_url || item?.image_large_url,
          source: "legacy",
        }))
        .filter((item) => item.image_large_url || item.image_medium_url || item.image_small_url);
    }
  } catch {}

  return await requestBingImageSearch(query, limit);
}
