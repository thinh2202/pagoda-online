let ctx
let ambientNode = null

function getCtx() {
  const AudioContextClass = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AudioContextClass) return null
  if (!ctx) ctx = new AudioContextClass()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function ringBell(duration = 3.6) {
  try {
    const audio = getCtx()
    if (!audio) return
    const now = audio.currentTime
    const master = audio.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.38, now + 0.02)
    master.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    master.connect(audio.destination)

    ;[392, 588, 784, 1176].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.value = i === 0 ? 0.55 : 0.18 / i
      osc.connect(gain)
      gain.connect(master)
      osc.start(now)
      osc.stop(now + duration)
    })
  } catch (err) {
    console.warn('Không thể phát tiếng chuông:', err)
  }
}

export function ringSmallBell() {
  try {
    const audio = getCtx()
    if (!audio) return
    const now = audio.currentTime
    const master = audio.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.28, now + 0.015)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 2.5)
    master.connect(audio.destination)

    ;[1046, 2093, 3136].forEach((freq, i) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.value = i === 0 ? 0.35 : 0.15
      osc.connect(gain)
      gain.connect(master)
      osc.start(now)
      osc.stop(now + 2.5)
    })
  } catch (err) {
    console.warn('Không thể phát tiếng khánh:', err)
  }
}

export function playWoodenFish() {
  try {
    const audio = getCtx()
    if (!audio) return
    const now = audio.currentTime
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(760, now)
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.045)
    gain.gain.setValueAtTime(0.45, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(now)
    osc.stop(now + 0.1)
  } catch (err) {
    console.warn('Không thể phát tiếng mõ:', err)
  }
}

export function playLotusOfferingSound() {
  try {
    const audio = getCtx()
    if (!audio) return
    const now = audio.currentTime
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'triangle'
      osc.frequency.value = freq
      const t = now + idx * 0.08
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(t)
      osc.stop(t + 1.4)
    })
  } catch (err) {
    console.warn('Không thể phát âm thanh dâng hoa:', err)
  }
}

export function startAmbientStream() {
  try {
    stopAmbient()
    const audio = getCtx()
    if (!audio) return
    const bufferSize = audio.sampleRate * 2
    const buffer = audio.createBuffer(1, bufferSize, audio.sampleRate)
    const data = buffer.getChannelData(0)
    let lastOut = 0.0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      data[i] = (lastOut + 0.02 * white) / 1.02
      lastOut = data[i]
      data[i] *= 3.5
    }
    const noise = audio.createBufferSource()
    noise.buffer = buffer
    noise.loop = true

    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 800

    const gain = audio.createGain()
    gain.gain.setValueAtTime(0.001, audio.currentTime)
    gain.gain.linearRampToValueAtTime(0.09, audio.currentTime + 1.2)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(audio.destination)
    noise.start()
    ambientNode = { noise, gain }
  } catch (err) {
    console.warn('Không thể bật âm thanh suối reo:', err)
  }
}

export function stopAmbient() {
  if (ambientNode) {
    try {
      const now = ctx?.currentTime || 0
      ambientNode.gain.linearRampToValueAtTime(0.0001, now + 0.5)
      setTimeout(() => {
        try {
          ambientNode?.noise.stop()
        } catch {}
        ambientNode = null
      }, 600)
    } catch {
      ambientNode = null
    }
  }
}
