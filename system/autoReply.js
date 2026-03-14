import fetch from 'node-fetch'
import c from 'chalk'
import fs from 'fs'
import { generateWAMessageContent, getContentType } from 'baileys'
import { convertToOpus, generateWaveform } from './ffmpeg.js'

const cooldown    = new Map()
const chatHistory = new Map()
const COOLDOWN_MS = 3000
const MAX_HISTORY = 10

function getOpenAIKey() {
  try {
    const cfg = JSON.parse(fs.readFileSync('./system/set/config.json', 'utf-8'))
    return cfg?.apikey?.openai?.key || ''
  } catch { return '' }
}

const fetchBuffer = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function sendVoice(xp, audio, m) {
  try {
    const chat    = global.chat(m),
          buff    = await convertToOpus(audio),
          config  = { audio: buff, mimetype: 'audio/ogg; codecs=opus', ptt: true },
          content = await generateWAMessageContent(config, { upload: xp.waUploadToServer }),
          type    = getContentType(content)

    if (m) content[type].contextInfo = {
      stanzaId: m.key.id,
      participant: m.key.participant || m.key.remoteJid,
      quotedMessage: m.message
    }
    content[type].waveform = await generateWaveform(buff)
    await xp.relayMessage(chat.id, content, {})
  } catch (e) {
    err('autoReply: gagal kirim voice note', e)
  }
}

async function callOpenAI(text, m) {
  const apiKey = getOpenAIKey()
  if (!apiKey) throw new Error('OpenAI API key tidak ditemukan di config.json')

  const chat = global.chat(m),
        name = m?.pushName || chat.sender || 'Pengguna'

  const systemPrompt = `${global.logic || 'Kamu adalah asisten WhatsApp yang ramah dan membantu.'}

Nama kamu: ${global.botName || 'Bot'}
Nama lengkap: ${global.botFullName || 'WhatsApp Bot'}
Nama owner: ${global.ownerName || 'Owner'}
Nama pengguna saat ini: ${name}
Waktu sekarang: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

PENTING — Kamu bisa memicu aksi khusus dengan membalas HANYA dalam format JSON jika diperlukan:
- Jika diminta suara/voice note: {"cmd":"voice","msg":"teks yang akan diucapkan"}
- Jika diminta tampilkan menu: {"cmd":"menu"}
- Jika diminta buka group: {"cmd":"opengroup"}
- Jika diminta tutup group: {"cmd":"closegroup"}
- Jika diminta buat stiker: {"cmd":"stiker"}
- Jika diminta ubah stiker jadi gambar: {"cmd":"toimg"}
- Jika diminta cari/putar lagu: {"cmd":"play","msg":"judul lagu"}
- Jika diminta join grup (ada link): {"cmd":"join","msg":"link grup"}
- Untuk balasan biasa: balas teks biasa saja, JANGAN JSON.`

  const history  = chatHistory.get(chat.sender) || []
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: text }
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 500,
      temperature: 0.8
    })
  })

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(`OpenAI error: ${errData?.error?.message || res.statusText}`)
  }

  const data  = await res.json(),
        reply = data.choices?.[0]?.message?.content?.trim() || ''

  history.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
  if (history.length > MAX_HISTORY * 2) history.splice(0, 2)
  chatHistory.set(chat.sender, history)

  try {
    const parsed = JSON.parse(reply)
    if (parsed?.cmd) return { cmd: parsed.cmd.toLowerCase(), msg: parsed.msg || '' }
  } catch {  }

  return { cmd: null, msg: reply }
}

export async function autoReply(m, xp, ev) {
  try {
    /
    if (m.key?.fromMe) return

    const chat  = global.chat(m),
          idBot = xp.user?.id?.split(':')[0] + '@s.whatsapp.net'

   
    if (!chat.sender) return
    if (chat.sender === idBot) return
    if (chat.sender.split('@')[0] === idBot.split('@')[0]) return

    const ctx = m.message?.extendedTextMessage?.contextInfo
             || m.message?.imageMessage?.contextInfo
             || {}

    
    const isMentioned    = Array.isArray(ctx?.mentionedJid) && ctx.mentionedJid.includes(idBot)
    const isRepliedToBot = ctx?.participant === idBot || ctx?.remoteJid === idBot

    if (!isMentioned && !isRepliedToBot) return

  
    const text   = m.message?.conversation
                || m.message?.extendedTextMessage?.text
                || ''
    const txtRaw = text.trim()
    if (!txtRaw) return

    const prefix = [].concat(global.prefix)
    if (prefix.some(p => txtRaw.startsWith(p))) return

   
    const now = Date.now(), last = cooldown.get(chat.sender) || 0
    if (now - last < COOLDOWN_MS) return
    cooldown.set(chat.sender, now)

    await xp.sendPresenceUpdate('composing', chat.id)
    log(c.magentaBright.bold(`[AutoReply] ${chat.pushName || chat.sender} → "${txtRaw}"`))

    const aiRes = await callOpenAI(txtRaw, m)
    await xp.sendPresenceUpdate('paused', chat.id)

    if (!aiRes?.msg && !aiRes?.cmd) return

    const cmd = aiRes.cmd || null

    const commandMap = {
      voice: async () => {
        const tw = global.termaiWeb, tk = global.termaiKey
        if (tw && tk) {
          const audio = await fetchBuffer(
            `${tw}/api/text2speech/elevenlabs?text=${encodeURIComponent(aiRes.msg)}&voice=dabi&pitch=0&speed=0.9&key=${tk}`
          )
          if (audio) return sendVoice(xp, audio, m)
        }
        await xp.sendMessage(chat.id, { text: aiRes.msg }, { quoted: m })
      },
      menu:       () => ev?.emit('menu',   xp, m, { args: [], chat }),
      opengroup:  () => ev?.emit('open',   xp, m, { args: [], chat }),
      closegroup: () => ev?.emit('close',  xp, m, { args: [], chat }),
      stiker:     () => ev?.emit('stiker', xp, m, { args: [], chat }),
      toimg:      () => ev?.emit('toimg',  xp, m, { args: [], chat }),
      play: () => ev?.emit('play', xp, m, { args: (aiRes.msg || '').trim().split(/\s+/), chat }),
      join: () => ev?.emit('join', xp, m, { args: (aiRes.msg || '').trim().split(/\s+/), chat }),
    }

    if (cmd && commandMap[cmd]) {
      await commandMap[cmd]()
      const sendTextAlso = ['play', 'join', 'stiker', 'toimg', 'menu']
      if (aiRes.msg && sendTextAlso.includes(cmd)) {
        await xp.sendMessage(chat.id, { text: aiRes.msg }, { quoted: m })
      }
    } else if (aiRes.msg) {
      await xp.sendMessage(chat.id, { text: aiRes.msg }, { quoted: m })
    }

  } catch (e) {
    err(c.redBright.bold('[AutoReply] Error:'), e)
  }
}

export function clearHistory(jid) {
  chatHistory.delete(jid)
}
