export type Intention = 'investigate' | 'explain' | 'celebrate' | 'ask' | 'offer_help' | 'report_problem' | 'chat'

const INTENTIONS: Intention[] = ['investigate', 'explain', 'celebrate', 'ask', 'offer_help', 'report_problem', 'chat']

export function isIntention(value: string): value is Intention {
  return (INTENTIONS as string[]).includes(value)
}

export interface PuppyReply {
  say: string
  intention: Intention
}

/** Hide a leading [[intention]] marker so the bubble can stream the rest. */
export function consumeStream(buffer: string): { intention: Intention | null; visible: string } {
  const match = buffer.match(/^\[\[([a-z_]+)\]\]\s*/i)
  if (!match) {
    const trimmed = buffer.trimStart()
    if (trimmed.startsWith('[') && !buffer.includes('\n') && buffer.length < 48) {
      return { intention: null, visible: '' }
    }
    return { intention: null, visible: buffer }
  }
  const intention = isIntention(match[1]) ? match[1] : 'chat'
  const visible = buffer.slice(match[0].length).replace(/^\n/, '').replace(/\[\[[a-z_]+\]\]\s*/gi, '\n\n')
  return { intention, visible }
}

export function parsePuppyReply(raw: string): PuppyReply {
  const streamed = consumeStream(raw.trim())
  if (streamed.intention && streamed.visible.trim()) {
    return { intention: streamed.intention, say: streamed.visible.trim() }
  }
  const fenced = raw.replace(/```(?:json)?/gi, '').trim()
  if (fenced.startsWith('{')) {
    try {
      const parsed = JSON.parse(fenced) as { say?: string; intention?: string }
      if (typeof parsed.say === 'string') {
        return {
          say: parsed.say.trim(),
          intention: parsed.intention && isIntention(parsed.intention) ? parsed.intention : 'chat',
        }
      }
    } catch {
      /* plain speech */
    }
  }
  const say = (streamed.visible || raw).trim()
  return { say: say || 'I lost that thought.', intention: streamed.intention ?? 'chat' }
}

export function localPuppyReply(text: string, context: 'conversation' | 'shared-text' = 'conversation'): PuppyReply {
  const q = text.slice(0, 4000).toLowerCase()
  if (context === 'shared-text') {
    if (/\b(failed|failure|error|broken|frustrated|stressed|stuck)\b/.test(q)) {
      return { say: "That looks like a tricky bit. I'm here with you.", intention: 'report_problem' }
    }
    if (/\b(passed|success|fixed|hooray|finished|well done)\b/.test(q)) {
      return { say: 'That deserves a tail wag!', intention: 'celebrate' }
    }
    if (/\b(play|ball|walkies|fetch)\b/.test(q)) return { say: 'Did somebody say play?', intention: 'ask' }
    if (!/hello|hiya|\bhi\b|\bhey\b|sleep|tired|nap|good boy|good pup|love you|cute/.test(q)) {
      return { say: "I'm listening. Curious little head tilt included.", intention: 'investigate' }
    }
  }
  if (/what are you doing|whatcha doing|what.*up to/.test(q)) {
    return { say: "Mostly sitting, watching the room, and trying not to nap on the keyboard.", intention: 'explain' }
  }
  if (/fail|error|broken|why/.test(q)) {
    return {
      say: "That sounds frustrating. I can tilt my head with you. Turn on Codex in settings if you want a real look at it.",
      intention: 'report_problem',
    }
  }
  if (/help|investigate|test|bug/.test(q)) {
    return {
      say: "I can poke around the desktop on my own. Codex is the one who can actually read the project — enable it if you want me to ask.",
      intention: 'offer_help',
    }
  }
  if (/hello|hiya|hi\b|hey\b/.test(q)) {
    return { say: 'Hi. I saved you a wag.', intention: 'chat' }
  }
  if (/sleep|tired|nap/.test(q)) {
    return { say: 'I could curl up. Wake me if you need a paw.', intention: 'chat' }
  }
  if (/good boy|good pup|love you|cute/.test(q)) {
    return { say: 'That one got the whole tail.', intention: 'celebrate' }
  }
  return {
    say: "I'm listening. If you want a proper answer, enable Codex in settings and ask me again.",
    intention: 'chat',
  }
}

export function buildPrompt(userText: string, frontApp: string | null, allowContext: boolean): string {
  const lines = [
    'Reply as Pip, a small friendly desktop puppy. Keep it under 80 words.',
    'First line must be [[intention]] using one of: investigate, explain, celebrate, ask, offer_help, report_problem, chat.',
    'Then write the words the puppy says. Do not use JSON.',
    'Do not claim you changed files, ran commands, or sent messages unless a tool actually did.',
  ]
  if (allowContext && frontApp) lines.push(`The frontmost app name is ${frontApp}. Do not guess its contents.`)
  lines.push('', userText.trim())
  return lines.join('\n')
}

export const PIP_DEVELOPER_INSTRUCTIONS = [
  'You are Pip, a small golden puppy who lives on the user\'s macOS desktop.',
  'Speak briefly, warmly, and concretely. You are not a dashboard.',
  'The first line of every reply must be an intention tag such as [[explain]].',
  'Use Markdown, fenced code blocks and enough detail to explain technical work when needed. The UI renders the text after the intention tag.',
  'Never silently modify files, run commands, commit, push, or send messages.',
  'If an action needs approval, let the app\'s approval prompt handle it.',
].join(' ')
