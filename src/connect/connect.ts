/**
 * The connect page: the shell's only local document.
 *
 * It renders the copy the main process sends, posts the typed address back, and
 * shows the localized refusal. It performs no parsing of its own — the main
 * process owns both validation and the navigation that follows — so the page
 * cannot disagree with what the window actually opened.
 */

import type { RemoteShellBridge } from '../ipc.ts'
import { copyFor } from '../locale.ts'

declare global {
  interface Window {
    /** Injected by the sandboxed preload; absent only outside Electron. */
    readonly remoteShell?: RemoteShellBridge
  }
}

/**
 * Return one required element, failing loudly when the document and this script
 * disagree about the markup. The cast is the page's own contract: the HTML file
 * beside this script declares each id's element type, and a mismatch fails here
 * rather than surfacing as a silent no-op later.
 * @param id - Element id.
 * @returns The element as its markup declares it.
 */
function element(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`connect page: missing element #${id}`)
  return found
}

const heading = element('heading')
const description = element('description')
const notice = element('notice')
const form = element('form') as HTMLFormElement
const addressLabel = element('address-label')
const addressInput = element('address') as HTMLInputElement
const errorLine = element('error')
const submit = element('submit') as HTMLButtonElement
const hint = element('hint')

/**
 * Show or clear the refusal line.
 * @param message - Sentence to show, or undefined to hide the line.
 */
function showError(message: string | undefined): void {
  errorLine.textContent = message ?? ''
  errorLine.hidden = message === undefined
}

/**
 * Render the state the main process reported and focus the field.
 * @param bridge - Preload bridge.
 */
async function render(bridge: RemoteShellBridge): Promise<void> {
  const state = await bridge.bootstrap()
  const { copy } = state
  document.title = copy.connectTitle
  heading.textContent = copy.connectHeading
  description.textContent = copy.connectDescription
  addressLabel.textContent = copy.addressLabel
  addressInput.placeholder = copy.addressPlaceholder
  submit.textContent = copy.connectAction
  hint.textContent = copy.addressHint
  notice.textContent = state.notice ?? ''
  notice.hidden = state.notice === undefined
  if (state.remembered !== undefined) addressInput.value = state.remembered
  addressInput.focus()
  addressInput.select()
}

/**
 * Submit one address and keep the field editable while the window navigates.
 * @param bridge - Preload bridge.
 */
async function submitAddress(bridge: RemoteShellBridge): Promise<void> {
  submit.disabled = true
  showError(undefined)
  try {
    const result = await bridge.connect(addressInput.value)
    if (!result.ok) {
      showError(result.message)
      submit.disabled = false
      addressInput.focus()
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error))
    submit.disabled = false
  }
}

const bridge = window.remoteShell
if (bridge === undefined) {
  showError(copyFor(navigator.language).errorNoBridge)
} else {
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitAddress(bridge)
  })
  void render(bridge)
}
