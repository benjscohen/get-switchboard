# Test MCP Integration

Skill for end-to-end testing of MCP server integrations in the Switchboard platform.

## Trigger

Activate when the user says: "test integration", "test MCP tools", "e2e test", "test {provider} tools", "test {provider} integration", or similar.

## Prerequisites — Confirm Before Starting

1. **Integration name** — which integration to test (e.g. "Google Calendar", "Google Docs")
2. **MCP connection** — the Switchboard MCP server must be configured in Claude Code's MCP settings
3. **Test accounts** — at least one connected account; a second account for sharing tests is ideal
4. **Connected OAuth** — the user must have completed OAuth for the integration being tested

If any of these are missing, ask the user before proceeding.

---

## Testing Philosophy

1. **Safety first** — always prefix test artifacts with `[TEST]` so they're identifiable and cleanable
2. **Systematic coverage** — test every tool, not just the happy path
3. **LLM-as-user perspective** — you ARE the end user; evaluate whether tool descriptions, defaults, and responses make sense from an LLM's point of view
4. **Read before write** — start with read-only operations, then create, then modify, then clean up
5. **Verify round-trips** — after every write, read back the result to confirm it worked
6. **Document as you go** — note issues, UX gaps, and suggestions in real-time

---

## Step 1: Read-Only Exploration

Test all list/get tools first. These have no side effects and establish a baseline.

### Pattern
1. **List all** — call every `list_*` tool with defaults
2. **Get specific** — use IDs from list results to call `get_*` tools
3. **Get settings/metadata** — test any settings, colors, or configuration endpoints
4. **Search** — test `search_*` tools with known terms
5. **Check access** — test sharing/permissions list tools

### What to evaluate
- Does the response include enough context? (IDs, names, timestamps)
- Are defaults sensible? (e.g. `calendarId: "primary"`)
- Is the response clean or a raw API dump?
- Are `.describe()` texts on schema fields sufficient for an LLM to use the tool?

---

## Step 2: Create Operations

Test all creation tools using `[TEST]` prefixed data.

### Pattern
1. **Create with minimal params** — just required fields
2. **Read back** — immediately `get` the created resource to verify
3. **Create with full params** — exercise optional fields (description, color, location, etc.)
4. **Quick create** — test any natural-language creation tools (e.g. `quick_add`)

### What to evaluate
- Can an LLM figure out the required params from descriptions alone?
- Are date/time formats clear? (ISO 8601 vs. other)
- Do optional fields have clear descriptions with format examples?
- Does the response include the created resource's ID?

---

## Step 3: Modify Operations

Test update/patch tools on the test data you created.

### Pattern
1. **Patch** (partial update) — change one field at a time, verify
2. **Update** (full replace) — provide all fields, verify
3. **Compare patch vs update** — ensure patch doesn't clear unset fields
4. **Modify metadata** — colors, descriptions, settings

### What to evaluate
- Is patch vs update distinction clear from tool descriptions?
- Does update require re-specifying unchanged fields?
- Are responses consistent between create/patch/update?

---

## Step 4: Search & Discovery

Test search and filtering capabilities.

### Pattern
1. **Text search** — search for the `[TEST]` items you created
2. **Filtered search** — use time ranges, categories, or other filters
3. **Pagination** — if results are paginated, test `pageToken` / `nextPageToken`
4. **Edge cases** — empty search, special characters, very broad queries

### What to evaluate
- Do search tools use `q` parameter consistently?
- Are time range filters intuitive? (timeMin/timeMax vs. date range)
- Is pagination documented in the tool description?

---

## Step 5: Advanced Operations

Test sharing, batch, recurring, and other complex features.

### Sharing
1. Share with test account (reader role)
2. Verify sharing rule appears in list
3. Upgrade to writer
4. Remove sharing rule

### Batch Operations
1. Batch create multiple items
2. Batch create + delete in one call
3. Verify all operations completed

### Recurring / Templates
1. Create recurring items (e.g. weekly events)
2. List instances
3. Modify a single instance vs. the series

### RSVP / Responses
1. Create event with attendees
2. RSVP to accept/decline

### What to evaluate
- Are batch operation schemas intuitive?
- Is the sharing model (scope type + role) clear?
- Do recurring patterns use standard formats (RRULE)?

---

## Step 6: Error Paths

Test how tools handle invalid input.

### Pattern
1. **Invalid IDs** — pass a non-existent resource ID
2. **Missing required fields** — omit required params (should fail at schema level)
3. **Invalid enum values** — pass values outside the allowed set
4. **Permission errors** — try to modify a read-only resource
5. **Rate limiting** — note if rapid calls cause throttling

### What to evaluate
- Are error messages descriptive? (Not just "An internal error occurred")
- Do errors help the LLM diagnose and retry?
- Are schema validation errors clear?

---

## Step 7: Cleanup

Reverse all test data creation, in reverse order.

### Pattern
1. **Delete test events/items** — remove all `[TEST]` prefixed items
2. **Delete test resources** — remove test calendars, documents, etc.
3. **Remove sharing rules** — clean up any test shares
4. **Verify** — search for `[TEST]` to confirm nothing remains

### Rules
- Delete in reverse order of creation (dependent items first)
- Verify deletion with a follow-up list/search
- If deletion fails, note the error and move on (don't leave cleanup half-done)

---

## Step 8: Competitive Benchmarking

Compare the integration's tools against competitors.

### Pattern
1. **ProtonIQ** — check if ProtonIQ has equivalent tools (`mcp__protoniq__*`)
2. **Other MCP servers** — search for other public MCP servers for the same API
3. **Direct API** — compare against the provider's official API docs for coverage gaps

### What to evaluate
- Missing tools that competitors have
- Missing convenience params (e.g. ProtonIQ may accept natural language dates)
- Response format differences (clean vs. raw)
- Schema description quality comparison

---

## Step 9: Document Findings

Compile a structured findings table.

### Format

```
| # | Tool | Issue | Severity | Suggestion |
|---|------|-------|----------|------------|
| 1 | list_calendars | Returns raw API dump with etags/kind fields | Low | Clean response to essential fields |
| 2 | create_event | start/end are optional but event fails without them | Medium | Make start/end required or add smart defaults |
```

### Severity Levels
- **Critical** — tool is broken or returns wrong data
- **High** — tool works but is misleading or hard to use correctly
- **Medium** — UX improvement would significantly help LLM usage
- **Low** — cosmetic or minor improvement

### Categories to assess
1. **Correctness** — does the tool do what it claims?
2. **Schema quality** — are descriptions, defaults, and types right?
3. **Response quality** — clean structured data vs. raw API dump?
4. **LLM-friendliness** — can an LLM use this tool without extra context?
5. **Completeness** — any missing tools for common operations?

---

## Integration-Specific Test Flows

### Google Calendar
- List calendars → get primary → list today's events → get specific event
- Create event (timed) → patch title → move to secondary calendar → delete
- Quick add → verify parsed correctly
- Create recurring → list instances → modify single instance
- Share calendar → verify → upgrade role → unshare
- Batch create 2 + delete 1
- Find free/busy for tomorrow
- Get settings, get timezone, get colors
- RSVP to event with attendees
- Skip: watch/stop_watching (needs webhook), clear_calendar (destructive)

### Google Docs
- List/search docs → get document → read content
- Create document with initial text → read back
- Insert text → read → format text → read
- Manage tables: insert → format → read
- Manage headers/footers → manage sections
- Replace text → verify
- Delete content range → verify
- Skip: manage_images (needs image URL hosting)

### Google Gmail
- List messages → get message → get thread
- Search with Gmail syntax (from:, subject:, etc.)
- Manage drafts: create → get → send/delete
- Send message → verify in sent
- Reply to message → verify thread
- Manage labels: list → create → apply → remove
- Manage filters: list → create → delete
- Forward message
- Get/update vacation settings
- Batch modify: add/remove labels on multiple messages
- Get profile → get attachment

### Google Sheets
- List/search sheets → get info → get metadata
- Create spreadsheet → read back
- Write data → read range → verify
- Append rows → read → verify
- Format cells (bold, colors, borders) → read
- Conditional formatting → verify
- Manage tabs: add → rename → copy → delete
- Manage charts: create → read → delete
- Sort/filter → verify
- Validate data → check results
- Manage named ranges → verify
- Clear range → verify
- Modify structure (insert/delete rows/cols)

---

## Completion Checklist

Before declaring testing complete, verify every item:

### Coverage
- [ ] Every tool has been called at least once
- [ ] Read-only tools tested first (no side effects)
- [ ] Write operations used `[TEST]` prefix
- [ ] Round-trip verified: create → read back → confirmed match
- [ ] Error paths tested: invalid IDs, missing fields

### Quality Assessment
- [ ] Schema `.describe()` texts evaluated for LLM usability
- [ ] Response formats evaluated (clean vs. raw API dump)
- [ ] Defaults evaluated for sensibility
- [ ] Error messages evaluated for helpfulness
- [ ] Competitive benchmark completed (ProtonIQ + others)

### Cleanup
- [ ] All `[TEST]` artifacts deleted
- [ ] Verification search confirms no test data remains
- [ ] No sharing rules left from testing

### Documentation
- [ ] Findings table completed with severity ratings
- [ ] Suggestions prioritized by impact
- [ ] Any bugs filed or code fixes identified

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Forgetting to clean up test data | Always use `[TEST]` prefix; search for it at the end |
| Testing only happy paths | Explicitly test invalid inputs, missing fields, permission errors |
| Not verifying round-trips | Every create/update should be followed by a read-back |
| Skipping competitive benchmark | Compare against ProtonIQ and other MCP servers — reveals UX gaps |
| Raw API dumps seem "fine" | LLMs waste tokens parsing unnecessary fields — advocate for clean responses |
| Not testing from LLM perspective | Ask: "Could I use this tool with ONLY the schema description?" |
| Leaving sharing rules active | Always clean up sharing — test accounts may have access to real data |
| Testing destructive tools on real data | Only use `[TEST]` prefixed resources; never clear/delete real user data |
