ev.on({
    name: 'stats',
    cmd: ['st', 'stats', 'ping'],
    tags: 'Info Menu',
    desc: 'status Bot',
    owner: !1,
    prefix: !0,
    money: 100,
    exp: 0.1,

    run: async (xp, m, {
      chat,
      cmd
    }) => {
      try {
        const a = performance.now(),
              bytes = b => (b / 1024 / 1024).toFixed(2),
              time = global.time.timeIndo("Asia/Jakarta", "HH:mm"),
              cpu = os.cpus()?.[0]?.model ?? 'Tidak diketahui',
              platform = os.platform(),
              arch = os.arch(),
              totalMem = os.totalmem(),
              usedMem = totalMem - os.freemem()

        let totalDisk = 'Tidak diketahui',
            usedDisk = 'Tidak diketahui',
            freeDisk = 'Tidak diketahui'

        try {
          const d = execSync('df -h /', { encoding: 'utf8' })
            .split('\n')[1]
            .split(/\s+/)
          ;[totalDisk, usedDisk, freeDisk] = [d[1], d[2], d[3]]
        } catch (e) {
          err('Disk info error:', e.message)
        }

        const stats = `${head} ${opb} Stats *${botName}* ${clb}
    ${body} ${btn} *Bot Name:* ${botName}
    ${body} ${btn} *Bot Full Name:* ${botFullName}
    ${body} ${btn} *Time:* ${time}
    ${body} ${btn} *Respon:* ${(performance.now() - a).toFixed(2)} ms
    ${foot}${line}

    ${head} ${opb} Stats System ${clb}
    ${body} ${btn} *Platform:* ${platform} ( ${arch} )
    ${body} ${btn} *Cpu:* ${cpu}
    ${body} ${btn} *Ram:* ${bytes(usedMem)} MB / ${bytes(totalMem)} MB
    ${body} ${btn} *Storage:* ${usedDisk} / ${totalDisk} ( ${freeDisk} )
    ${foot}${line}`.trim()

        await xp.sendMessage(chat.id, {
          image: { url: 'https://images8.alphacoders.com/584/thumb-1920-584430.jpg' },
          caption: stats,
          contextInfo: {
            externalAdReply: {
              title: botFullName,
              body: `Ini adalah stats ${botName}`,
              thumbnailUrl: 'https://images8.alphacoders.com/584/thumb-1920-584430.jpg',
              mediaType: 1,
              renderLargerThumbnail: !0
            }
          }
        }, { quoted: m })
      } catch (e) {
        err(`error pada ${cmd}`, e)
        call(xp, e, m)
      }
    }
  })
