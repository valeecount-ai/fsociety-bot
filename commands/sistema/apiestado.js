const CHECKS = [
  {
    name: "DVYER ytsearch",
    url: "https://dv-yer-api.online/ytsearch?q=ozuna&limit=1",
  },
  {
    name: "DVYER ytdlmp3",
    url: "https://dv-yer-api.online/ytdlmp3",
  },
  {
    name: "DVYER ytdlmp4",
    url: "https://dv-yer-api.online/ytdlmp4",
  },
  {
    name: "DVYER tiktok",
    url: "https://dv-yer-api.online/ttdlmp4",
  },
  {
    name: "DVYER spotify",
    url: "https://dv-yer-api.online/spotify",
  },
  {
    name: "DVYER instagram",
    url: "https://dv-yer-api.online/instagram",
  },
  {
    name: "DVYER apksearch",
    url: "https://dv-yer-api.online/apksearch?q=whatsapp&limit=1",
  },
  {
    name: "TikTok Search Fallback",
    url: "https://www.tikwm.com/api/feed/search?keywords=ozuna&count=1&cursor=0&web=1",
  },
  {
    name: "Pinterest Fallback",
    url: "https://www.bing.com/images/search?q=cat",
  },
  {
    name: "IA GPT",
    url: "https://api.soymaycol.icu/api/ai/gpt5?prompt=hola",
  },
  {
    name: "Legacy Nexevo",
    url: "https://nexevo.onrender.com/search/pinterest?q=cat",
  },
];

function classifyStatus(status) {
  if (status >= 200 && status < 300) return "ACTIVA";
  if (status >= 400 && status < 500) return "ACTIVA (validacion)";
  if (status >= 500) return "CAIDA";
  return "DESCONOCIDA";
}

async function probeUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      label: classifyStatus(response.status),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      label: "ERROR",
      error: String(error?.message || error || "error desconocido"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  name: "apiestado",
  command: ["apiestado", "apis", "apistatus"],
  category: "sistema",
  description: "Revisa el estado y latencia de las APIs del bot",

  run: async ({ sock, msg, from, esOwner }) => {
    if (!esOwner) {
      return sock.sendMessage(
        from,
        {
          text: "Solo el owner puede revisar el estado de las APIs.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    await sock.sendMessage(
      from,
      {
        text: "Estoy revisando el estado de las APIs del bot. Espera unos segundos...",
        ...global.channelInfo,
      },
      { quoted: msg }
    );

    const results = await Promise.all(
      CHECKS.map(async (check) => ({
        ...check,
        ...(await probeUrl(check.url)),
      }))
    );

    const text =
      `*API ESTADO*\n\n` +
      results
        .map((item) => {
          const extra = item.error ? ` - ${item.error}` : "";
          return `• ${item.name}: *${item.label}* | ${item.status || "-"} | ${item.latencyMs}ms${extra}`;
        })
        .join("\n");

    return sock.sendMessage(
      from,
      {
        text: text.slice(0, 3900),
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
