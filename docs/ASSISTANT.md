# Assistant Brain

Pip’s Assistant Brain runs in the existing Electron main process. It reuses the existing Codex session, settings, typed preload IPC, desktop monitor and character actions. No hosted account or API key is stored by Pip. Codex manages its own sign-in.

## Start

1. Run `codex login` if needed, then `npm run dev`.
2. In Pip Settings, enable **Connect to Codex**. Choose an advertised model or leave **Server default** selected. Pip uses the catalogue’s default model and reasoning effort rather than assuming the CLI’s configured model is available to this account.
3. Click Pip, choose **Talk to Pip** from his menu, click a speech bubble, or use the tray action.
4. Choose **Register folder** to grant project context. Confirm the project indicator and directory before asking for a project investigation.
5. Use **Inspect** for read-only questions and reviews. **Work** asks permission before starting and retains the configured sandbox limit and native Codex approvals. It does not silently upgrade the sandbox.

The popover supports multiple-line prompts (Cmd/Ctrl+Enter submits), streamed replies, Markdown headings, lists, bold text, inline/fenced code, copy, stop, retry, new conversations and history. Raw HTML is text, not executable markup. The close button hides the popover without cancelling tasks or keeping keyboard focus. Native placement keeps it inside the display work area; the window is resizable for longer responses.

General, project, task and background-investigation conversations have distinct references. Selecting history confirms that conversation’s project; changing from inspect to work creates a separate conversation. Each project retains its canonical selected directory, repository metadata and optional explicit instructions. A selected subdirectory does not silently grant the repository’s parent directory as the task working directory. Git metadata is read with a short timeout, without scanning repository contents or enabling filesystem monitor hooks.

## Tasks and approvals

One managed stdio App Server connection multiplexes threads. Up to eight tasks can run across distinct conversations. A single conversation has at most one active turn. Pip persists bounded task metadata and treats unfinished work as interrupted after restart; it never automatically re-executes it. Retry resumes the relevant conversation and re-applies the work approval gate.

The app gate does not replace native approvals. Command, file and permission requests remain visible until answered, including queued requests from concurrent tasks. File proposals include the known change preview. Question-based approval prompts require the user’s answers. Unknown request methods are rejected. MCP form/URL elicitations that Pip cannot safely render are explicitly declined; complete that integration’s authentication through Codex’s configured flow instead.

Only a terminal `turn/completed` with `status: completed` produces completion. Interrupted turns are cancelled, failed turns are failed, and disconnects interrupt tracked work. A start timeout is not taken as proof of success. Stopping sends `turn/interrupt`; the UI waits for the backend’s terminal notification. Shutdown declines unanswered approvals, requests turn interruption, and then stops the owned process with a bounded grace period.

### Read-only tool isolation boundary

Inspect threads disable discovered MCP servers and verify the resulting thread inventory before sending a prompt. Some managed Codex environments inject setup integrations that cannot be disabled per thread. In that case Pip fails closed with a clear explanation: use an explicitly approved **Work** request for the investigation. That request still uses the configured sandbox, which defaults to read-only. Pip does not claim isolation when the backend cannot provide it.

The Codex read-only sandbox prevents writes; it is not an OS-level read allowlist limited to the registered folder. Project scope is supplied as explicit instructions and a canonical working directory. Do not treat this as hard filesystem confidentiality against a malicious model or server. Native approvals and provider/MCP configuration remain authoritative boundaries.

## Structured workspace integration

Enable **Local workspace event integration** in Settings. Pip exposes a same-user Unix socket with mode `0600`, normally:

```
~/Library/Application Support/pip/assistant.sock
```

From an explicitly registered folder:

```bash
node /path/to/Pip/scripts/pip-context.mjs workspace "$PWD"
node /path/to/Pip/scripts/pip-context.mjs test_failed "$PWD"
node /path/to/Pip/scripts/pip-context.mjs build_failed "$PWD"
node /path/to/Pip/scripts/pip-context.mjs merge_conflict "$PWD"
```

An optional third argument is a workspace-relative open-file path. No file contents are sent. Set `PIP_ASSISTANT_SOCKET` for a non-default profile or location. IDE tasks can call this script when a workspace is activated or a test/build exits unsuccessfully. There is no bundled VS Code extension or assumption that window titles identify the current workspace. A matching title is only **probable** context and never grants project operations. A registered integration receipt or explicit project selection confirms context.

The socket accepts only registered canonical directories and the four event types above, has size/time limits, and cannot execute commands. Window/application text is not treated as a tool instruction. Existing blocked-app and title-sharing settings apply to desktop observations. No screenshots or global keyboard input are captured.

## Suggestions

Structured test/build failures, merge conflicts, failed/completed tasks, long-running tasks and confirmed project returns can produce suggestions. They carry their source, project, confidence, reason, action, expiry and state. Frequency can be off, low or normal; focus and sleep modes suppress live suggestions. Similar suggestions are deduplicated, declined suggestions remain suppressed during the bounded retention period, and nothing executes merely because a bubble appeared.

**Do it** starts the proposed read-only investigation, **Tell me more** explains the proposal, and **Dismiss** records the decline. If inspect tool isolation is unavailable, choose a scoped Work request explicitly instead.

## Memory and privacy

Character memory remains in `pip-state.json`. Assistant records are stored separately in `assistant-memory.json` under Electron’s user-data directory, written atomically with owner-only permissions. Retention is bounded: 20 projects, 60 conversations, 40 messages per conversation, 100 tasks, 100 suggestions (30 days) and 80 transient in-memory events. Active tasks and their conversations are retained preferentially.

Pip stores explicit messages, thread references, project associations, task summaries and dismissed suggestions. It does not automatically copy repositories, credentials, screenshots, full files or desktop history into this store. Recognised API-key, bearer-token and private-key patterns are redacted from persisted messages. Codex owns authentication secrets and its own thread history. Clearing Pip’s assistant memory does not delete Codex’s separate history.

Turn off **Save assistant conversations and task history** to stop further persistence. **Clear assistant memory** and **Forget selected project and its history** remove local assistant records after active tasks are stopped. They do not erase character learning or personality settings.

## Debugging and verification

The playground’s **Assistant Brain debugger** has an isolated instance of the same Brain and event handlers. Project, task, approval and connection simulations update its tasks, events, suggestions and existing character animation. They cannot read actual projects or execute AI tools, and do not modify the live assistant. The live assistant can be opened separately from the debugger.

```bash
npm test
npm run typecheck
npm run build
```

The regular suite uses scripted App Server transports to cover context confidence/isolation, thread continuation, streaming, queued approvals, cancellation, interrupted work, capability status, suggestion lifecycle and animation mapping. Live calls are deliberately opt-in:

```bash
codex login status
PIP_LIVE_CODEX=1 npm test -- tests/codex-live.test.ts
```

This uses the existing login and may consume account usage. It creates a temporary README fixture, selects the server-advertised model, grants only the exact `cat README.md` read, confirms the phrase in the streamed response and checks that the fixture is unchanged. Other approvals are declined. Set `PIP_CODEX_BIN` for a non-default executable. This test verifies the real client/transport/approval flow, not every external integration or arbitrary project task.

For manual end-to-end acceptance: register a disposable project, ask for a review, run an explicitly approved task, stop a slow task, submit a structured failed-test receipt, dismiss/accept its suggestion, restart Pip and resume history. Re-test the puppy with Codex disabled or disconnected.

Protocol reference: [official Codex App Server documentation](https://learn.chatgpt.com/docs/app-server), checked against installed Codex CLI 0.151.0. Generated protocol types remain under `vendor/codex-app-server`.
