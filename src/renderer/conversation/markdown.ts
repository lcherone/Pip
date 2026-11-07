/** Small, DOM-only Markdown renderer: raw HTML and executable links are never interpreted. */
export function renderMarkdown(text: string): HTMLElement {
  const container = document.createElement('div')
  let code: HTMLPreElement | null = null
  let list: HTMLUListElement | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('```')) {
      if (code) code = null
      else { code = document.createElement('pre'); const child = document.createElement('code'); code.append(child); container.append(code) }
      list = null
      continue
    }
    if (code) { code.firstChild!.textContent += `${line}\n`; continue }
    let node: HTMLElement
    if (/^[-*] /.test(line)) {
      if (!list) { list = document.createElement('ul'); container.append(list) }
      node = document.createElement('li'); list.append(node)
    } else {
      list = null
      node = document.createElement(/^#{1,4} /.test(line) ? 'h3' : 'p')
      container.append(node)
    }
    const value = line.replace(/^(?:#{1,4}|[-*]) /, '')
    for (const fragment of value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)) {
      if (fragment.startsWith('`') && fragment.endsWith('`')) { const el = document.createElement('code'); el.textContent = fragment.slice(1, -1); node.append(el) }
      else if (fragment.startsWith('**') && fragment.endsWith('**')) { const el = document.createElement('strong'); el.textContent = fragment.slice(2, -2); node.append(el) }
      else node.append(document.createTextNode(fragment))
    }
  }
  return container
}
