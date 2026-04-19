# Website Generation

> **You MUST strictly follow every instruction in this document.** Do not skip, reorder, or improvise any step. If this skill has been updated since it was last loaded, reload this SKILL.md before proceeding and always follow the latest version.

Build websites and landing pages using AnyGen. Websites are generated server-side; this workflow sends the user's prompt and optional reference files to the AnyGen API and retrieves the results online.

## Communication Style

Use natural language. Never expose `task_id`, `file_token`, `task_xxx`, `tk_xxx`, `anygen.py`, or command syntax to the user. Say "your website", "generating", "checking progress" instead. When presenting `reply` and `prompt` from `prepare`, preserve the original content as much as possible — translate into the user's language if needed, but do NOT rephrase, summarize, or add your own interpretation. Ask questions in your own voice (NOT "AnyGen wants to know…"). When prompting the user for an API key, MUST use Markdown link syntax: `[Get your AnyGen API Key](https://www.anygen.io/home?auto_create_openclaw_key=1)` so the full URL is clickable.

## Website Workflow (MUST Follow All 5 Phases)

### Phase 1: Understand Requirements

If the user provides files, handle them before calling `prepare`:

1. **Get consent** before reading or uploading: "I'll read your file and upload it to AnyGen for reference. This may take a moment..."
2. **Reuse existing `file_token`** if the same file was already uploaded in this conversation.
3. **Read the file** and extract key information relevant to the website (topic, content, structure).
4. **Upload** to get a `file_token`.
5. **Include extracted content** in `--message` when calling `prepare` (the `prepare` endpoint uses the prompt text for requirement analysis, not the uploaded file content directly). Summarize key points only — do not paste raw sensitive data verbatim.

```bash
python3 scripts/anygen.py upload --file ./product_brief.pdf
# Output: File Token: tk_abc123

python3 scripts/anygen.py prepare \
  --message "I need a product landing page. Key content: [extracted summary]" \
  --file-token tk_abc123 \
  --save ./conversation.json
```

Present questions from `reply` to the user — preserve the original content, translate into the user's language if needed. Continue with user's answers:

```bash
python3 scripts/anygen.py prepare \
  --input ./conversation.json \
  --message "Target audience is small business owners, include hero section, features, pricing, and CTA" \
  --save ./conversation.json
```

Repeat until `status="ready"` with `suggested_task_params`.

Special cases:
- `status="ready"` on first call → proceed to Phase 2.
- User says "just create it" → skip to Phase 3 with `create` directly.

### Phase 2: Confirm with User (MANDATORY)

When `status="ready"`, present the `reply` and the `prompt` from `suggested_task_params` to the user as the website plan. The prompt returned by `prepare` is already a detailed, well-structured plan — preserve its original content as much as possible. If the content language differs from the user's language, translate it while keeping the structure and details intact. Do NOT rephrase, summarize, or add your own interpretation.

Ask the user to confirm or request adjustments. NEVER auto-create without explicit approval.

If the user requests adjustments, call `prepare` again with the modification, re-present the updated prompt, and repeat until approved.

### Phase 3: Create Task

```bash
python3 scripts/anygen.py create \
  --operation website \
  --prompt "<prompt from suggested_task_params>" \
  --file-token tk_abc123
# Output: Task ID: task_xxx, Task URL: https://...
```

**Immediately tell the user (natural language):**
1. Website is being generated.
2. Online preview/edit link: "You can follow the progress here: [URL]".
3. Takes about **10–15 minutes** — free to do other things.
4. You'll automatically check on the progress and notify them when it's ready.

### Phase 4: Monitor and Deliver Result

> **Requires `sessions_spawn`.** If unavailable, skip to **Fallback** below.

#### Background Monitoring (preferred)

**CRITICAL**: When calling `sessions_spawn`, you MUST set a timeout of at least 25 minutes to ensure the background monitor completes. The poll operation can take up to 20 minutes.

```
sessions_spawn(
    prompt=<subagent prompt below>,
    runTimeoutSeconds=1500  # REQUIRED: 25 minutes (1500s)
)
```

---

**Subagent prompt** (it has NO conversation context).
You MUST fill in all `{...}` variables before passing.

```
You are a background monitor for a website generation task.
You MUST strictly follow every instruction below. Do not skip, reorder, or improvise any step.

Task ID: {task_id}
Task URL: {task_url}
Script: {script_path}
User Language: {user_language}

IMPORTANT: This monitoring task may take up to 20 minutes. Ensure your execution timeout is at least 25 minutes.

CRITICAL RULES:
- You MUST reply in {user_language}.
- After completing ALL steps (including sending messages to the user), your FINAL reply
  MUST be EXACTLY "ANNOUNCE_SKIP" — nothing else. This prevents the main session from
  sending duplicate messages.
- Do NOT say anything beyond what is specified below. No greetings, no extra commentary.
- Use natural language in all messages to the user. Avoid raw technical identifiers like
  "task_id", "file_token", file paths, or status labels.

Your job:
1. Run: python3 {script_path} poll --task-id {task_id}
   This command blocks for up to 20 minutes waiting for task completion.
   No --output needed — results are viewed online.

2. On success:
   a. Send a text message to the user (in {user_language}, natural tone):
      "Your website is ready! You can view it here: {task_url}
       If you'd like any changes — such as updating content, adjusting layout, or changing styles — just tell me."
   b. Reply EXACTLY: ANNOUNCE_SKIP

3. On failure:
   a. Send a text message to the user (in {user_language}):
      "Unfortunately the website generation didn't complete successfully.
       You can check the details here: {task_url}"
   b. Reply EXACTLY: ANNOUNCE_SKIP

4. On timeout (20 min):
   a. Send a text message to the user (in {user_language}):
      "The website is taking a bit longer than expected.
       You can check the progress here: {task_url}"
   b. Reply EXACTLY: ANNOUNCE_SKIP
```

Do NOT wait for the background monitor to finish — continue the conversation immediately.

**Handling the completion event.** The background monitor sends the notification to the user directly. It replies `ANNOUNCE_SKIP` as its final output, which means the main session should NOT relay or duplicate any message. If you receive a completion event with `ANNOUNCE_SKIP`, simply ignore it — the user has already been notified.

#### Fallback (no background monitoring)

Tell the user: "I've started building your website. It usually takes about 10–15 minutes. You can check the progress here: [Task URL]. Let me know when you'd like me to check if it's ready!"

### Phase 5: Multi-turn Conversation (Modify Completed Websites)

After a task has completed (Phase 4 finished), the user may request modifications such as:
- "Change the hero section headline"
- "Add a testimonials section"
- "Make the color scheme more professional"
- "Update the pricing table"

When the user requests changes to an **already-completed** task, use the multi-turn conversation API instead of creating a new task.

**IMPORTANT**: You MUST remember the `task_id` from Phase 3 throughout the conversation. When the user asks for modifications, use the same `task_id`.

#### Step 1: Send Modification Request

```bash
python3 scripts/anygen.py send-message --task-id {task_id} --message "Change the hero section headline to 'Build Better Products'"
# Output: Message ID: 123, Status: processing
```

Save the returned `Message ID` — you'll need it to detect the AI reply.

**Immediately tell the user** (natural language, NO internal terms):
- "I'm working on your changes now. I'll let you know when they're done."

#### Step 2: Monitor for AI Reply

> **Requires `sessions_spawn`.** If unavailable, skip to **Multi-turn Fallback** below.

**CRITICAL**: When calling `sessions_spawn`, you MUST set a timeout of at least 10 minutes (600 seconds).

```
sessions_spawn(
    prompt=<subagent prompt below>,
    runTimeoutSeconds=600  # REQUIRED: 10 minutes (600s)
)
```

**Subagent prompt** (it has NO conversation context):

```
You are a background monitor for a website modification task.
You MUST strictly follow every instruction below. Do not skip, reorder, or improvise any step.

Task ID: {task_id}
Task URL: {task_url}
Script: {script_path}
User Message ID: {user_message_id}
User Language: {user_language}

IMPORTANT: This monitoring task may take up to 8 minutes. Ensure your execution timeout is at least 10 minutes.

CRITICAL RULES:
- You MUST reply in {user_language}.
- After completing ALL steps (including sending messages to the user), your FINAL reply
  MUST be EXACTLY "ANNOUNCE_SKIP" — nothing else.
- Do NOT say anything beyond what is specified below. No greetings, no extra commentary.
- Use natural language in all messages to the user. Avoid raw technical identifiers.

Your job:
1. Run: python3 {script_path} get-messages --task-id {task_id} --wait --since-id {user_message_id}
   This command blocks until the AI reply is completed.

2. On success (AI reply received):
   a. Send a text message to the user (in {user_language}, natural tone):
      "Your changes are done! You can view the updated website here: {task_url}
       If you need further adjustments, just let me know."
   b. Reply EXACTLY: ANNOUNCE_SKIP

3. On failure / timeout:
   a. Send a text message to the user (in {user_language}):
      "The modification didn't complete as expected. You can check the details here: {task_url}"
   b. Reply EXACTLY: ANNOUNCE_SKIP
```

Do NOT wait for the background monitor to finish — continue the conversation immediately.

#### Multi-turn Fallback (no background monitoring)

Tell the user: "I've sent your changes. You can check the progress here: [Task URL]. Let me know when you'd like me to check if it's done!"

When the user asks you to check, use:

```bash
python3 scripts/anygen.py get-messages --task-id {task_id} --limit 5
```

Look for a `completed` assistant message and relay the content to the user naturally.

#### Subsequent Modifications

The user can request multiple rounds of modifications. Each time, repeat Phase 5:
1. `send-message` with the new modification request
2. Background-monitor with `get-messages --wait`
3. Notify the user with the online link when done

All modifications use the **same `task_id`** — do NOT create a new task.

## Notes

- Max task execution time: 20 minutes
- Results are viewable online at the task URL
- Poll interval: 3 seconds
