function formatUptime(seconds) {
  seconds = Math.floor(seconds);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default {
  command: ["runtime", "uptime"],
  category: "sistema",
  description: "Tiempo encendido del bot",

  run: async ({ sock, msg, from }) => {
    const up = formatUptime(process.uptime());
    return sock.sendMessage(
      from,
      { text: `⏱️ *Uptime:* ${up}`, ...global.channelInfo },
      { quoted: msg }
    );
  }
};
