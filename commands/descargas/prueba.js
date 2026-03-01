import fetch from 'node-fetch'
import yts from 'yt-search'
import sharp from 'sharp'
import { getBuffer } from '../lib/message.js'

const isYTUrl = (text) =>
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/i.test(text)

const cleanYoutubeUrl = (input) => {
  try {
    const u = new URL(input)

    // youtu.be/ID
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace('/', '')
      return `https://youtube.com/watch?v=${id}`
    }

    // youtube.com/watch?v=ID
    const v = u.searchParams.get('v')
    if (v) return `https://youtube.com/watch?v=${v}`

    return input
  } catch {
    return input
  }
}

export default {
  command: ['yta', 'ytmp3', 'playaudio', 'mp3'],
  category: 'downloader',
  run: async (client, m, args) => {
    try {
      if (!args[0]) {
        return m.reply('🎧 *Shizuka AI:*\n> Escribe el nombre o link del video para descargar el audio.')
      }

      const query = args.join(' ')
      let url, meta

      if (!isYTUrl(query)) {
        const s = await yts(query)
        if (!s.all?.length) return m.reply('🥀 No encontré resultados.')
        meta = s.all[0]
        url = meta.url
      } else {
        url = cleanYoutubeUrl(query)
        // sacar metadata por videoId (más estable)
        const videoId = (() => {
          try {
            const u = new URL(url)
            return u.searchParams.get('v')
          } catch { return null }
        })()
        meta = videoId ? await yts({ videoId }) : null
      }

      const title = meta?.title || 'YouTube Audio'
      const thumbUrl = meta?.image || meta?.thumbnail
      const channel = meta?.author?.name || 'YouTube'
      const duration = meta?.timestamp || meta?.duration?.timestamp || 'N/A'
      const views = (meta?.views || 0).toLocaleString()

      let thumbBuffer = null
      if (thumbUrl) thumbBuffer = await getBuffer(thumbUrl)

      // Mensaje informativo
      let info = `🎧 *Descargando audio*\n\n`
      info += `• 🏷️ *Título:* ${title}\n`
      info += `• 🎙️ *Canal:* ${channel}\n`
      info += `• ⏳ *Duración:* ${duration}\n`
      info += `• 👀 *Vistas:* ${views}\n\n`
      info += `> ⏳ Espera un momento...`

      if (thumbBuffer) {
        await client.sendMessage(m.chat, { image: thumbBuffer, caption: info }, { quoted: m })
      } else {
        await m.reply(info)
      }

      // ✅ API VREDEN (AUDIO)
      const apiUrl =
        `https://api.vreden.my.id/api/v1/download/youtube/audio?` +
        `url=${encodeURIComponent(url)}&quality=128`

      const res = await fetch(apiUrl, {
        headers: { 'accept': 'application/json' }
      })
      const json = await res.json()

      // Validación de API
      if (!json?.status || !json?.result) {
        return m.reply('🥀 La API no respondió como se esperaba. Intenta otra vez.')
      }

      // Si la API trae "download.status=false" como tu ejemplo
      if (json.result?.download && json.result.download.status === false) {
        const msg = json.result.download.message || 'Converting error'
        return m.reply(`🥀 No se pudo convertir el audio.\n> Motivo: *${msg}*\n\nPrueba con otro video o intenta más tarde.`)
      }

      // Algunas APIs devuelven el link en distintas llaves: intenta varias
      const dl =
        json.result?.download?.url ||
        json.result?.download_url ||
        json.result?.url ||
        json.result?.download?.link

      if (!dl) {
        return m.reply('🥀 No encontré el link de descarga en la respuesta de la API.')
      }

      // Descargar el MP3 como buffer
      const audioBuffer = await getBuffer(dl)

      // Thumbnail para WhatsApp (si existe)
      let jpegThumb = null
      if (thumbBuffer) {
        jpegThumb = await sharp(thumbBuffer).resize(300, 300).jpeg({ quality: 80 }).toBuffer()
      }

      await client.sendMessage(
        m.chat,
        {
          audio: audioBuffer,
          mimetype: 'audio/mpeg',
          fileName: `${title}.mp3`,
          jpegThumbnail: jpegThumb || undefined,
          ptt: false
        },
        { quoted: m }
      )
    } catch (e) {
      console.error('YTMP3 Vreden Error:', e)
      await m.reply('🥀 *Shizuka AI:*\n> Error inesperado al descargar el audio.')
    }
  }
}
