import {
  findGroupParticipant,
  getParticipantDisplayTag,
  getParticipantMentionJid,
} from "../../lib/group-compat.js";

function getActorCandidate(update = {}) {
  return (
    update?.author ||
    update?.actor ||
    update?.sender ||
    update?.from ||
    update?.notify ||
    ""
  );
}

function buildNoticeText({ action, targetTag, actorTag }) {
  if (action === "promote") {
    const lines = [
      "╭─〔 *ADMIN • NOTIFICACION* 〕",
      `┃ ✅ ${targetTag} ahora es *admin*`,
      actorTag ? `┃ 👮 Accion por: ${actorTag}` : "┃ 👮 Accion por: administrador",
      "╰─⟡ Cambio de rango detectado.",
    ];
    return lines.join("\n");
  }

  const lines = [
    "╭─〔 *ADMIN • NOTIFICACION* 〕",
    `┃ ⚠️ ${targetTag} ya no es *admin*`,
    actorTag ? `┃ 👮 Accion por: ${actorTag}` : "┃ 👮 Accion por: administrador",
    "╰─⟡ Cambio de rango detectado.",
  ];
  return lines.join("\n");
}

export default {
  name: "adminnotify",
  command: ["adminnotify", "notiadmin", "avisoadmin", "adminaviso"],
  category: "grupo",
  groupOnly: true,
  adminOnly: true,
  description: "Notifica en el grupo cuando promueven o degradan administradores",

  async run({ sock, msg, from, args = [] }) {
    const quoted = msg?.key ? { quoted: msg } : undefined;
    const action = String(args[0] || "status").trim().toLowerCase();

    if (!args.length || action === "status" || action === "on") {
      return sock.sendMessage(
        from,
        {
          text:
            `*ADMIN NOTIFY*\n\n` +
            `Estado: *SIEMPRE ACTIVO*\n\n` +
            `Este aviso queda encendido en todo momento.\n` +
            `No requiere activacion por grupo.`,
          ...global.channelInfo,
        },
        quoted
      );
    }

    if (action === "off") {
      return sock.sendMessage(
        from,
        {
          text: "⚠️ AdminNotify es global y permanente. No se puede apagar.",
          ...global.channelInfo,
        },
        quoted
      );
    }

    return sock.sendMessage(
      from,
      {
        text: "Usa .adminnotify status",
        ...global.channelInfo,
      },
      quoted
    );
  },

  async onGroupUpdate({ sock, update }) {
    if (!update?.id) return;
    const action = String(update.action || "").trim().toLowerCase();
    if (!["promote", "demote"].includes(action)) return;

    let metadata = null;
    try {
      metadata = await sock.groupMetadata(update.id);
    } catch {}

    const actorCandidate = getActorCandidate(update);
    const actorParticipant = findGroupParticipant(metadata || {}, [actorCandidate]);
    const actorMentionJid = getParticipantMentionJid(metadata || {}, actorParticipant, actorCandidate);
    const actorTag = getParticipantDisplayTag(actorParticipant, actorCandidate);

    for (const participant of update.participants || []) {
      const targetParticipant = findGroupParticipant(metadata || {}, [participant]);
      const targetMentionJid = getParticipantMentionJid(
        metadata || {},
        targetParticipant,
        participant
      );
      const targetTag = getParticipantDisplayTag(targetParticipant, participant);
      const text = buildNoticeText({
        action,
        targetTag,
        actorTag: actorMentionJid && actorMentionJid !== targetMentionJid ? actorTag : "",
      });

      const mentions = Array.from(
        new Set([targetMentionJid, actorMentionJid].filter(Boolean))
      );

      await sock.sendMessage(update.id, {
        text,
        mentions,
        ...global.channelInfo,
      });
    }
  },
};
