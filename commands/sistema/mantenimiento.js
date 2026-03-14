import { getPrefix } from "./_shared.js";

function buildStateLabel(state) {
  if (!state?.enabled) return "APAGADO";
  if (state.mode === "owner_only") return "SOLO OWNER";
  if (state.mode === "downloads_off") return "DESCARGAS EN PAUSA";
  return "ACTIVO";
}

export default {
  name: "mantenimiento",
  command: ["mantenimiento", "maintenance", "maint"],
  category: "sistema",
  description: "Activa o apaga el modo mantenimiento del bot",

  run: async ({ sock, msg, from, args = [], esOwner, settings }) => {
    const prefix = getPrefix(settings);
    const runtime = global.botRuntime;

    if (!runtime?.getMaintenanceState || !runtime?.setMaintenanceState) {
      return sock.sendMessage(
        from,
        {
          text: "No pude acceder al modo mantenimiento.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const action = String(args[0] || "status").trim().toLowerCase();
    const state = runtime.getMaintenanceState();

    if (!esOwner && action !== "status") {
      return sock.sendMessage(
        from,
        {
          text: "Solo el owner puede cambiar el mantenimiento del bot.",
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    if (!args.length || action === "status" || action === "estado") {
      return sock.sendMessage(
        from,
        {
          text:
            `*MODO MANTENIMIENTO*\n\n` +
            `Estado: *${buildStateLabel(state)}*\n` +
            `Modo: *${state.mode}*\n` +
            `Mensaje: ${state.message || "Sin mensaje"}\n\n` +
            `Uso:\n` +
            `${prefix}mantenimiento off\n` +
            `${prefix}mantenimiento owner Mensaje opcional\n` +
            `${prefix}mantenimiento descargas Mensaje opcional`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    let mode = "off";

    if (["on", "owner", "solo", "soloowner"].includes(action)) {
      mode = "owner_only";
    } else if (["descargas", "downloads", "download", "media"].includes(action)) {
      mode = "downloads_off";
    } else if (!["off", "apagar"].includes(action)) {
      return sock.sendMessage(
        from,
        {
          text:
            `Opcion invalida.\n\n` +
            `Usa:\n` +
            `${prefix}mantenimiento off\n` +
            `${prefix}mantenimiento owner Mensaje\n` +
            `${prefix}mantenimiento descargas Mensaje`,
          ...global.channelInfo,
        },
        { quoted: msg }
      );
    }

    const next = runtime.setMaintenanceState(mode, args.slice(1).join(" "));

    return sock.sendMessage(
      from,
      {
        text:
          `*MANTENIMIENTO ACTUALIZADO*\n\n` +
          `Estado: *${buildStateLabel(next)}*\n` +
          `Modo: *${next.mode}*\n` +
          `Mensaje: ${next.message || "Sin mensaje"}`,
        ...global.channelInfo,
      },
      { quoted: msg }
    );
  },
};
