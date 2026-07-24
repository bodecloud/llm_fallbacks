// node_modules/murm-ui/dist/utils/uuid.js
function uuidv7() {
  const timeHex = Date.now().toString(16).padStart(12, "0");
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const g3 = (112 | bytes[0] & 15).toString(16).padStart(2, "0") + bytes[1].toString(16).padStart(2, "0");
  const g4 = (128 | bytes[2] & 63).toString(16).padStart(2, "0") + bytes[3].toString(16).padStart(2, "0");
  let g5 = "";
  for (let i = 4; i < 10; i++) {
    g5 += bytes[i].toString(16).padStart(2, "0");
  }
  return `${timeHex.substring(0, 8)}-${timeHex.substring(8)}-${g3}-${g4}-${g5}`;
}

// node_modules/murm-ui/dist/core/msg-utils.js
function extractPlainText(msg) {
  return msg.blocks.filter((b2) => b2.type === "text").map((b2) => b2.text).join("\n\n");
}
function dropEphemeralMessages(messages) {
  return messages.filter((m2) => !m2.ephemeral);
}
function cloneMessages(messages) {
  return messages.map((message) => {
    const cloned = {
      ...message,
      blocks: message.blocks.map((block) => ({ ...block }))
    };
    if (message.usage) {
      cloned.usage = {
        ...message.usage,
        ...message.usage.details !== void 0 ? { details: cloneJsonValue(message.usage.details) } : {}
      };
    }
    if (message.meta) {
      cloned.meta = cloneJsonValue(message.meta);
    }
    return cloned;
  });
}
function cloneJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }
  if (value && typeof value === "object") {
    const cloned = {};
    for (const [key, item] of Object.entries(value)) {
      cloned[key] = cloneJsonValue(item);
    }
    return cloned;
  }
  return value;
}

// node_modules/murm-ui/dist/core/types.js
var MAX_PINNED_SESSIONS = 3;

// node_modules/murm-ui/dist/core/session-manager.js
var OLDER_MESSAGES_PAGE_SIZE = 100;
var SessionManager = class {
  constructor(config) {
    this.activeSessionMeta = null;
    this.sessionWriteQueues = /* @__PURE__ */ new Map();
    this.deletedSessionIds = /* @__PURE__ */ new Set();
    this.isFetchingSessions = false;
    this.isFetchingOlder = false;
    this.olderCursor = null;
    this.sessionPageCursor = null;
    this.switchSeq = 0;
    this.store = config.store;
    this.storage = config.storage;
    this.isGenerationActive = config.isGenerationActive;
    this.stopActiveGeneration = config.stopActiveGeneration;
  }
  isDeleted(sessionId) {
    return this.deletedSessionIds.has(sessionId);
  }
  async loadInitial(id) {
    await this.loadSession(id, "Chat not found. Started a new one.");
  }
  async loadHistory() {
    await this.fetchSessionsPage(false);
  }
  // Call this when the user scrolls to the bottom of the sidebar
  async loadMore() {
    await this.fetchSessionsPage(true);
  }
  // Call this when the user scrolls to the top of the transcript.
  async loadOlderMessages() {
    var _a;
    if (!this.storage.loadOlderMessages)
      return;
    if (this.isFetchingOlder || !this.state.hasMoreMessages || !this.olderCursor)
      return;
    const sessionId = this.state.currentSessionId;
    const cursor = this.olderCursor;
    this.isFetchingOlder = true;
    const seq = this.switchSeq;
    this.store.set({ isLoadingMessages: true });
    try {
      const page = await this.storage.loadOlderMessages(sessionId, cursor, OLDER_MESSAGES_PAGE_SIZE);
      if (seq !== this.switchSeq || this.state.currentSessionId !== sessionId)
        return;
      const current = this.state.messages;
      const existing = new Set(current.map((m2) => m2.id));
      const older = page.messages.filter((m2) => !existing.has(m2.id));
      this.olderCursor = (_a = page.nextOlderMessagesCursor) !== null && _a !== void 0 ? _a : null;
      this.store.set({
        messages: [...older, ...current],
        hasMoreMessages: page.hasMore && this.olderCursor !== null,
        isLoadingMessages: false
      });
    } catch (error) {
      console.error("Failed to load older messages", error);
      if (seq === this.switchSeq && this.state.currentSessionId === sessionId) {
        this.store.set({ isLoadingMessages: false });
      }
    } finally {
      this.isFetchingOlder = false;
    }
  }
  async create() {
    if (this.isGenerationActive()) {
      await this.stopActiveGeneration();
    }
    this.startNewSession();
  }
  async switch(id) {
    await this.loadSession(id, "Failed to load chat. Started a new one.");
  }
  async delete(id) {
    var _a;
    const isCurrent = this.state.currentSessionId === id;
    this.deletedSessionIds.add(id);
    this.activeSessionMeta = ((_a = this.activeSessionMeta) === null || _a === void 0 ? void 0 : _a.id) === id ? null : this.activeSessionMeta;
    this.store.set({
      sessions: this.state.sessions.filter((s) => s.id !== id)
    });
    try {
      if (isCurrent && this.isGenerationActive()) {
        await this.stopActiveGeneration();
      }
      if (isCurrent && this.state.currentSessionId === id) {
        this.startNewSession();
      }
      await this.enqueueSessionWrite(id, async () => {
        await this.storage.delete(id);
      });
    } catch (error) {
      console.error(`Failed to delete session "${id}"`, error);
    }
  }
  async persistSessionSnapshot(sessionId, messages) {
    if (this.deletedSessionIds.has(sessionId))
      return false;
    const messagesToSave = dropEphemeralMessages(messages);
    try {
      return await this.enqueueSessionWrite(sessionId, async () => {
        var _a, _b, _c;
        if (this.deletedSessionIds.has(sessionId))
          return false;
        const existingMeta = this.state.sessions.find((s) => s.id === sessionId);
        const title = (_a = existingMeta === null || existingMeta === void 0 ? void 0 : existingMeta.title) !== null && _a !== void 0 ? _a : this.createFallbackTitle(messagesToSave);
        const isPinned = (_b = existingMeta === null || existingMeta === void 0 ? void 0 : existingMeta.isPinned) !== null && _b !== void 0 ? _b : ((_c = this.activeSessionMeta) === null || _c === void 0 ? void 0 : _c.id) === sessionId ? this.activeSessionMeta.isPinned : void 0;
        const sessionToSave = {
          id: sessionId,
          title,
          updatedAt: Date.now(),
          ...typeof isPinned === "boolean" ? { isPinned } : {},
          messages: messagesToSave
        };
        await this.storage.save(sessionToSave);
        if (this.deletedSessionIds.has(sessionId))
          return false;
        const sessionMeta = this.toSessionMeta(sessionToSave);
        if (this.state.currentSessionId === sessionId) {
          this.activeSessionMeta = sessionMeta;
        }
        this.store.set({
          sessions: this.sortSessionMetas([sessionMeta, ...this.state.sessions.filter((s) => s.id !== sessionId)])
        });
        return true;
      });
    } catch (error) {
      console.error(`Failed to persist session "${sessionId}"`, error);
      return false;
    }
  }
  async updateTitle(sessionId, title) {
    var _a, _b, _c;
    if (this.deletedSessionIds.has(sessionId))
      return;
    const nextTitle = title.trim();
    if (!nextTitle)
      return;
    const existingTitle = (_b = (_a = this.state.sessions.find((s) => s.id === sessionId)) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : ((_c = this.activeSessionMeta) === null || _c === void 0 ? void 0 : _c.id) === sessionId ? this.activeSessionMeta.title : void 0;
    if (existingTitle === nextTitle)
      return;
    await this.enqueueSessionWrite(sessionId, async () => {
      var _a2;
      if (this.deletedSessionIds.has(sessionId))
        return;
      if (this.storage.updateMetadata) {
        await this.storage.updateMetadata(sessionId, { title: nextTitle });
      }
      if (this.deletedSessionIds.has(sessionId))
        return;
      if (!this.state.sessions.find((s) => s.id === sessionId))
        return;
      this.store.set({
        sessions: this.sortSessionMetas(this.state.sessions.map((s) => s.id === sessionId ? { ...s, title: nextTitle } : s))
      });
      if (this.state.currentSessionId === sessionId && ((_a2 = this.activeSessionMeta) === null || _a2 === void 0 ? void 0 : _a2.id) === sessionId) {
        this.activeSessionMeta = { ...this.activeSessionMeta, title: nextTitle };
      }
    });
  }
  async updatePinned(sessionId, isPinned) {
    var _a, _b;
    if (this.deletedSessionIds.has(sessionId))
      return;
    const current = (_a = this.state.sessions.find((s) => s.id === sessionId)) !== null && _a !== void 0 ? _a : ((_b = this.activeSessionMeta) === null || _b === void 0 ? void 0 : _b.id) === sessionId ? this.activeSessionMeta : null;
    if (!current)
      return;
    if (Boolean(current.isPinned) === isPinned)
      return;
    if (isPinned && this.countPinnedSessions(sessionId) >= MAX_PINNED_SESSIONS)
      return;
    await this.enqueueSessionWrite(sessionId, async () => {
      var _a2;
      if (this.deletedSessionIds.has(sessionId))
        return;
      if (this.storage.updateMetadata) {
        await this.storage.updateMetadata(sessionId, { isPinned });
      }
      if (this.deletedSessionIds.has(sessionId))
        return;
      if (!this.state.sessions.find((s) => s.id === sessionId))
        return;
      this.store.set({
        sessions: this.sortSessionMetas(this.state.sessions.map((s) => s.id === sessionId ? { ...s, isPinned } : s))
      });
      if (this.state.currentSessionId === sessionId && ((_a2 = this.activeSessionMeta) === null || _a2 === void 0 ? void 0 : _a2.id) === sessionId) {
        this.activeSessionMeta = { ...this.activeSessionMeta, isPinned };
      }
    });
  }
  async close() {
    if (this.storage.close) {
      await this.storage.close();
    }
  }
  get state() {
    return this.store.get();
  }
  async fetchSessionsPage(append) {
    var _a;
    if (this.isFetchingSessions || append && !this.state.hasMoreSessions)
      return;
    this.isFetchingSessions = true;
    this.store.set({ isLoadingSessions: true });
    try {
      const cursor = append ? (_a = this.sessionPageCursor) !== null && _a !== void 0 ? _a : void 0 : void 0;
      const result = await this.storage.loadSessions(20, cursor);
      if (!append)
        this.sessionPageCursor = null;
      if (result.items.length > 0) {
        this.sessionPageCursor = result.items[result.items.length - 1];
      }
      const resultItems = this.withoutDeletedSessions(result.items);
      const nextSessions = append ? [...this.state.sessions, ...resultItems] : resultItems;
      this.store.set({
        sessions: this.withActiveSessionMeta(nextSessions),
        hasMoreSessions: result.items.length > 0 ? result.hasMore : false,
        isLoadingSessions: false
      });
    } catch (error) {
      console.error("Failed to load sessions", error);
      this.store.set(this.state.error ? { isLoadingSessions: false } : { isLoadingSessions: false, error: { message: "Failed to load chat history." } });
    } finally {
      this.isFetchingSessions = false;
    }
  }
  async loadSession(id, failureMessage) {
    var _a;
    if (this.state.currentSessionId === id && !this.state.isLoadingSession)
      return;
    if (this.isGenerationActive()) {
      await this.stopActiveGeneration();
    }
    const seq = ++this.switchSeq;
    this.activeSessionMeta = null;
    this.olderCursor = null;
    this.store.set({
      currentSessionId: id,
      messages: [],
      isLoadingSession: true,
      hasMoreMessages: false,
      isLoadingMessages: false,
      error: null
    });
    try {
      const session = await this.storage.loadOne(id);
      if (seq !== this.switchSeq)
        return;
      if (this.state.currentSessionId !== id)
        return;
      if (this.deletedSessionIds.has(id))
        throw new Error("Chat not found");
      if (!session)
        throw new Error("Chat not found");
      this.activeSessionMeta = this.toSessionMeta(session);
      this.olderCursor = (_a = session.nextOlderMessagesCursor) !== null && _a !== void 0 ? _a : null;
      this.store.set({
        sessions: this.withActiveSessionMeta(this.state.sessions),
        messages: session.messages,
        isLoadingSession: false,
        hasMoreMessages: Boolean(session.hasMoreMessages && this.olderCursor !== null)
      });
    } catch (error) {
      console.error(`Failed to load session "${id}"`, error);
      if (seq !== this.switchSeq)
        return;
      if (this.state.currentSessionId !== id)
        return;
      this.activeSessionMeta = null;
      this.olderCursor = null;
      this.store.set({
        messages: [],
        currentSessionId: uuidv7(),
        isLoadingSession: false,
        hasMoreMessages: false,
        isLoadingMessages: false,
        error: { message: failureMessage }
      });
    }
  }
  startNewSession() {
    this.activeSessionMeta = null;
    this.olderCursor = null;
    this.store.set({
      currentSessionId: uuidv7(),
      messages: [],
      isLoadingSession: false,
      hasMoreMessages: false,
      isLoadingMessages: false,
      error: null
    });
  }
  toSessionMeta(session) {
    return {
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
      ...typeof session.isPinned === "boolean" ? { isPinned: session.isPinned } : {}
    };
  }
  withActiveSessionMeta(sessions) {
    sessions = this.withoutDeletedSessions(sessions);
    const seen = /* @__PURE__ */ new Set();
    const deduped = sessions.filter((s) => {
      if (seen.has(s.id))
        return false;
      seen.add(s.id);
      return true;
    });
    if (!this.activeSessionMeta || this.deletedSessionIds.has(this.activeSessionMeta.id)) {
      return this.sortSessionMetas(deduped);
    }
    if (deduped.some((session) => {
      var _a;
      return session.id === ((_a = this.activeSessionMeta) === null || _a === void 0 ? void 0 : _a.id);
    })) {
      return this.sortSessionMetas(deduped);
    }
    return this.sortSessionMetas([this.activeSessionMeta, ...deduped]);
  }
  sortSessionMetas(sessions) {
    return [...sessions].sort((a, b2) => {
      const pinnedDelta = Number(Boolean(b2.isPinned)) - Number(Boolean(a.isPinned));
      if (pinnedDelta !== 0)
        return pinnedDelta;
      return b2.updatedAt - a.updatedAt || b2.id.localeCompare(a.id);
    });
  }
  countPinnedSessions(exceptSessionId) {
    return this.state.sessions.filter((session) => session.id !== exceptSessionId && session.isPinned).length;
  }
  createFallbackTitle(messages) {
    const firstMsg = messages[0];
    if (!firstMsg)
      return "Empty Chat";
    const text = extractPlainText(firstMsg);
    if (text.trim().length > 0) {
      return text.length > 30 ? `${text.slice(0, 30)}...` : text;
    }
    const fileBlock = firstMsg.blocks.find((b2) => b2.type === "file");
    if (fileBlock)
      return `File: ${fileBlock.name || "Upload"}`;
    return "New Chat";
  }
  enqueueSessionWrite(sessionId, operation) {
    var _a;
    const previous = (_a = this.sessionWriteQueues.get(sessionId)) !== null && _a !== void 0 ? _a : Promise.resolve();
    const queued = previous.catch(() => void 0).then(operation);
    const tracked = queued.then(() => void 0, () => void 0);
    this.sessionWriteQueues.set(sessionId, tracked);
    void tracked.finally(() => {
      if (this.sessionWriteQueues.get(sessionId) === tracked) {
        this.sessionWriteQueues.delete(sessionId);
      }
    });
    return queued;
  }
  withoutDeletedSessions(sessions) {
    if (this.deletedSessionIds.size === 0)
      return sessions;
    return sessions.filter((session) => !this.deletedSessionIds.has(session.id));
  }
};

// node_modules/murm-ui/dist/core/store.js
var Store = class {
  constructor(initialState) {
    this.selectorListeners = /* @__PURE__ */ new Set();
    this.hotListeners = /* @__PURE__ */ new Set();
    this.state = initialState;
  }
  get() {
    return this.state;
  }
  /**
   * Standard immutable update.
   * Use this for 99% of state changes (sessions, active chat, etc).
   * Safely triggers all relevant selector-based subscribers.
   */
  set(partialState) {
    this.state = { ...this.state, ...partialState };
    this.notifySelectorListeners();
    this.notifyHotListeners();
  }
  /**
   * HIGH-PERFORMANCE HOT PATH ONLY.
   * Mutates state in-place to prevent GC thrashing during LLM streaming.
   * NOTE: This intentionally bypasses selector subscribers so hot updates
   * do not run every selector on every token. Only hot subscribers are notified.
   * Hot subscribers receive the live mutable state object; they must not retain
   * references to state or nested slices across notifications.
   */
  mutateHot(recipe) {
    recipe(this.state);
    this.notifyHotListeners();
  }
  /**
   * Subscribes to a specific slice of state.
   * The listener fires IMMEDIATELY with the current state, and then
   * whenever the selected value actually changes.
   */
  subscribe(selector, listener) {
    const initialSlice = selector(this.state);
    listener(initialSlice);
    return this.onChangeFrom(selector, listener, initialSlice);
  }
  /**
   * Subscribes to normal set() updates and hot in-place mutations.
   * Fires IMMEDIATELY with the current state, then on subsequent updates.
   * Use sparingly for render paths that must observe high-frequency mutable state.
   * The listener receives the live mutable state object; do not retain references
   * to state or nested slices because mutateHot may change them in-place.
   */
  subscribeHot(listener) {
    listener(this.state);
    this.hotListeners.add(listener);
    return () => this.hotListeners.delete(listener);
  }
  /**
   * Subscribes to a specific slice of state.
   * The listener ONLY fires on future changes, not immediately.
   */
  onChange(selector, listener) {
    return this.onChangeFrom(selector, listener, selector(this.state));
  }
  onChangeFrom(selector, listener, initialSlice) {
    let lastSlice = initialSlice;
    const wrappedListener = (state) => {
      const currentSlice = selector(state);
      if (currentSlice !== lastSlice) {
        lastSlice = currentSlice;
        listener(currentSlice);
      }
    };
    this.selectorListeners.add(wrappedListener);
    return () => this.selectorListeners.delete(wrappedListener);
  }
  clearAllListeners() {
    this.selectorListeners.clear();
    this.hotListeners.clear();
  }
  notifySelectorListeners() {
    for (const listener of this.selectorListeners) {
      listener(this.state);
    }
  }
  notifyHotListeners() {
    for (const listener of this.hotListeners) {
      listener(this.state);
    }
  }
};

// node_modules/murm-ui/dist/core/stream-reducer.js
function clearEphemeralFlag(msg) {
  if (!msg.ephemeral)
    return;
  delete msg.ephemeral;
}
function touchMessage(msg, timestamp = Date.now()) {
  var _a;
  (_a = msg.createdAt) !== null && _a !== void 0 ? _a : msg.createdAt = timestamp;
  msg.updatedAt = timestamp;
}
function updateStreamingToolCalls(msg, status) {
  for (const block of msg.blocks) {
    if (block.type === "tool_call" && block.status === "streaming") {
      block.status = status;
    }
  }
}
function findMessage(state, messageId) {
  if (!messageId)
    return void 0;
  const lastMessage = state.messages[state.messages.length - 1];
  if ((lastMessage === null || lastMessage === void 0 ? void 0 : lastMessage.id) === messageId)
    return lastMessage;
  return state.messages.find((m2) => m2.id === messageId);
}
function adoptMessageId(state, msg, nextId) {
  const previousId = msg.id;
  msg.id = nextId;
  if (state.generatingMessageId === previousId) {
    state.generatingMessageId = nextId;
  }
}
function canAdoptMessageId(state, msg, nextId) {
  if (!msg.ephemeral)
    return false;
  if (msg.blocks.length > 0)
    return false;
  return findMessage(state, nextId) === void 0;
}
function pushStreamMessage(state, message, fallbackRunId) {
  var _a, _b, _c;
  const timestamp = Date.now();
  const createdAt = (_a = message.createdAt) !== null && _a !== void 0 ? _a : timestamp;
  const msg = {
    id: message.id,
    role: message.role,
    blocks: [],
    runId: (_b = message.runId) !== null && _b !== void 0 ? _b : fallbackRunId,
    createdAt,
    updatedAt: (_c = message.updatedAt) !== null && _c !== void 0 ? _c : createdAt,
    ...message.role === "assistant" && message.blocks.length === 0 ? { ephemeral: true } : {}
  };
  state.messages.push(msg);
  if (msg.role === "assistant") {
    state.generatingMessageId = msg.id;
  }
  return msg;
}
function eventMessageId(event) {
  switch (event.type) {
    case "message_start":
      return event.message.id;
    case "usage":
    case "finish":
    case "error":
      return null;
    default:
      return event.messageId;
  }
}
function applyStreamEventToState(state, currentMessageId, event) {
  var _a, _b, _c, _d, _e2, _f, _g;
  let msg = (_a = findMessage(state, currentMessageId)) !== null && _a !== void 0 ? _a : findMessage(state, state.generatingMessageId);
  if (!msg)
    return currentMessageId;
  const nextMessageId = eventMessageId(event);
  if (nextMessageId && msg.id !== nextMessageId) {
    if (canAdoptMessageId(state, msg, nextMessageId)) {
      adoptMessageId(state, msg, nextMessageId);
    } else if (!findMessage(state, nextMessageId)) {
      updateStreamingToolCalls(msg, "complete");
      touchMessage(msg);
      msg = event.type === "message_start" ? pushStreamMessage(state, event.message, msg.runId) : pushStreamMessage(state, { id: nextMessageId, role: "assistant", blocks: [] }, msg.runId);
    } else if (event.type === "message_start") {
      return msg.id;
    }
  }
  switch (event.type) {
    case "message_start": {
      msg.runId = (_b = event.message.runId) !== null && _b !== void 0 ? _b : msg.runId;
      (_c = msg.createdAt) !== null && _c !== void 0 ? _c : msg.createdAt = (_d = event.message.createdAt) !== null && _d !== void 0 ? _d : Date.now();
      if (event.message.updatedAt !== void 0) {
        msg.updatedAt = event.message.updatedAt;
      }
      msg.role = event.message.role;
      if (event.message.blocks.length > 0 || msg.blocks.length === 0) {
        msg.blocks = event.message.blocks;
      }
      if (event.message.meta) {
        msg.meta = { ...msg.meta, ...event.message.meta };
      }
      if (event.message.blocks.length > 0) {
        clearEphemeralFlag(msg);
      } else if (msg.role === "assistant" && msg.blocks.length === 0) {
        msg.ephemeral = true;
      }
      if (msg.role === "assistant") {
        state.generatingMessageId = msg.id;
      }
      touchMessage(msg, (_e2 = event.message.updatedAt) !== null && _e2 !== void 0 ? _e2 : Date.now());
      break;
    }
    case "text_delta": {
      let tb = msg.blocks.find((b2) => b2.id === event.blockId);
      if (!tb) {
        tb = { id: event.blockId, type: "text", text: "" };
        msg.blocks.push(tb);
      }
      tb.text += event.delta;
      if (event.delta.length > 0) {
        clearEphemeralFlag(msg);
        touchMessage(msg);
      }
      break;
    }
    case "reasoning_delta": {
      let rb = msg.blocks.find((b2) => b2.id === event.blockId);
      if (!rb) {
        rb = { id: event.blockId, type: "reasoning", text: "", encrypted: event.encrypted };
        msg.blocks.push(rb);
      }
      if (event.encrypted) {
        rb.encrypted = true;
        if (event.delta) {
          rb.encryptedText = ((_f = rb.encryptedText) !== null && _f !== void 0 ? _f : "") + event.delta;
        }
      } else {
        rb.text += event.delta;
      }
      if (event.delta.length > 0) {
        clearEphemeralFlag(msg);
        touchMessage(msg);
      }
      break;
    }
    case "tool_call_start":
      msg.blocks.push(event.block);
      clearEphemeralFlag(msg);
      touchMessage(msg);
      break;
    case "tool_call_delta": {
      const tcb = msg.blocks.find((b2) => b2.id === event.blockId);
      if (tcb) {
        if (event.name !== void 0)
          tcb.name = event.name;
        if (event.argsDelta)
          tcb.argsText += event.argsDelta;
        if (event.status)
          tcb.status = event.status;
        if (event.name !== void 0 || event.argsDelta || event.status) {
          clearEphemeralFlag(msg);
          touchMessage(msg);
        }
      }
      break;
    }
    case "tool_result":
    case "artifact":
      msg.blocks.push(event.block);
      clearEphemeralFlag(msg);
      touchMessage(msg);
      break;
    case "usage":
      msg.usage = {
        input: event.input,
        output: event.output,
        total: (_g = event.total) !== null && _g !== void 0 ? _g : event.input + event.output,
        ...event.cacheRead !== void 0 ? { cacheRead: event.cacheRead } : {},
        ...event.cacheWrite !== void 0 ? { cacheWrite: event.cacheWrite } : {},
        ...event.details !== void 0 ? { details: event.details } : {}
      };
      touchMessage(msg);
      break;
    case "finish": {
      const finalStatus = event.reason === "error" || event.reason === "aborted" ? "error" : "complete";
      updateStreamingToolCalls(msg, finalStatus);
      touchMessage(msg);
      break;
    }
    case "error":
      state.error = { message: event.message, id: msg.id };
      updateStreamingToolCalls(msg, "error");
      touchMessage(msg);
      break;
  }
  return msg.id;
}

// node_modules/murm-ui/dist/core/chat-engine.js
var ChatEngine = class {
  constructor(config) {
    var _a;
    this.plugins = [];
    this.requestDefaults = { options: {} };
    this.titleOptions = {};
    this.activeGeneration = null;
    this.autoTitleControllers = /* @__PURE__ */ new Set();
    this.isDestroyed = false;
    this.provider = config.provider;
    this.titleOptions = this.mergeDefinedOptions({}, (_a = config.titleOptions) !== null && _a !== void 0 ? _a : {});
    this.titleInstructions = config.titleInstructions;
    const startingId = config.initialSessionId || uuidv7();
    this.store = new Store({
      sessions: [],
      hasMoreSessions: false,
      currentSessionId: startingId,
      messages: [],
      generatingMessageId: null,
      isLoadingSession: !!config.initialSessionId,
      isLoadingSessions: false,
      hasMoreMessages: false,
      isLoadingMessages: false,
      error: null
    });
    this.sessionManager = new SessionManager({
      store: this.store,
      storage: config.storage,
      isGenerationActive: () => this.isBusy,
      stopActiveGeneration: () => this.stopGeneration()
    });
    this.sessions = this.sessionManager;
    if (config.initialSessionId) {
      void this.sessionManager.loadInitial(startingId);
    }
  }
  registerPlugins(plugins) {
    this.plugins = plugins;
  }
  get state() {
    return this.store.get();
  }
  subscribe(selector, listener) {
    return this.store.subscribe(selector, listener);
  }
  subscribeHot(listener) {
    return this.store.subscribeHot(listener);
  }
  onChange(selector, listener) {
    return this.store.onChange(selector, listener);
  }
  get isBusy() {
    return this.activeGeneration !== null;
  }
  async setProvider(newProvider) {
    if (this.isBusy)
      await this.stopGeneration();
    this.provider = newProvider;
  }
  clearError() {
    this.store.set({ error: null });
  }
  sendMessage(content) {
    var _a;
    if (this.isBusy || this.state.isLoadingSession)
      return false;
    const currentMessages = dropEphemeralMessages(this.state.messages);
    const now = Date.now();
    const userMessageId = uuidv7();
    const userMsg = {
      id: userMessageId,
      role: "user",
      blocks: content ? [{ id: uuidv7(), type: "text", text: content }] : [],
      runId: userMessageId,
      createdAt: now,
      updatedAt: now
    };
    for (const plugin of this.plugins) {
      try {
        (_a = plugin.onUserSubmit) === null || _a === void 0 ? void 0 : _a.call(plugin, userMsg);
      } catch (error) {
        console.error(`Plugin "${plugin.name}" failed during onUserSubmit`, error);
      }
    }
    if (userMsg.blocks.length === 0)
      return false;
    void this.startGeneration([...currentMessages, userMsg]);
    return true;
  }
  editAndResubmit(messageId, newContent) {
    var _a, _b;
    if (this.isBusy)
      return false;
    const currentMessages = dropEphemeralMessages(this.state.messages);
    const targetIndex = currentMessages.findIndex((m2) => m2.id === messageId);
    if (targetIndex === -1)
      return false;
    if (currentMessages[targetIndex].role !== "user")
      return false;
    const updatedMessages = currentMessages.slice(0, targetIndex + 1);
    const preservedBlocks = updatedMessages[targetIndex].blocks.filter((b2) => b2.type !== "text");
    const newTextBlock = newContent ? [{ id: uuidv7(), type: "text", text: newContent }] : [];
    const finalBlocks = [...preservedBlocks, ...newTextBlock];
    const now = Date.now();
    if (finalBlocks.length === 0)
      return false;
    updatedMessages[targetIndex] = {
      ...updatedMessages[targetIndex],
      blocks: finalBlocks,
      runId: (_a = updatedMessages[targetIndex].runId) !== null && _a !== void 0 ? _a : updatedMessages[targetIndex].id,
      createdAt: (_b = updatedMessages[targetIndex].createdAt) !== null && _b !== void 0 ? _b : now,
      updatedAt: now
    };
    void this.startGeneration(updatedMessages);
    return true;
  }
  /**
   * Completely replaces the current session's message history and attempts to save it to storage.
   * Useful for clearing history, compacting context, or modifying past messages.
   */
  async setMessages(messages) {
    if (this.isBusy) {
      console.warn("Cannot modify history while the AI is generating a response.");
      return false;
    }
    this.store.set({ messages });
    return await this.persistCurrentSession();
  }
  /**
   * Sets global default request parameters for outgoing chat requests.
   * `instructions` and `tools` are request-level model inputs; `options` are provider options.
   */
  setRequestDefaults(defaults) {
    var _a, _b;
    this.requestDefaults = {
      ...this.requestDefaults,
      ...defaults,
      options: this.mergeDefinedOptions((_a = this.requestDefaults.options) !== null && _a !== void 0 ? _a : {}, (_b = defaults.options) !== null && _b !== void 0 ? _b : {})
    };
  }
  setTitleOptions(options) {
    this.titleOptions = this.mergeDefinedOptions(this.titleOptions, options);
  }
  setTitleInstructions(instructions) {
    this.titleInstructions = instructions;
  }
  async stopGeneration() {
    if (!this.isBusy)
      return;
    const generation = this.activeGeneration;
    if (!generation)
      return;
    generation.controller.abort();
    this.applyStreamEvent(generation.id, { type: "finish", reason: "aborted" });
    await this.finalizeGeneration(generation.id, true);
  }
  async destroy() {
    this.isDestroyed = true;
    this.abortAutoTitles();
    await this.stopGeneration();
    await this.sessionManager.close();
    this.store.clearAllListeners();
  }
  async startGeneration(contextMessages) {
    var _a;
    const generationId = uuidv7();
    const initialMessageId = generationId;
    const sessionId = this.state.currentSessionId;
    const provider = this.provider;
    const controller = new AbortController();
    const signal = controller.signal;
    this.activeGeneration = {
      id: generationId,
      sessionId,
      currentMessageId: initialMessageId,
      controller,
      provider,
      requestDefaults: this.cloneRequestDefaults()
    };
    const now = Date.now();
    const runId = (_a = findLastUserRunId(contextMessages)) !== null && _a !== void 0 ? _a : initialMessageId;
    const assistantMsg = {
      id: initialMessageId,
      role: "assistant",
      blocks: [],
      runId,
      createdAt: now,
      updatedAt: now,
      ephemeral: true
    };
    const updatedMessages = [...contextMessages, assistantMsg];
    this.store.set({
      messages: updatedMessages,
      generatingMessageId: initialMessageId,
      error: null
    });
    let wasAborted = false;
    try {
      const payloadParams = await this.prepareRequestParams(contextMessages, signal);
      if (signal.aborted) {
        wasAborted = true;
        return;
      }
      await provider.streamChat(payloadParams, (event) => {
        if (signal.aborted)
          return;
        if (event.type === "finish" && event.reason === "aborted") {
          wasAborted = true;
        }
        this.applyStreamEvent(generationId, event);
      });
    } catch (err) {
      if (signal.aborted) {
        wasAborted = true;
        return;
      }
      const errorMessage = err instanceof Error ? err.message : typeof err === "object" && err !== null ? JSON.stringify(err) : String(err);
      this.applyStreamEvent(generationId, { type: "error", message: errorMessage });
    } finally {
      await this.finalizeGeneration(generationId, wasAborted || signal.aborted);
    }
  }
  /**
   * Applies reducer events without cloning active stream blocks.
   * @param generationId The ID we generated locally to track the active generation.
   */
  applyStreamEvent(generationId, event) {
    const generation = this.activeGeneration;
    if ((generation === null || generation === void 0 ? void 0 : generation.id) !== generationId)
      return;
    let currentMessageId = generation.currentMessageId;
    this.store.mutateHot((state) => {
      currentMessageId = applyStreamEventToState(state, generation.currentMessageId, event);
    });
    generation.currentMessageId = currentMessageId;
  }
  async prepareRequestParams(messages, signal, requestDefaults = this.requestDefaults) {
    const payloadParams = {
      messages: [...messages],
      instructions: requestDefaults.instructions,
      tools: requestDefaults.tools ? [...requestDefaults.tools] : void 0,
      options: { ...requestDefaults.options },
      signal
    };
    for (const plugin of this.plugins) {
      if (signal.aborted)
        return payloadParams;
      if (plugin.beforeSubmit) {
        const request = {
          messages: [...payloadParams.messages],
          instructions: payloadParams.instructions,
          tools: payloadParams.tools ? [...payloadParams.tools] : void 0,
          options: { ...payloadParams.options },
          signal
        };
        const patch = await plugin.beforeSubmit(request);
        if (signal.aborted)
          return payloadParams;
        if (patch) {
          if (patch.messages)
            payloadParams.messages = patch.messages;
          if (hasPatchField(patch, "instructions")) {
            payloadParams.instructions = patch.instructions;
          }
          if (hasPatchField(patch, "tools")) {
            payloadParams.tools = patch.tools ? [...patch.tools] : void 0;
          }
          if (patch.options) {
            payloadParams.options = this.mergeDefinedOptions(payloadParams.options, patch.options);
          }
        }
      }
    }
    payloadParams.messages = dropEphemeralMessages(payloadParams.messages);
    return payloadParams;
  }
  async finalizeGeneration(generationId, wasAborted = false) {
    const generation = this.activeGeneration;
    if ((generation === null || generation === void 0 ? void 0 : generation.id) !== generationId)
      return;
    this.activeGeneration = null;
    if (wasAborted) {
      this.removeAbortedEphemeralMessage(generation.currentMessageId);
    }
    if (this.state.generatingMessageId !== null) {
      this.store.set({ generatingMessageId: null });
    }
    try {
      const finalMessages = cloneMessages(this.state.messages);
      const persistentMessages = dropEphemeralMessages(finalMessages);
      const hasError = this.state.error !== null;
      const saved = await this.sessionManager.persistSessionSnapshot(generation.sessionId, finalMessages);
      if (!saved)
        return;
      if (!hasError && !wasAborted && generation.provider.generateTitle) {
        const assistantRepliesCount = persistentMessages.filter((m2) => m2.role === "assistant" && m2.blocks.length > 0).length;
        if (assistantRepliesCount === 1) {
          void this.triggerAutoTitle(generation.sessionId, persistentMessages, generation.provider, generation.requestDefaults);
        }
      }
    } catch (error) {
      console.error("Failed to finalize stream", error);
    }
  }
  removeAbortedEphemeralMessage(pendingId) {
    const pendingMessage = this.state.messages.find((m2) => m2.id === pendingId);
    if (!(pendingMessage === null || pendingMessage === void 0 ? void 0 : pendingMessage.ephemeral))
      return;
    this.store.set({
      messages: this.state.messages.filter((m2) => m2.id !== pendingId)
    });
  }
  async persistCurrentSession() {
    const { currentSessionId, messages } = this.store.get();
    return await this.sessionManager.persistSessionSnapshot(currentSessionId, cloneMessages(messages));
  }
  async triggerAutoTitle(sessionId, messages, provider, requestDefaults) {
    if (this.isDestroyed || this.sessionManager.isDeleted(sessionId))
      return;
    const controller = new AbortController();
    this.autoTitleControllers.add(controller);
    try {
      const payloadMessages = dropEphemeralMessages(messages);
      const payloadOptions = { ...requestDefaults.options, ...this.titleOptions };
      const titleRequest = {
        messages: payloadMessages,
        instructions: this.titleInstructions,
        options: payloadOptions,
        signal: controller.signal
      };
      const smartTitle = await provider.generateTitle(titleRequest);
      if (!smartTitle)
        return;
      if (controller.signal.aborted || this.isDestroyed || this.sessionManager.isDeleted(sessionId))
        return;
      await this.sessionManager.updateTitle(sessionId, smartTitle);
    } catch (e) {
      if (controller.signal.aborted)
        return;
      console.error("Failed to auto-generate title", e);
    } finally {
      this.autoTitleControllers.delete(controller);
    }
  }
  abortAutoTitles() {
    for (const controller of this.autoTitleControllers) {
      controller.abort();
    }
    this.autoTitleControllers.clear();
  }
  mergeDefinedOptions(base, patch) {
    const next = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      if (value === void 0) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    return next;
  }
  cloneRequestDefaults(defaults = this.requestDefaults) {
    return {
      instructions: defaults.instructions,
      tools: defaults.tools ? [...defaults.tools] : void 0,
      options: { ...defaults.options }
    };
  }
};
function findLastUserRunId(messages) {
  var _a;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user")
      return (_a = message.runId) !== null && _a !== void 0 ? _a : message.id;
  }
  return void 0;
}
function hasPatchField(patch, key) {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

// node_modules/murm-ui/dist/core/storage/indexed-db.js
var DB_VERSION = 6;
var STORE_META = "session_meta";
var STORE_MSGS = "session_messages";
var INDEX_META_BY_PINNED_UPDATED_ID = "by_pinned_updated_id";
var INDEXED_PINNED_FIELD = "isPinnedKey";
var IndexedDBStorage = class {
  constructor(dbName = "MurmDB") {
    this.dbName = dbName;
    this.db = null;
    this.dbPromise = null;
  }
  async getDB() {
    if (this.db)
      return this.db;
    if (this.dbPromise)
      return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      try {
        if (typeof indexedDB === "undefined") {
          throw new Error("IndexedDB is not supported in this environment.");
        }
        const request = indexedDB.open(this.dbName, DB_VERSION);
        request.onerror = () => {
          this.dbPromise = null;
          reject(request.error);
        };
        request.onblocked = () => {
          this.dbPromise = null;
          reject(new Error("Database upgrade blocked. Close other tabs or DevTools and refresh."));
        };
        request.onsuccess = () => {
          this.db = request.result;
          resolve(this.db);
        };
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          const tx = event.target.transaction;
          if (!tx)
            throw new Error("IndexedDB upgrade transaction is unavailable.");
          let metaStore;
          if (!db.objectStoreNames.contains(STORE_META)) {
            metaStore = db.createObjectStore(STORE_META, {
              keyPath: "id"
            });
          } else {
            metaStore = tx.objectStore(STORE_META);
          }
          if (metaStore.indexNames.contains("by_updated")) {
            metaStore.deleteIndex("by_updated");
          }
          if (metaStore.indexNames.contains("by_updated_id")) {
            metaStore.deleteIndex("by_updated_id");
          }
          if (metaStore.indexNames.contains(INDEX_META_BY_PINNED_UPDATED_ID)) {
            metaStore.deleteIndex(INDEX_META_BY_PINNED_UPDATED_ID);
          }
          if (!metaStore.indexNames.contains(INDEX_META_BY_PINNED_UPDATED_ID)) {
            metaStore.createIndex(INDEX_META_BY_PINNED_UPDATED_ID, [INDEXED_PINNED_FIELD, "updatedAt", "id"], {
              unique: false
            });
          }
          if (!db.objectStoreNames.contains(STORE_MSGS)) {
            db.createObjectStore(STORE_MSGS, { keyPath: "id" });
          }
          const normalizeReq = metaStore.openCursor();
          normalizeReq.onsuccess = () => {
            const cursor = normalizeReq.result;
            if (!cursor)
              return;
            const value = cursor.value;
            if (typeof value[INDEXED_PINNED_FIELD] !== "number") {
              cursor.update(this.toStoredMeta(value));
            }
            cursor.continue();
          };
        };
      } catch (err) {
        this.dbPromise = null;
        reject(err);
      }
    });
    return this.dbPromise;
  }
  async loadSessions(limit, cursor) {
    return this.runTx(STORE_META, (tx, resolve, reject) => {
      const index = tx.objectStore(STORE_META).index(INDEX_META_BY_PINNED_UPDATED_ID);
      const sessions = [];
      const range = cursor ? IDBKeyRange.upperBound([this.toPinnedKey(cursor.isPinned), cursor.updatedAt, cursor.id], true) : null;
      const request = index.openCursor(range, "prev");
      request.onsuccess = () => {
        const dbCursor = request.result;
        if (!dbCursor) {
          resolve({ items: sessions, hasMore: false });
          return;
        }
        sessions.push(this.fromStoredMeta(dbCursor.value));
        if (sessions.length <= limit) {
          dbCursor.continue();
        } else {
          sessions.pop();
          resolve({ items: sessions, hasMore: true });
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
  async loadOne(id) {
    return this.runTx([STORE_META, STORE_MSGS], (tx, resolve) => {
      const metaReq = tx.objectStore(STORE_META).get(id);
      const msgReq = tx.objectStore(STORE_MSGS).get(id);
      tx.oncomplete = () => {
        if (!metaReq.result || !msgReq.result)
          resolve(null);
        else
          resolve({ ...this.fromStoredMeta(metaReq.result), messages: msgReq.result.messages });
      };
    });
  }
  async updateMetadata(id, meta) {
    return this.runTx(STORE_META, (tx, resolve) => {
      tx.oncomplete = () => resolve();
      const store = tx.objectStore(STORE_META);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (existing) {
          store.put(this.toStoredMeta({
            ...existing,
            ...meta,
            isPinned: typeof meta.isPinned === "boolean" ? meta.isPinned : Boolean(existing.isPinned)
          }));
        }
      };
    }, "readwrite");
  }
  async save(session) {
    return this.runTx([STORE_META, STORE_MSGS], (tx, resolve) => {
      tx.oncomplete = () => resolve();
      const updatedAt = session.updatedAt || Date.now();
      const metaStore = tx.objectStore(STORE_META);
      const messagesStore = tx.objectStore(STORE_MSGS);
      const existingReq = metaStore.get(session.id);
      existingReq.onsuccess = () => {
        var _a;
        const existingPinned = Boolean((_a = existingReq.result) === null || _a === void 0 ? void 0 : _a.isPinned);
        const isPinned = typeof session.isPinned === "boolean" ? session.isPinned : existingPinned;
        metaStore.put(this.toStoredMeta({ id: session.id, title: session.title, updatedAt, isPinned }));
        messagesStore.put({ id: session.id, messages: session.messages });
      };
    }, "readwrite");
  }
  async delete(id) {
    return this.runTx([STORE_META, STORE_MSGS], (tx, resolve) => {
      tx.oncomplete = () => resolve();
      tx.objectStore(STORE_META).delete(id);
      tx.objectStore(STORE_MSGS).delete(id);
    }, "readwrite");
  }
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {
      });
      this.dbPromise = null;
    }
  }
  async runTx(stores, operation, mode = "readonly") {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
      operation(tx, resolve, reject);
    });
  }
  toStoredMeta(meta) {
    return {
      id: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt,
      isPinned: Boolean(meta.isPinned),
      [INDEXED_PINNED_FIELD]: this.toPinnedKey(meta.isPinned)
    };
  }
  fromStoredMeta(meta) {
    return {
      id: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt,
      isPinned: Boolean(meta.isPinned)
    };
  }
  toPinnedKey(isPinned) {
    return isPinned ? 1 : 0;
  }
};

// node_modules/murm-ui/dist/utils/dom.js
function queryOrThrow(context, selector) {
  const el2 = context.querySelector(selector);
  if (!el2) {
    throw new Error(`DOM Error: Required element "${selector}" not found inside the container.`);
  }
  return el2;
}
function el(tag, className, props, children) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (props) {
    Object.assign(element, props);
  }
  if (children) {
    for (const child of children) {
      if (child)
        element.append(child);
    }
  }
  return element;
}
function replaceNodes(parent, ...nodes) {
  if (typeof parent.replaceChildren === "function") {
    parent.replaceChildren(...nodes);
    return;
  }
  parent.textContent = "";
  for (const node of nodes) {
    parent.appendChild(typeof node === "string" ? document.createTextNode(node) : node);
  }
}
function syncDOMChildren(target, source) {
  let targetChild = target.firstChild;
  let sourceChild = source.firstChild;
  while (sourceChild !== null) {
    if (targetChild === null) {
      target.appendChild(sourceChild.cloneNode(true));
      sourceChild = sourceChild.nextSibling;
    } else {
      const nextTargetChild = targetChild.nextSibling;
      const nextSourceChild = sourceChild.nextSibling;
      syncDOMNode(targetChild, sourceChild);
      targetChild = nextTargetChild;
      sourceChild = nextSourceChild;
    }
  }
  while (targetChild !== null) {
    const nextTargetChild = targetChild.nextSibling;
    target.removeChild(targetChild);
    targetChild = nextTargetChild;
  }
}
function syncDOMNode(target, source) {
  var _a;
  if (target.nodeType === Node.TEXT_NODE && source.nodeType === Node.TEXT_NODE) {
    if (target.nodeValue !== source.nodeValue) {
      target.nodeValue = source.nodeValue;
    }
    return;
  }
  if (target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) {
    (_a = target.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(source.cloneNode(true), target);
    return;
  }
  if (target.nodeType === Node.ELEMENT_NODE) {
    const elTarget = target;
    const elSource = source;
    const sourceAttrs = elSource.attributes;
    const targetAttrs = elTarget.attributes;
    for (let i = targetAttrs.length - 1; i >= 0; i--) {
      const attrName = targetAttrs[i].name;
      if (!elSource.hasAttribute(attrName)) {
        elTarget.removeAttribute(attrName);
      }
    }
    for (let i = 0; i < sourceAttrs.length; i++) {
      const attr = sourceAttrs[i];
      if (elTarget.getAttribute(attr.name) !== attr.value) {
        elTarget.setAttribute(attr.name, attr.value);
      }
    }
  }
  syncDOMChildren(target, source);
}

// node_modules/murm-ui/dist/utils/icons.js
var ICON_COPY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
var ICON_CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--mur-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
var ICON_EDIT = `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`;
var ICON_CHEVRON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
var ICON_MORE_VERTICAL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>`;
var ICON_PIN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16h14v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg>`;
var ICON_PIN_OFF = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l20 20"/><path d="M12 17v5"/><path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16h11"/><path d="M15 9.3V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0-1.5.7"/></svg>`;
var ICON_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

// node_modules/murm-ui/dist/components/feed-items.js
var DEFAULT_MIN_AGENT_RUN_STEPS = 1;
var DEFAULT_AGENT_RUN_COLLAPSE = "machinery";
function buildFeedItems(messages, options) {
  var _a, _b;
  const items = [];
  const minAgentRunSteps = (_a = options.minAgentRunSteps) !== null && _a !== void 0 ? _a : DEFAULT_MIN_AGENT_RUN_STEPS;
  const agentRunCollapse = (_b = options.agentRunCollapse) !== null && _b !== void 0 ? _b : DEFAULT_AGENT_RUN_COLLAPSE;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === "user") {
      const runEndIndex = findRunEndIndex(messages, index);
      const runItem = runEndIndex - index >= 2 ? buildAgentRunItem(messages, index, runEndIndex, options, minAgentRunSteps, agentRunCollapse) : null;
      if (runItem) {
        items.push(runItem);
        index = runEndIndex - 1;
        continue;
      }
    }
    items.push(message);
  }
  return items;
}
function isAgentRunItem(item) {
  return "type" in item && item.type === "agent_run";
}
function feedItemType(item) {
  return isAgentRunItem(item) ? "agent_run" : "message";
}
function findRunEndIndex(messages, userIndex) {
  const userMessage = messages[userIndex];
  const runId = userMessage.runId;
  let endIndex = userIndex + 1;
  if (runId) {
    while (endIndex < messages.length && messages[endIndex].role !== "user" && messages[endIndex].runId === runId) {
      endIndex++;
    }
  } else {
    while (endIndex < messages.length && messages[endIndex].role !== "user" && !messages[endIndex].runId) {
      endIndex++;
    }
  }
  return endIndex;
}
function buildAgentRunItem(messages, userIndex, runEndIndex, options, minAgentRunSteps, agentRunCollapse) {
  var _a;
  let isActiveRun = false;
  if (options.generatingMessageId) {
    for (let i = userIndex; i < runEndIndex; i++) {
      if (messages[i].id !== options.generatingMessageId)
        continue;
      if (agentRunCollapse !== "machinery")
        return null;
      isActiveRun = true;
      break;
    }
  }
  const userMessage = messages[userIndex];
  const finalMessageIndex = findFinalAssistantProseIndex(messages, userIndex + 1, runEndIndex);
  if (finalMessageIndex === -1 && !isActiveRun)
    return null;
  if (agentRunCollapse === "full" && finalMessageIndex !== runEndIndex - 1)
    return null;
  const runId = (_a = userMessage.runId) !== null && _a !== void 0 ? _a : userMessage.id;
  const isWorkSegmentExpanded = (segmentId) => {
    var _a2, _b;
    return isActiveRun || ((_a2 = options.isWorkSegmentExpanded) === null || _a2 === void 0 ? void 0 : _a2.call(options, segmentId)) || ((_b = options.isRunExpanded) === null || _b === void 0 ? void 0 : _b.call(options, runId)) || false;
  };
  const segments = agentRunCollapse === "full" ? buildFullSegments(messages, userIndex, finalMessageIndex, runId, isWorkSegmentExpanded) : buildMachinerySegments(messages, userIndex, runEndIndex, runId, isWorkSegmentExpanded);
  const stepMessages = flattenStepMessages(segments);
  if (countAgentStepMessages(stepMessages) < minAgentRunSteps)
    return null;
  const visibleMessages = flattenVisibleMessages(segments);
  const collapsed = segments.filter((segment) => segment.type === "work").every((segment) => segment.collapsed);
  const finalMessage = messages[finalMessageIndex === -1 ? runEndIndex - 1 : finalMessageIndex];
  return {
    type: "agent_run",
    id: `agent-run:${runId}`,
    runId,
    userMessage,
    segments,
    stepMessages,
    visibleMessages,
    finalMessage,
    collapsed,
    durationMs: calculateRunDuration(userMessage, finalMessage)
  };
}
function buildFullSegments(messages, userIndex, finalMessageIndex, runId, isWorkSegmentExpanded) {
  const stepMessages = buildFullStepMessages(messages, userIndex + 1, finalMessageIndex);
  const finalMachineryBlocks = machineryBlocks(messages[finalMessageIndex]);
  if (finalMachineryBlocks.length > 0) {
    stepMessages.push(createFilteredMessage(messages[finalMessageIndex], finalMachineryBlocks));
  }
  const visibleFinalBlocks = proseBlocks(messages[finalMessageIndex]);
  const segments = [];
  if (stepMessages.length > 0) {
    const id = `${runId}:work:0`;
    segments.push({
      type: "work",
      id,
      runId,
      stepMessages,
      collapsed: !isWorkSegmentExpanded(id),
      durationMs: calculateRunDuration(messages[userIndex], messages[finalMessageIndex])
    });
  }
  if (visibleFinalBlocks.length > 0) {
    segments.push({
      type: "messages",
      id: `${runId}:messages:0`,
      messages: [createFilteredMessage(messages[finalMessageIndex], visibleFinalBlocks)]
    });
  }
  return segments;
}
function buildFullStepMessages(messages, startIndex, finalMessageIndex) {
  const stepMessages = [];
  for (let i = startIndex; i < finalMessageIndex; i++) {
    const stepBlocks = messages[i].blocks.filter(isRenderableStepBlock);
    if (stepBlocks.length > 0)
      stepMessages.push(createFilteredMessage(messages[i], stepBlocks));
  }
  return stepMessages;
}
function buildMachinerySegments(messages, userIndex, runEndIndex, runId, isWorkSegmentExpanded) {
  const segments = [];
  let pendingKind = null;
  let pendingMessages = [];
  const flush = () => {
    if (!pendingKind || pendingMessages.length === 0)
      return;
    const index = segments.length;
    if (pendingKind === "messages") {
      segments.push({
        type: "messages",
        id: `${runId}:messages:${index}`,
        messages: pendingMessages
      });
    } else {
      const id = `${runId}:work:${index}`;
      segments.push({
        type: "work",
        id,
        runId,
        stepMessages: pendingMessages,
        collapsed: !isWorkSegmentExpanded(id)
      });
    }
    pendingKind = null;
    pendingMessages = [];
  };
  const append = (kind, message, blocks) => {
    if (blocks.length === 0)
      return;
    if (pendingKind !== kind)
      flush();
    pendingKind = kind;
    pendingMessages.push(createFilteredMessage(message, blocks));
  };
  for (let i = userIndex + 1; i < runEndIndex; i++) {
    appendMessageChunks(messages[i], append);
  }
  flush();
  moveLeadingReasoningIntoNextWorkSegment(segments);
  applyWorkDurations(segments, messages[userIndex]);
  return segments;
}
function appendMessageChunks(message, append) {
  if (message.role !== "assistant") {
    append("work", message, message.blocks.filter(isRenderableStepBlock));
    return;
  }
  let currentKind = null;
  let currentBlocks = [];
  const flush = () => {
    if (!currentKind || currentBlocks.length === 0)
      return;
    append(currentKind, message, currentBlocks);
    currentKind = null;
    currentBlocks = [];
  };
  for (const block of message.blocks) {
    const kind = blockKind(block);
    if (!kind)
      continue;
    if (currentKind !== kind)
      flush();
    currentKind = kind;
    currentBlocks.push(block);
  }
  flush();
}
function blockKind(block) {
  if (isProseBlock(block))
    return "messages";
  if (isCollapsibleBlock(block))
    return "work";
  return null;
}
function flattenStepMessages(segments) {
  return segments.flatMap((segment) => segment.type === "work" ? segment.stepMessages : []);
}
function countAgentStepMessages(messages) {
  return new Set(messages.map((message) => message.id)).size;
}
function flattenVisibleMessages(segments) {
  return segments.flatMap((segment) => segment.type === "messages" ? segment.messages : []);
}
function applyWorkDurations(segments, userMessage) {
  var _a;
  let previousVisibleMessage = userMessage;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type === "messages") {
      previousVisibleMessage = (_a = segment.messages[segment.messages.length - 1]) !== null && _a !== void 0 ? _a : previousVisibleMessage;
      continue;
    }
    const nextVisibleMessage = findNextVisibleMessage(segments, i + 1);
    const lastStepMessage = segment.stepMessages[segment.stepMessages.length - 1];
    if (!lastStepMessage)
      continue;
    const boundaryDurationMs = nextVisibleMessage ? calculateRunDuration(previousVisibleMessage, nextVisibleMessage) : calculateRunDuration(previousVisibleMessage, lastStepMessage);
    if (boundaryDurationMs !== void 0)
      segment.durationMs = boundaryDurationMs;
  }
}
function findNextVisibleMessage(segments, startIndex) {
  for (let i = startIndex; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.type === "messages")
      return segment.messages[0];
  }
  return void 0;
}
function moveLeadingReasoningIntoNextWorkSegment(segments) {
  const firstSegment = segments[0];
  const secondSegment = segments[1];
  if ((firstSegment === null || firstSegment === void 0 ? void 0 : firstSegment.type) !== "work" || (secondSegment === null || secondSegment === void 0 ? void 0 : secondSegment.type) !== "messages")
    return;
  if (!isReasoningOnlyWorkSegment(firstSegment))
    return;
  const nextWorkIndex = segments.findIndex((segment, index) => index > 1 && segment.type === "work");
  if (nextWorkIndex === -1)
    return;
  const nextWorkSegment = segments[nextWorkIndex];
  if (nextWorkSegment.type !== "work")
    return;
  segments[nextWorkIndex] = {
    ...nextWorkSegment,
    stepMessages: [...firstSegment.stepMessages, ...nextWorkSegment.stepMessages]
  };
  segments.shift();
}
function isReasoningOnlyWorkSegment(segment) {
  return segment.stepMessages.every((message) => message.role === "assistant" && message.blocks.length > 0 && message.blocks.every((block) => block.type === "reasoning"));
}
function createFilteredMessage(message, blocks) {
  return { ...message, blocks };
}
function findFinalAssistantProseIndex(messages, startIndex, endIndex) {
  for (let i = endIndex - 1; i >= startIndex; i--) {
    const message = messages[i];
    if (message.role === "assistant" && proseBlocks(message).length > 0)
      return i;
  }
  return -1;
}
function machineryBlocks(message) {
  if (message.role !== "assistant")
    return message.blocks.filter(isRenderableStepBlock);
  return message.blocks.filter(isCollapsibleBlock);
}
function proseBlocks(message) {
  if (message.role !== "assistant")
    return [];
  return message.blocks.filter(isProseBlock);
}
function isProseBlock(block) {
  switch (block.type) {
    case "text":
      return block.text.trim().length > 0;
    case "artifact":
    case "file":
      return true;
    case "reasoning":
    case "tool_call":
    case "tool_result":
      return false;
  }
}
function isCollapsibleBlock(block) {
  switch (block.type) {
    case "reasoning":
      return hasVisibleBlock(block);
    case "tool_call":
      return true;
    case "tool_result":
    case "text":
    case "artifact":
    case "file":
      return false;
  }
}
function hasVisibleBlock(block) {
  switch (block.type) {
    case "text":
      return block.text.trim().length > 0;
    case "reasoning":
      return block.encrypted === true || block.text.trim().length > 0 || Boolean(block.encryptedText);
    case "tool_call":
    case "tool_result":
    case "artifact":
    case "file":
      return true;
  }
}
function isRenderableStepBlock(block) {
  return block.type !== "tool_result" && hasVisibleBlock(block);
}
function calculateRunDuration(userMessage, finalMessage) {
  var _a, _b;
  const startedAt = (_a = userMessage.updatedAt) !== null && _a !== void 0 ? _a : userMessage.createdAt;
  const finishedAt = (_b = finalMessage.updatedAt) !== null && _b !== void 0 ? _b : finalMessage.createdAt;
  if (startedAt === void 0 || finishedAt === void 0)
    return void 0;
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt)
    return void 0;
  return finishedAt - startedAt;
}

// node_modules/marked/lib/marked.esm.js
function M() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var O = M();
function G(u3) {
  O = u3;
}
var _ = { exec: () => null };
function k(u3, e = "") {
  let t = typeof u3 == "string" ? u3 : u3.source, n = { replace: (r, i) => {
    let s = typeof i == "string" ? i : i.source;
    return s = s.replace(m.caret, "$1"), t = t.replace(r, s), n;
  }, getRegex: () => new RegExp(t, e) };
  return n;
}
var be = (() => {
  try {
    return !!new RegExp("(?<=1)(?<!1)");
  } catch {
    return false;
  }
})();
var m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (u3) => new RegExp(`^( {0,3}${u3})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}#`), htmlBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (u3) => new RegExp(`^ {0,${Math.min(3, u3 - 1)}}>`) };
var Re = /^(?:[ \t]*(?:\n|$))+/;
var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var Te = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var C = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var we = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var Q = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var se = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var ie = k(se).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var ye = k(se).replace(/bull/g, Q).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Pe = /^[^\n]+/;
var F = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var Se = k(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", F).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var $e = k(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, Q).getRegex();
var v = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = k("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var oe = k(j).replace("hr", C).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Le = k(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", oe).getRegex();
var K = { blockquote: Le, code: Oe, def: Se, fences: Te, heading: we, hr: C, html: _e, lheading: ie, list: $e, newline: Re, paragraph: oe, table: _, text: Pe };
var ne = k("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", C).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex();
var Me = { ...K, lheading: ye, table: ne, paragraph: k(j).replace("hr", C).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", ne).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v).getRegex() };
var ze = { ...K, html: k(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: k(j).replace("hr", C).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ie).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ee = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ie = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var ae = /^( {2,}|\\)\n(?!\s*$)/;
var Ae = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var z = /[\p{P}\p{S}]/u;
var H = /[\s\p{P}\p{S}]/u;
var W = /[^\s\p{P}\p{S}]/u;
var Ce = k(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, H).getRegex();
var le = /(?!~)[\p{P}\p{S}]/u;
var Be = /(?!~)[\s\p{P}\p{S}]/u;
var De = /(?:[^\s\p{P}\p{S}]|~)/u;
var qe = k(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", be ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var ue = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var ve = k(ue, "u").replace(/punct/g, z).getRegex();
var He = k(ue, "u").replace(/punct/g, le).getRegex();
var pe = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ze = k(pe, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, z).getRegex();
var Ge = k(pe, "gu").replace(/notPunctSpace/g, De).replace(/punctSpace/g, Be).replace(/punct/g, le).getRegex();
var Ne = k("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, z).getRegex();
var Qe = k(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, z).getRegex();
var je = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var Fe = k(je, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H).replace(/punct/g, z).getRegex();
var Ue = k(/\\(punct)/, "gu").replace(/punct/g, z).getRegex();
var Ke = k(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var We = k(U).replace("(?:-->|$)", "-->").getRegex();
var Xe = k("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", We).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var Je = k(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", q).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var ce = k(/^!?\[(label)\]\[(ref)\]/).replace("label", q).replace("ref", F).getRegex();
var he = k(/^!?\[(ref)\](?:\[\])?/).replace("ref", F).getRegex();
var Ve = k("reflink|nolink(?!\\()", "g").replace("reflink", ce).replace("nolink", he).getRegex();
var re = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: _, anyPunctuation: Ue, autolink: Ke, blockSkip: qe, br: ae, code: Ie, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: ve, emStrongRDelimAst: Ze, emStrongRDelimUnd: Ne, escape: Ee, link: Je, nolink: he, punctuation: Ce, reflink: ce, reflinkSearch: Ve, tag: Xe, text: Ae, url: _ };
var Ye = { ...X, link: k(/^!?\[(label)\]\((.*?)\)/).replace("label", q).getRegex(), reflink: k(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q).getRegex() };
var N = { ...X, emStrongRDelimAst: Ge, emStrongLDelim: He, delLDelim: Qe, delRDelim: Fe, url: k(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", re).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: k(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", re).getRegex() };
var et = { ...N, br: k(ae).replace("{2,}", "*").getRegex(), text: k(N.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var B = { normal: K, gfm: Me, pedantic: ze };
var E = { normal: X, gfm: N, breaks: et, pedantic: Ye };
var tt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var ke = (u3) => tt[u3];
function T(u3, e) {
  if (e) {
    if (m.escapeTest.test(u3)) return u3.replace(m.escapeReplace, ke);
  } else if (m.escapeTestNoEncode.test(u3)) return u3.replace(m.escapeReplaceNoEncode, ke);
  return u3;
}
function J(u3) {
  try {
    u3 = encodeURI(u3).replace(m.percentDecode, "%");
  } catch {
    return null;
  }
  return u3;
}
function V(u3, e) {
  let t = u3.replace(m.findPipe, (i, s, a) => {
    let o = false, l = s;
    for (; --l >= 0 && a[l] === "\\"; ) o = !o;
    return o ? "|" : " |";
  }), n = t.split(m.splitPipe), r = 0;
  if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
  else for (; n.length < e; ) n.push("");
  for (; r < n.length; r++) n[r] = n[r].trim().replace(m.slashPipe, "|");
  return n;
}
function I(u3, e, t) {
  let n = u3.length;
  if (n === 0) return "";
  let r = 0;
  for (; r < n; ) {
    let i = u3.charAt(n - r - 1);
    if (i === e && !t) r++;
    else if (i !== e && t) r++;
    else break;
  }
  return u3.slice(0, n - r);
}
function de(u3, e) {
  if (u3.indexOf(e[1]) === -1) return -1;
  let t = 0;
  for (let n = 0; n < u3.length; n++) if (u3[n] === "\\") n++;
  else if (u3[n] === e[0]) t++;
  else if (u3[n] === e[1] && (t--, t < 0)) return n;
  return t > 0 ? -2 : -1;
}
function ge(u3, e = 0) {
  let t = e, n = "";
  for (let r of u3) if (r === "	") {
    let i = 4 - t % 4;
    n += " ".repeat(i), t += i;
  } else n += r, t++;
  return n;
}
function fe(u3, e, t, n, r) {
  let i = e.href, s = e.title || null, a = u3[1].replace(r.other.outputLinkReplace, "$1");
  n.state.inLink = true;
  let o = { type: u3[0].charAt(0) === "!" ? "image" : "link", raw: t, href: i, title: s, text: a, tokens: n.inlineTokens(a) };
  return n.state.inLink = false, o;
}
function nt(u3, e, t) {
  let n = u3.match(t.other.indentCodeCompensation);
  if (n === null) return e;
  let r = n[1];
  return e.split(`
`).map((i) => {
    let s = i.match(t.other.beginningSpace);
    if (s === null) return i;
    let [a] = s;
    return a.length >= r.length ? i.slice(r.length) : i;
  }).join(`
`);
}
var w = class {
  options;
  rules;
  lexer;
  constructor(e) {
    this.options = e || O;
  }
  space(e) {
    let t = this.rules.block.newline.exec(e);
    if (t && t[0].length > 0) return { type: "space", raw: t[0] };
  }
  code(e) {
    let t = this.rules.block.code.exec(e);
    if (t) {
      let n = t[0].replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: t[0], codeBlockStyle: "indented", text: this.options.pedantic ? n : I(n, `
`) };
    }
  }
  fences(e) {
    let t = this.rules.block.fences.exec(e);
    if (t) {
      let n = t[0], r = nt(n, t[3] || "", this.rules);
      return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: r };
    }
  }
  heading(e) {
    let t = this.rules.block.heading.exec(e);
    if (t) {
      let n = t[2].trim();
      if (this.rules.other.endingHash.test(n)) {
        let r = I(n, "#");
        (this.options.pedantic || !r || this.rules.other.endingSpaceChar.test(r)) && (n = r.trim());
      }
      return { type: "heading", raw: t[0], depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
    }
  }
  hr(e) {
    let t = this.rules.block.hr.exec(e);
    if (t) return { type: "hr", raw: I(t[0], `
`) };
  }
  blockquote(e) {
    let t = this.rules.block.blockquote.exec(e);
    if (t) {
      let n = I(t[0], `
`).split(`
`), r = "", i = "", s = [];
      for (; n.length > 0; ) {
        let a = false, o = [], l;
        for (l = 0; l < n.length; l++) if (this.rules.other.blockquoteStart.test(n[l])) o.push(n[l]), a = true;
        else if (!a) o.push(n[l]);
        else break;
        n = n.slice(l);
        let p = o.join(`
`), c = p.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        r = r ? `${r}
${p}` : p, i = i ? `${i}
${c}` : c;
        let d = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(c, s, true), this.lexer.state.top = d, n.length === 0) break;
        let h = s.at(-1);
        if (h?.type === "code") break;
        if (h?.type === "blockquote") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
          s[s.length - 1] = S, r = r.substring(0, r.length - R.raw.length) + S.raw, i = i.substring(0, i.length - R.text.length) + S.text;
          break;
        } else if (h?.type === "list") {
          let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
          s[s.length - 1] = S, r = r.substring(0, r.length - h.raw.length) + S.raw, i = i.substring(0, i.length - R.raw.length) + S.raw, n = f.substring(s.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: r, tokens: s, text: i };
    }
  }
  list(e) {
    let t = this.rules.block.list.exec(e);
    if (t) {
      let n = t[1].trim(), r = n.length > 1, i = { type: "list", raw: "", ordered: r, start: r ? +n.slice(0, -1) : "", loose: false, items: [] };
      n = r ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = r ? n : "[*+-]");
      let s = this.rules.other.listItemRegex(n), a = false;
      for (; e; ) {
        let l = false, p = "", c = "";
        if (!(t = s.exec(e)) || this.rules.block.hr.test(e)) break;
        p = t[0], e = e.substring(p.length);
        let d = ge(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !d.trim(), f = 0;
        if (this.options.pedantic ? (f = 2, c = d.trimStart()) : R ? f = t[1].length + 1 : (f = d.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, c = d.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (p += h + `
`, e = e.substring(h.length + 1), l = true), !l) {
          let S = this.rules.other.nextBulletRegex(f), Y = this.rules.other.hrRegex(f), ee = this.rules.other.fencesBeginRegex(f), te = this.rules.other.headingBeginRegex(f), me = this.rules.other.htmlBeginRegex(f), xe = this.rules.other.blockquoteBeginRegex(f);
          for (; e; ) {
            let Z = e.split(`
`, 1)[0], A;
            if (h = Z, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), A = h) : A = h.replace(this.rules.other.tabCharGlobal, "    "), ee.test(h) || te.test(h) || me.test(h) || xe.test(h) || S.test(h) || Y.test(h)) break;
            if (A.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) c += `
` + A.slice(f);
            else {
              if (R || d.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ee.test(d) || te.test(d) || Y.test(d)) break;
              c += `
` + h;
            }
            R = !h.trim(), p += Z + `
`, e = e.substring(Z.length + 1), d = A.slice(f);
          }
        }
        i.loose || (a ? i.loose = true : this.rules.other.doubleBlankLine.test(p) && (a = true)), i.items.push({ type: "list_item", raw: p, task: !!this.options.gfm && this.rules.other.listIsTask.test(c), loose: false, text: c, tokens: [] }), i.raw += p;
      }
      let o = i.items.at(-1);
      if (o) o.raw = o.raw.trimEnd(), o.text = o.text.trimEnd();
      else return;
      i.raw = i.raw.trimEnd();
      for (let l of i.items) {
        if (this.lexer.state.top = false, l.tokens = this.lexer.blockTokens(l.text, []), l.task) {
          if (l.text = l.text.replace(this.rules.other.listReplaceTask, ""), l.tokens[0]?.type === "text" || l.tokens[0]?.type === "paragraph") {
            l.tokens[0].raw = l.tokens[0].raw.replace(this.rules.other.listReplaceTask, ""), l.tokens[0].text = l.tokens[0].text.replace(this.rules.other.listReplaceTask, "");
            for (let c = this.lexer.inlineQueue.length - 1; c >= 0; c--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[c].src)) {
              this.lexer.inlineQueue[c].src = this.lexer.inlineQueue[c].src.replace(this.rules.other.listReplaceTask, "");
              break;
            }
          }
          let p = this.rules.other.listTaskCheckbox.exec(l.raw);
          if (p) {
            let c = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
            l.checked = c.checked, i.loose ? l.tokens[0] && ["paragraph", "text"].includes(l.tokens[0].type) && "tokens" in l.tokens[0] && l.tokens[0].tokens ? (l.tokens[0].raw = c.raw + l.tokens[0].raw, l.tokens[0].text = c.raw + l.tokens[0].text, l.tokens[0].tokens.unshift(c)) : l.tokens.unshift({ type: "paragraph", raw: c.raw, text: c.raw, tokens: [c] }) : l.tokens.unshift(c);
          }
        }
        if (!i.loose) {
          let p = l.tokens.filter((d) => d.type === "space"), c = p.length > 0 && p.some((d) => this.rules.other.anyLine.test(d.raw));
          i.loose = c;
        }
      }
      if (i.loose) for (let l of i.items) {
        l.loose = true;
        for (let p of l.tokens) p.type === "text" && (p.type = "paragraph");
      }
      return i;
    }
  }
  html(e) {
    let t = this.rules.block.html.exec(e);
    if (t) return { type: "html", block: true, raw: t[0], pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: t[0] };
  }
  def(e) {
    let t = this.rules.block.def.exec(e);
    if (t) {
      let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), r = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", i = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
      return { type: "def", tag: n, raw: t[0], href: r, title: i };
    }
  }
  table(e) {
    let t = this.rules.block.table.exec(e);
    if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
    let n = V(t[1]), r = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), i = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], s = { type: "table", raw: t[0], header: [], align: [], rows: [] };
    if (n.length === r.length) {
      for (let a of r) this.rules.other.tableAlignRight.test(a) ? s.align.push("right") : this.rules.other.tableAlignCenter.test(a) ? s.align.push("center") : this.rules.other.tableAlignLeft.test(a) ? s.align.push("left") : s.align.push(null);
      for (let a = 0; a < n.length; a++) s.header.push({ text: n[a], tokens: this.lexer.inline(n[a]), header: true, align: s.align[a] });
      for (let a of i) s.rows.push(V(a, s.header.length).map((o, l) => ({ text: o, tokens: this.lexer.inline(o), header: false, align: s.align[l] })));
      return s;
    }
  }
  lheading(e) {
    let t = this.rules.block.lheading.exec(e);
    if (t) {
      let n = t[1].trim();
      return { type: "heading", raw: t[0], depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
    }
  }
  paragraph(e) {
    let t = this.rules.block.paragraph.exec(e);
    if (t) {
      let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
      return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
    }
  }
  text(e) {
    let t = this.rules.block.text.exec(e);
    if (t) return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) };
  }
  escape(e) {
    let t = this.rules.inline.escape.exec(e);
    if (t) return { type: "escape", raw: t[0], text: t[1] };
  }
  tag(e) {
    let t = this.rules.inline.tag.exec(e);
    if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] };
  }
  link(e) {
    let t = this.rules.inline.link.exec(e);
    if (t) {
      let n = t[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
        if (!this.rules.other.endAngleBracket.test(n)) return;
        let s = I(n.slice(0, -1), "\\");
        if ((n.length - s.length) % 2 === 0) return;
      } else {
        let s = de(t[2], "()");
        if (s === -2) return;
        if (s > -1) {
          let o = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + s;
          t[2] = t[2].substring(0, s), t[0] = t[0].substring(0, o).trim(), t[3] = "";
        }
      }
      let r = t[2], i = "";
      if (this.options.pedantic) {
        let s = this.rules.other.pedanticHrefTitle.exec(r);
        s && (r = s[1], i = s[3]);
      } else i = t[3] ? t[3].slice(1, -1) : "";
      return r = r.trim(), this.rules.other.startAngleBracket.test(r) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? r = r.slice(1) : r = r.slice(1, -1)), fe(t, { href: r && r.replace(this.rules.inline.anyPunctuation, "$1"), title: i && i.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    }
  }
  reflink(e, t) {
    let n;
    if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
      let r = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), i = t[r.toLowerCase()];
      if (!i) {
        let s = n[0].charAt(0);
        return { type: "text", raw: s, text: s };
      }
      return fe(n, i, n[0], this.lexer, this.rules);
    }
  }
  emStrong(e, t, n = "") {
    let r = this.rules.inline.emStrongLDelim.exec(e);
    if (!r || !r[1] && !r[2] && !r[3] && !r[4] || r[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(r[1] || r[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, l = s, p = 0, c = r[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (c.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = c.exec(t)) !== null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a) continue;
        if (o = [...a].length, r[3] || r[4]) {
          l += o;
          continue;
        } else if ((r[5] || r[6]) && s % 3 && !((s + o) % 3)) {
          p += o;
          continue;
        }
        if (l -= o, l > 0) continue;
        o = Math.min(o, o + l + p);
        let d = [...r[0]][0].length, h = e.slice(0, s + r.index + d + o);
        if (Math.min(s, o) % 2) {
          let f = h.slice(1, -1);
          return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
        }
        let R = h.slice(2, -2);
        return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
      }
    }
  }
  codespan(e) {
    let t = this.rules.inline.code.exec(e);
    if (t) {
      let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), r = this.rules.other.nonSpaceChar.test(n), i = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
      return r && i && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    }
  }
  br(e) {
    let t = this.rules.inline.br.exec(e);
    if (t) return { type: "br", raw: t[0] };
  }
  del(e, t, n = "") {
    let r = this.rules.inline.delLDelim.exec(e);
    if (!r) return;
    if (!(r[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
      let s = [...r[0]].length - 1, a, o, l = s, p = this.rules.inline.delRDelim;
      for (p.lastIndex = 0, t = t.slice(-1 * e.length + s); (r = p.exec(t)) !== null; ) {
        if (a = r[1] || r[2] || r[3] || r[4] || r[5] || r[6], !a || (o = [...a].length, o !== s)) continue;
        if (r[3] || r[4]) {
          l += o;
          continue;
        }
        if (l -= o, l > 0) continue;
        o = Math.min(o, o + l);
        let c = [...r[0]][0].length, d = e.slice(0, s + r.index + c + o), h = d.slice(s, -s);
        return { type: "del", raw: d, text: h, tokens: this.lexer.inlineTokens(h) };
      }
    }
  }
  autolink(e) {
    let t = this.rules.inline.autolink.exec(e);
    if (t) {
      let n, r;
      return t[2] === "@" ? (n = t[1], r = "mailto:" + n) : (n = t[1], r = n), { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  url(e) {
    let t;
    if (t = this.rules.inline.url.exec(e)) {
      let n, r;
      if (t[2] === "@") n = t[0], r = "mailto:" + n;
      else {
        let i;
        do
          i = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
        while (i !== t[0]);
        n = t[0], t[1] === "www." ? r = "http://" + t[0] : r = t[0];
      }
      return { type: "link", raw: t[0], text: n, href: r, tokens: [{ type: "text", raw: n, text: n }] };
    }
  }
  inlineText(e) {
    let t = this.rules.inline.text.exec(e);
    if (t) {
      let n = this.lexer.state.inRawBlock;
      return { type: "text", raw: t[0], text: t[0], escaped: n };
    }
  }
};
var x = class u {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e || O, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t = { other: m, block: B.normal, inline: E.normal };
    this.options.pedantic ? (t.block = B.pedantic, t.inline = E.pedantic) : this.options.gfm && (t.block = B.gfm, this.options.breaks ? t.inline = E.breaks : t.inline = E.gfm), this.tokenizer.rules = t;
  }
  static get rules() {
    return { block: B, inline: E };
  }
  static lex(e, t) {
    return new u(t).lex(e);
  }
  static lexInline(e, t) {
    return new u(t).inlineTokens(e);
  }
  lex(e) {
    e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
    for (let t = 0; t < this.inlineQueue.length; t++) {
      let n = this.inlineQueue[t];
      this.inlineTokens(n.src, n.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e, t = [], n = false) {
    for (this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, "")); e; ) {
      let r;
      if (this.options.extensions?.block?.some((s) => (r = s.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false)) continue;
      if (r = this.tokenizer.space(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        r.raw.length === 1 && s !== void 0 ? s.raw += `
` : t.push(r);
        continue;
      }
      if (r = this.tokenizer.code(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (r = this.tokenizer.fences(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.heading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.hr(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.blockquote(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.list(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.html(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.def(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "paragraph" || s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.raw, this.inlineQueue.at(-1).src = s.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
        continue;
      }
      if (r = this.tokenizer.table(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      if (r = this.tokenizer.lheading(e)) {
        e = e.substring(r.raw.length), t.push(r);
        continue;
      }
      let i = e;
      if (this.options.extensions?.startBlock) {
        let s = 1 / 0, a = e.slice(1), o;
        this.options.extensions.startBlock.forEach((l) => {
          o = l.call({ lexer: this }, a), typeof o == "number" && o >= 0 && (s = Math.min(s, o));
        }), s < 1 / 0 && s >= 0 && (i = e.substring(0, s + 1));
      }
      if (this.state.top && (r = this.tokenizer.paragraph(i))) {
        let s = t.at(-1);
        n && s?.type === "paragraph" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
        continue;
      }
      if (r = this.tokenizer.text(e)) {
        e = e.substring(r.raw.length);
        let s = t.at(-1);
        s?.type === "text" ? (s.raw += (s.raw.endsWith(`
`) ? "" : `
`) + r.raw, s.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = s.text) : t.push(r);
        continue;
      }
      if (e) {
        let s = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(s);
          break;
        } else throw new Error(s);
      }
    }
    return this.state.top = true, t;
  }
  inline(e, t = []) {
    return this.inlineQueue.push({ src: e, tokens: t }), t;
  }
  inlineTokens(e, t = []) {
    this.tokenizer.lexer = this;
    let n = e, r = null;
    if (this.tokens.links) {
      let o = Object.keys(this.tokens.links);
      if (o.length > 0) for (; (r = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null; ) o.includes(r[0].slice(r[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, r.index) + "[" + "a".repeat(r[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (r = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null; ) n = n.slice(0, r.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let i;
    for (; (r = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null; ) i = r[2] ? r[2].length : 0, n = n.slice(0, r.index + i) + "[" + "a".repeat(r[0].length - i - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
    let s = false, a = "";
    for (; e; ) {
      s || (a = ""), s = false;
      let o;
      if (this.options.extensions?.inline?.some((p) => (o = p.call({ lexer: this }, e, t)) ? (e = e.substring(o.raw.length), t.push(o), true) : false)) continue;
      if (o = this.tokenizer.escape(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.tag(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.link(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.reflink(e, this.tokens.links)) {
        e = e.substring(o.raw.length);
        let p = t.at(-1);
        o.type === "text" && p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
        continue;
      }
      if (o = this.tokenizer.emStrong(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.codespan(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.br(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.del(e, n, a)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (o = this.tokenizer.autolink(e)) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      if (!this.state.inLink && (o = this.tokenizer.url(e))) {
        e = e.substring(o.raw.length), t.push(o);
        continue;
      }
      let l = e;
      if (this.options.extensions?.startInline) {
        let p = 1 / 0, c = e.slice(1), d;
        this.options.extensions.startInline.forEach((h) => {
          d = h.call({ lexer: this }, c), typeof d == "number" && d >= 0 && (p = Math.min(p, d));
        }), p < 1 / 0 && p >= 0 && (l = e.substring(0, p + 1));
      }
      if (o = this.tokenizer.inlineText(l)) {
        e = e.substring(o.raw.length), o.raw.slice(-1) !== "_" && (a = o.raw.slice(-1)), s = true;
        let p = t.at(-1);
        p?.type === "text" ? (p.raw += o.raw, p.text += o.text) : t.push(o);
        continue;
      }
      if (e) {
        let p = "Infinite loop on byte: " + e.charCodeAt(0);
        if (this.options.silent) {
          console.error(p);
          break;
        } else throw new Error(p);
      }
    }
    return t;
  }
};
var y = class {
  options;
  parser;
  constructor(e) {
    this.options = e || O;
  }
  space(e) {
    return "";
  }
  code({ text: e, lang: t, escaped: n }) {
    let r = (t || "").match(m.notSpaceStart)?.[0], i = e.replace(m.endingNewline, "") + `
`;
    return r ? '<pre><code class="language-' + T(r) + '">' + (n ? i : T(i, true)) + `</code></pre>
` : "<pre><code>" + (n ? i : T(i, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e }) {
    return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
  }
  html({ text: e }) {
    return e;
  }
  def(e) {
    return "";
  }
  heading({ tokens: e, depth: t }) {
    return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
  }
  hr(e) {
    return `<hr>
`;
  }
  list(e) {
    let t = e.ordered, n = e.start, r = "";
    for (let a = 0; a < e.items.length; a++) {
      let o = e.items[a];
      r += this.listitem(o);
    }
    let i = t ? "ol" : "ul", s = t && n !== 1 ? ' start="' + n + '"' : "";
    return "<" + i + s + `>
` + r + "</" + i + `>
`;
  }
  listitem(e) {
    return `<li>${this.parser.parse(e.tokens)}</li>
`;
  }
  checkbox({ checked: e }) {
    return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e }) {
    return `<p>${this.parser.parseInline(e)}</p>
`;
  }
  table(e) {
    let t = "", n = "";
    for (let i = 0; i < e.header.length; i++) n += this.tablecell(e.header[i]);
    t += this.tablerow({ text: n });
    let r = "";
    for (let i = 0; i < e.rows.length; i++) {
      let s = e.rows[i];
      n = "";
      for (let a = 0; a < s.length; a++) n += this.tablecell(s[a]);
      r += this.tablerow({ text: n });
    }
    return r && (r = `<tbody>${r}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + r + `</table>
`;
  }
  tablerow({ text: e }) {
    return `<tr>
${e}</tr>
`;
  }
  tablecell(e) {
    let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
    return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
  }
  strong({ tokens: e }) {
    return `<strong>${this.parser.parseInline(e)}</strong>`;
  }
  em({ tokens: e }) {
    return `<em>${this.parser.parseInline(e)}</em>`;
  }
  codespan({ text: e }) {
    return `<code>${T(e, true)}</code>`;
  }
  br(e) {
    return "<br>";
  }
  del({ tokens: e }) {
    return `<del>${this.parser.parseInline(e)}</del>`;
  }
  link({ href: e, title: t, tokens: n }) {
    let r = this.parser.parseInline(n), i = J(e);
    if (i === null) return r;
    e = i;
    let s = '<a href="' + e + '"';
    return t && (s += ' title="' + T(t) + '"'), s += ">" + r + "</a>", s;
  }
  image({ href: e, title: t, text: n, tokens: r }) {
    r && (n = this.parser.parseInline(r, this.parser.textRenderer));
    let i = J(e);
    if (i === null) return T(n);
    e = i;
    let s = `<img src="${e}" alt="${T(n)}"`;
    return t && (s += ` title="${T(t)}"`), s += ">", s;
  }
  text(e) {
    return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : T(e.text);
  }
};
var $ = class {
  strong({ text: e }) {
    return e;
  }
  em({ text: e }) {
    return e;
  }
  codespan({ text: e }) {
    return e;
  }
  del({ text: e }) {
    return e;
  }
  html({ text: e }) {
    return e;
  }
  text({ text: e }) {
    return e;
  }
  link({ text: e }) {
    return "" + e;
  }
  image({ text: e }) {
    return "" + e;
  }
  br() {
    return "";
  }
  checkbox({ raw: e }) {
    return e;
  }
};
var b = class u2 {
  options;
  renderer;
  textRenderer;
  constructor(e) {
    this.options = e || O, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new $();
  }
  static parse(e, t) {
    return new u2(t).parse(e);
  }
  static parseInline(e, t) {
    return new u2(t).parseInline(e);
  }
  parse(e) {
    this.renderer.parser = this;
    let t = "";
    for (let n = 0; n < e.length; n++) {
      let r = e[n];
      if (this.options.extensions?.renderers?.[r.type]) {
        let s = r, a = this.options.extensions.renderers[s.type].call({ parser: this }, s);
        if (a !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(s.type)) {
          t += a || "";
          continue;
        }
      }
      let i = r;
      switch (i.type) {
        case "space": {
          t += this.renderer.space(i);
          break;
        }
        case "hr": {
          t += this.renderer.hr(i);
          break;
        }
        case "heading": {
          t += this.renderer.heading(i);
          break;
        }
        case "code": {
          t += this.renderer.code(i);
          break;
        }
        case "table": {
          t += this.renderer.table(i);
          break;
        }
        case "blockquote": {
          t += this.renderer.blockquote(i);
          break;
        }
        case "list": {
          t += this.renderer.list(i);
          break;
        }
        case "checkbox": {
          t += this.renderer.checkbox(i);
          break;
        }
        case "html": {
          t += this.renderer.html(i);
          break;
        }
        case "def": {
          t += this.renderer.def(i);
          break;
        }
        case "paragraph": {
          t += this.renderer.paragraph(i);
          break;
        }
        case "text": {
          t += this.renderer.text(i);
          break;
        }
        default: {
          let s = 'Token with "' + i.type + '" type was not found.';
          if (this.options.silent) return console.error(s), "";
          throw new Error(s);
        }
      }
    }
    return t;
  }
  parseInline(e, t = this.renderer) {
    this.renderer.parser = this;
    let n = "";
    for (let r = 0; r < e.length; r++) {
      let i = e[r];
      if (this.options.extensions?.renderers?.[i.type]) {
        let a = this.options.extensions.renderers[i.type].call({ parser: this }, i);
        if (a !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(i.type)) {
          n += a || "";
          continue;
        }
      }
      let s = i;
      switch (s.type) {
        case "escape": {
          n += t.text(s);
          break;
        }
        case "html": {
          n += t.html(s);
          break;
        }
        case "link": {
          n += t.link(s);
          break;
        }
        case "image": {
          n += t.image(s);
          break;
        }
        case "checkbox": {
          n += t.checkbox(s);
          break;
        }
        case "strong": {
          n += t.strong(s);
          break;
        }
        case "em": {
          n += t.em(s);
          break;
        }
        case "codespan": {
          n += t.codespan(s);
          break;
        }
        case "br": {
          n += t.br(s);
          break;
        }
        case "del": {
          n += t.del(s);
          break;
        }
        case "text": {
          n += t.text(s);
          break;
        }
        default: {
          let a = 'Token with "' + s.type + '" type was not found.';
          if (this.options.silent) return console.error(a), "";
          throw new Error(a);
        }
      }
    }
    return n;
  }
};
var P = class {
  options;
  block;
  constructor(e) {
    this.options = e || O;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e) {
    return e;
  }
  postprocess(e) {
    return e;
  }
  processAllTokens(e) {
    return e;
  }
  emStrongMask(e) {
    return e;
  }
  provideLexer(e = this.block) {
    return e ? x.lex : x.lexInline;
  }
  provideParser(e = this.block) {
    return e ? b.parse : b.parseInline;
  }
};
var D = class {
  defaults = M();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b;
  Renderer = y;
  TextRenderer = $;
  Lexer = x;
  Tokenizer = w;
  Hooks = P;
  constructor(...e) {
    this.use(...e);
  }
  walkTokens(e, t) {
    let n = [];
    for (let r of e) switch (n = n.concat(t.call(this, r)), r.type) {
      case "table": {
        let i = r;
        for (let s of i.header) n = n.concat(this.walkTokens(s.tokens, t));
        for (let s of i.rows) for (let a of s) n = n.concat(this.walkTokens(a.tokens, t));
        break;
      }
      case "list": {
        let i = r;
        n = n.concat(this.walkTokens(i.items, t));
        break;
      }
      default: {
        let i = r;
        this.defaults.extensions?.childTokens?.[i.type] ? this.defaults.extensions.childTokens[i.type].forEach((s) => {
          let a = i[s].flat(1 / 0);
          n = n.concat(this.walkTokens(a, t));
        }) : i.tokens && (n = n.concat(this.walkTokens(i.tokens, t)));
      }
    }
    return n;
  }
  use(...e) {
    let t = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e.forEach((n) => {
      let r = { ...n };
      if (r.async = this.defaults.async || r.async || false, n.extensions && (n.extensions.forEach((i) => {
        if (!i.name) throw new Error("extension name required");
        if ("renderer" in i) {
          let s = t.renderers[i.name];
          s ? t.renderers[i.name] = function(...a) {
            let o = i.renderer.apply(this, a);
            return o === false && (o = s.apply(this, a)), o;
          } : t.renderers[i.name] = i.renderer;
        }
        if ("tokenizer" in i) {
          if (!i.level || i.level !== "block" && i.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let s = t[i.level];
          s ? s.unshift(i.tokenizer) : t[i.level] = [i.tokenizer], i.start && (i.level === "block" ? t.startBlock ? t.startBlock.push(i.start) : t.startBlock = [i.start] : i.level === "inline" && (t.startInline ? t.startInline.push(i.start) : t.startInline = [i.start]));
        }
        "childTokens" in i && i.childTokens && (t.childTokens[i.name] = i.childTokens);
      }), r.extensions = t), n.renderer) {
        let i = this.defaults.renderer || new y(this.defaults);
        for (let s in n.renderer) {
          if (!(s in i)) throw new Error(`renderer '${s}' does not exist`);
          if (["options", "parser"].includes(s)) continue;
          let a = s, o = n.renderer[a], l = i[a];
          i[a] = (...p) => {
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c || "";
          };
        }
        r.renderer = i;
      }
      if (n.tokenizer) {
        let i = this.defaults.tokenizer || new w(this.defaults);
        for (let s in n.tokenizer) {
          if (!(s in i)) throw new Error(`tokenizer '${s}' does not exist`);
          if (["options", "rules", "lexer"].includes(s)) continue;
          let a = s, o = n.tokenizer[a], l = i[a];
          i[a] = (...p) => {
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c;
          };
        }
        r.tokenizer = i;
      }
      if (n.hooks) {
        let i = this.defaults.hooks || new P();
        for (let s in n.hooks) {
          if (!(s in i)) throw new Error(`hook '${s}' does not exist`);
          if (["options", "block"].includes(s)) continue;
          let a = s, o = n.hooks[a], l = i[a];
          P.passThroughHooks.has(s) ? i[a] = (p) => {
            if (this.defaults.async && P.passThroughHooksRespectAsync.has(s)) return (async () => {
              let d = await o.call(i, p);
              return l.call(i, d);
            })();
            let c = o.call(i, p);
            return l.call(i, c);
          } : i[a] = (...p) => {
            if (this.defaults.async) return (async () => {
              let d = await o.apply(i, p);
              return d === false && (d = await l.apply(i, p)), d;
            })();
            let c = o.apply(i, p);
            return c === false && (c = l.apply(i, p)), c;
          };
        }
        r.hooks = i;
      }
      if (n.walkTokens) {
        let i = this.defaults.walkTokens, s = n.walkTokens;
        r.walkTokens = function(a) {
          let o = [];
          return o.push(s.call(this, a)), i && (o = o.concat(i.call(this, a))), o;
        };
      }
      this.defaults = { ...this.defaults, ...r };
    }), this;
  }
  setOptions(e) {
    return this.defaults = { ...this.defaults, ...e }, this;
  }
  lexer(e, t) {
    return x.lex(e, t ?? this.defaults);
  }
  parser(e, t) {
    return b.parse(e, t ?? this.defaults);
  }
  parseMarkdown(e) {
    return (n, r) => {
      let i = { ...r }, s = { ...this.defaults, ...i }, a = this.onError(!!s.silent, !!s.async);
      if (this.defaults.async === true && i.async === false) return a(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n > "u" || n === null) return a(new Error("marked(): input parameter is undefined or null"));
      if (typeof n != "string") return a(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
      if (s.hooks && (s.hooks.options = s, s.hooks.block = e), s.async) return (async () => {
        let o = s.hooks ? await s.hooks.preprocess(n) : n, p = await (s.hooks ? await s.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(o, s), c = s.hooks ? await s.hooks.processAllTokens(p) : p;
        s.walkTokens && await Promise.all(this.walkTokens(c, s.walkTokens));
        let h = await (s.hooks ? await s.hooks.provideParser(e) : e ? b.parse : b.parseInline)(c, s);
        return s.hooks ? await s.hooks.postprocess(h) : h;
      })().catch(a);
      try {
        s.hooks && (n = s.hooks.preprocess(n));
        let l = (s.hooks ? s.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, s);
        s.hooks && (l = s.hooks.processAllTokens(l)), s.walkTokens && this.walkTokens(l, s.walkTokens);
        let c = (s.hooks ? s.hooks.provideParser(e) : e ? b.parse : b.parseInline)(l, s);
        return s.hooks && (c = s.hooks.postprocess(c)), c;
      } catch (o) {
        return a(o);
      }
    };
  }
  onError(e, t) {
    return (n) => {
      if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
        let r = "<p>An error occurred:</p><pre>" + T(n.message + "", true) + "</pre>";
        return t ? Promise.resolve(r) : r;
      }
      if (t) return Promise.reject(n);
      throw n;
    };
  }
};
var L = new D();
function g(u3, e) {
  return L.parse(u3, e);
}
g.options = g.setOptions = function(u3) {
  return L.setOptions(u3), g.defaults = L.defaults, G(g.defaults), g;
};
g.getDefaults = M;
g.defaults = O;
g.use = function(...u3) {
  return L.use(...u3), g.defaults = L.defaults, G(g.defaults), g;
};
g.walkTokens = function(u3, e) {
  return L.walkTokens(u3, e);
};
g.parseInline = L.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = $;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var Qt = g.options;
var jt = g.setOptions;
var Ft = g.use;
var Ut = g.walkTokens;
var Kt = g.parseInline;
var Xt = b.parse;
var Jt = x.lex;

// node_modules/murm-ui/dist/utils/html.js
var parser = null;
function getParser() {
  parser !== null && parser !== void 0 ? parser : parser = new DOMParser();
  return parser;
}
var ALLOWED_TAGS = /* @__PURE__ */ new Set([
  "P",
  "B",
  "I",
  "STRONG",
  "EM",
  "DEL",
  "A",
  "BR",
  "IMG",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "CODE",
  "BLOCKQUOTE",
  "PRE",
  "HR",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "THEAD",
  "TBODY",
  "TR",
  "TH",
  "TD"
]);
var SAFE_ATTRS = /* @__PURE__ */ new Set(["alt", "title", "align", "start"]);
var URL_PREFIXES = ["http://", "https://", "mailto:"];
var IMG_PREFIXES = ["http://", "https://", "data:image/"];
function renderSafeHTML(targetNode, rawHtml, highlighter) {
  var _a;
  const doc = getParser().parseFromString(rawHtml, "text/html");
  const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  const nodesToEscape = [];
  const blocksToHighlight = [];
  const codeElsToDecorate = [];
  const pendingHighlights = [];
  let node = walker.nextNode();
  while (node) {
    const tagName = node.tagName.toUpperCase();
    if (!ALLOWED_TAGS.has(tagName)) {
      nodesToEscape.push(node);
    } else {
      const isCodeBlock = tagName === "CODE" && ((_a = node.parentElement) === null || _a === void 0 ? void 0 : _a.tagName) === "PRE";
      const codeLanguage = isCodeBlock ? extractCodeLanguage(node) : null;
      if (isCodeBlock && highlighter) {
        blocksToHighlight.push({ el: node, lang: codeLanguage !== null && codeLanguage !== void 0 ? codeLanguage : "" });
      }
      if (isCodeBlock) {
        codeElsToDecorate.push(node);
      }
      const attrs = node.getAttributeNames();
      for (const attr of attrs) {
        const attrLower = attr.toLowerCase();
        if (tagName === "A" && attrLower === "href") {
          const href = node.getAttribute(attr) || "";
          if (!isSafeUrl(href, URL_PREFIXES)) {
            node.removeAttribute(attr);
          }
          continue;
        }
        if (tagName === "IMG" && attrLower === "src") {
          const src = node.getAttribute(attr) || "";
          if (!isSafeUrl(src, IMG_PREFIXES)) {
            node.removeAttribute(attr);
          }
          continue;
        }
        if (tagName === "CODE" && attrLower === "class") {
          continue;
        }
        if (!SAFE_ATTRS.has(attrLower)) {
          node.removeAttribute(attr);
        }
      }
    }
    node = walker.nextNode();
  }
  for (const el2 of nodesToEscape) {
    if (!el2.parentNode)
      continue;
    const textNode = document.createTextNode(el2.outerHTML);
    el2.replaceWith(textNode);
  }
  for (const { el: el2, lang } of blocksToHighlight) {
    const rawCode = el2.textContent || "";
    try {
      const highlightedHTML = highlighter(rawCode, lang);
      if (isPromiseLike(highlightedHTML)) {
        pendingHighlights.push(highlightedHTML.then((html) => {
          applyHighlightedHTML(el2, html);
        }).catch(() => void 0));
        continue;
      }
      applyHighlightedHTML(el2, highlightedHTML);
    } catch (_b) {
    }
  }
  const commit = () => {
    decorateCodeBlocks(codeElsToDecorate);
    targetNode.innerHTML = "";
    while (doc.body.firstChild) {
      targetNode.appendChild(doc.body.firstChild);
    }
  };
  if (pendingHighlights.length > 0) {
    return Promise.all(pendingHighlights).then(commit);
  }
  commit();
}
function applyHighlightedHTML(el2, highlightedHTML) {
  if (!highlightedHTML)
    return;
  el2.innerHTML = highlightedHTML;
}
function isPromiseLike(value) {
  return !!value && typeof value === "object" && "then" in value && typeof value.then === "function";
}
function decorateCodeBlocks(codeEls) {
  var _a;
  for (const codeEl of codeEls) {
    const pre = codeEl.parentElement;
    if (!pre || pre.tagName !== "PRE" || ((_a = pre.parentElement) === null || _a === void 0 ? void 0 : _a.classList.contains("mur-code-block")))
      continue;
    const language = extractCodeLanguage(codeEl);
    const wrapper = codeEl.ownerDocument.createElement("div");
    wrapper.className = "mur-code-block";
    const header = codeEl.ownerDocument.createElement("div");
    header.className = "mur-code-header";
    if (language !== null) {
      const label = codeEl.ownerDocument.createElement("span");
      label.className = "mur-code-language";
      label.textContent = language;
      header.appendChild(label);
    }
    const button = codeEl.ownerDocument.createElement("button");
    button.className = "mur-code-copy-btn";
    button.type = "button";
    button.title = "Copy code";
    button.setAttribute("aria-label", "Copy code");
    button.innerHTML = ICON_COPY;
    header.appendChild(button);
    pre.replaceWith(wrapper);
    wrapper.append(header, pre);
  }
}
function extractCodeLanguage(codeEl) {
  var _a, _b;
  const match = (_a = codeEl.getAttribute("class")) === null || _a === void 0 ? void 0 : _a.match(/(?:^|\s)language-([a-zA-Z0-9+-]+)/);
  return (_b = match === null || match === void 0 ? void 0 : match[1]) !== null && _b !== void 0 ? _b : null;
}
function isSafeUrl(url, allowedPrefixes) {
  const prefix = url.substring(0, 30).trimStart().toLowerCase();
  for (const p of allowedPrefixes) {
    if (prefix.startsWith(p))
      return true;
  }
  return false;
}

// node_modules/murm-ui/dist/components/message-node.js
var MARKDOWN_THROTTLE_MS = 70;
var MessageNode = class {
  constructor(msg, config) {
    this.config = config;
    this.activeBlocks = /* @__PURE__ */ new Map();
    this.cacheError = null;
    this.cacheIsGenerating = false;
    this.cacheActionsVisible = false;
    this.actionsInitialized = false;
    this.currentMsg = null;
    this.isDestroyed = false;
    this.el = document.createElement("div");
    this.el.className = `mur-message mur-message-${msg.role}`;
    if (msg.role === "assistant") {
      this.el.setAttribute("role", "article");
      this.el.setAttribute("aria-label", "AI response");
    }
    this.blocksContainer = el("div", "mur-message-blocks-wrapper");
    this.el.appendChild(this.blocksContainer);
  }
  update(msg, isGenerating, error, messages) {
    this.currentMsg = msg;
    if (this.cacheIsGenerating !== isGenerating) {
      this.el.classList.toggle("mur-generating", isGenerating);
      this.cacheIsGenerating = isGenerating;
    }
    this.renderBlocks(msg, isGenerating, messages);
    this.renderLoading(msg, isGenerating, error);
    this.renderActions(msg, isGenerating);
    this.renderError(error);
  }
  destroy() {
    this.isDestroyed = true;
    for (const state of this.activeBlocks.values()) {
      if (state.timer !== void 0)
        clearTimeout(state.timer);
    }
    this.el.remove();
  }
  renderLoading(msg, isGenerating, error) {
    const hasVisibleBlocks = this.activeBlocks.size > 0;
    const isLoading = isGenerating && !error && msg.role === "assistant" && !hasVisibleBlocks;
    if (isLoading) {
      if (!this.loadingEl) {
        this.loadingEl = el("div", "mur-message-loading", {
          innerHTML: `<span class="mur-loading-dot"></span><span class="mur-loading-dot"></span><span class="mur-loading-dot"></span>`
        });
        this.el.appendChild(this.loadingEl);
      }
    } else if (this.loadingEl) {
      this.loadingEl.remove();
      this.loadingEl = void 0;
    }
  }
  renderBlocks(msg, isGenerating, messages) {
    const visibleBlockIds = /* @__PURE__ */ new Set();
    let displayIndex = 0;
    for (let i = 0; i < msg.blocks.length; i++) {
      const block = msg.blocks[i];
      const isLastBlock = i === msg.blocks.length - 1;
      const isGeneratingBlock = isGenerating && isLastBlock;
      let state = this.activeBlocks.get(block.id);
      let isNew = false;
      if (!state) {
        const container2 = el("div", `mur-content-block mur-block-${block.type}`);
        container2.dataset.blockId = block.id;
        state = { container: container2, textCache: null, renderSeq: 0 };
        isNew = true;
      }
      const container = state.container;
      let handledByPlugin = false;
      let blockRenderCtx;
      for (const plugin of this.config.plugins) {
        if (!plugin.onBlockRender)
          continue;
        blockRenderCtx !== null && blockRenderCtx !== void 0 ? blockRenderCtx : blockRenderCtx = { message: msg, messages, blockIndex: i };
        try {
          if (plugin.onBlockRender(block, container, isGeneratingBlock, blockRenderCtx)) {
            handledByPlugin = true;
            break;
          }
        } catch (error) {
          console.error(`Plugin "${plugin.name}" failed during onBlockRender`, error);
        }
      }
      if (!handledByPlugin) {
        switch (block.type) {
          case "reasoning":
            continue;
          case "text":
            this.renderTextBlock(block, state, isGeneratingBlock);
            break;
          case "file":
            this.renderFileBlock(block, container);
            break;
          case "tool_call":
            container.textContent = `\u{1F6E0} Tool Call: ${block.name} (${block.status})`;
            container.className = `mur-content-block mur-block-tool mur-tool-${block.status}`;
            break;
          case "tool_result":
          case "artifact":
            continue;
        }
      }
      visibleBlockIds.add(block.id);
      if (isNew) {
        this.blocksContainer.appendChild(container);
        this.activeBlocks.set(block.id, state);
      }
      if (this.blocksContainer.children[displayIndex] !== container) {
        this.blocksContainer.insertBefore(container, this.blocksContainer.children[displayIndex]);
      }
      displayIndex++;
    }
    for (const [id, state] of this.activeBlocks.entries()) {
      if (!visibleBlockIds.has(id)) {
        state.container.remove();
        if (state.timer)
          clearTimeout(state.timer);
        this.activeBlocks.delete(id);
      }
    }
  }
  renderTextBlock(block, state, isGeneratingBlock) {
    if (state.textCache === block.text)
      return;
    if (!isGeneratingBlock) {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = void 0;
      }
      state.renderSeq++;
      void this.applyMarkdown(block.id, block.text, state.renderSeq);
      return;
    }
    if (state.timer)
      return;
    state.timer = window.setTimeout(() => {
      state.timer = void 0;
      state.renderSeq++;
      void this.applyMarkdown(block.id, block.text, state.renderSeq);
    }, MARKDOWN_THROTTLE_MS);
  }
  renderFileBlock(block, container) {
    if (container.hasChildNodes())
      return;
    if (block.mimeType.startsWith("image/")) {
      container.appendChild(el("img", "mur-attachment-image", { src: block.data }));
    } else {
      container.appendChild(el("div", "mur-attachment-file-pill", { textContent: `\u{1F4C4} ${block.name || "File"}` }));
    }
  }
  async applyMarkdown(blockId, content, seq) {
    try {
      const html = await g.parse(content);
      const state = this.activeBlocks.get(blockId);
      if (this.isDestroyed || !state || seq !== state.renderSeq)
        return;
      const nextContent = document.createElement("div");
      await renderSafeHTML(nextContent, html, this.config.highlighter);
      if (this.isDestroyed || !state || seq !== state.renderSeq)
        return;
      syncDOMChildren(state.container, nextContent);
      state.textCache = content;
    } catch (error) {
      console.error("Failed to render markdown", error);
    }
  }
  renderError(error) {
    if (!error) {
      if (this.errorEl)
        this.errorEl.hidden = true;
      this.cacheError = null;
      return;
    }
    if (!this.errorEl) {
      this.errorEl = el("div", "mur-message-error");
      this.el.appendChild(this.errorEl);
    }
    if (this.cacheError !== error) {
      this.errorEl.textContent = `\u26A0 ${error}`;
      this.errorEl.hidden = false;
      this.cacheError = error;
    }
  }
  renderActions(msg, isGenerating) {
    var _a, _b;
    const shouldShow = msg.blocks.length > 0;
    if (!shouldShow) {
      if (this.actionsEl && this.cacheActionsVisible) {
        this.actionsEl.hidden = true;
        this.cacheActionsVisible = false;
      }
      return;
    }
    if (isGenerating && !this.actionsInitialized)
      return;
    if (this.actionsInitialized) {
      if (this.actionsEl && !this.cacheActionsVisible) {
        this.actionsEl.hidden = false;
        this.cacheActionsVisible = true;
      }
      return;
    }
    const actionButtons = [];
    for (const plugin of this.config.plugins) {
      let defs = [];
      try {
        defs = (_b = (_a = plugin.getActionButtons) === null || _a === void 0 ? void 0 : _a.call(plugin, msg)) !== null && _b !== void 0 ? _b : [];
      } catch (error) {
        console.error(`Plugin "${plugin.name}" failed during getActionButtons`, error);
      }
      for (const def of defs) {
        actionButtons.push(this.createActionButton(plugin.name, def));
      }
    }
    this.actionsInitialized = true;
    if (actionButtons.length === 0)
      return;
    this.actionsEl = el("div", "mur-message-actions", null, actionButtons);
    this.el.appendChild(this.actionsEl);
    this.cacheActionsVisible = true;
  }
  createActionButton(pluginName, def) {
    const btn = el("button", "mur-action-icon-btn", {
      title: def.title,
      innerHTML: def.iconHtml
    });
    btn.dataset.actionId = def.id;
    btn.dataset.pluginName = pluginName;
    btn.addEventListener("click", () => {
      if (!this.currentMsg)
        return;
      def.onClick({
        message: this.currentMsg,
        buttonEl: btn,
        messageEl: this.el,
        actionId: def.id,
        pluginName
      });
    });
    return btn;
  }
};

// node_modules/murm-ui/dist/components/feed-node.js
function createFeedNode(item, config) {
  return isAgentRunItem(item) ? new AgentRunFeedNode(item, config) : new MessageFeedNode(item, config);
}
var MessageFeedNode = class {
  constructor(message, config) {
    this.type = "message";
    this.messageNode = new MessageNode(message, config);
    this.el = this.messageNode.el;
  }
  update(item, ctx) {
    if (isAgentRunItem(item))
      return;
    updateMessageNode(this.messageNode, item, ctx);
  }
  destroy() {
    this.messageNode.destroy();
  }
};
var AgentRunFeedNode = class {
  constructor(item, config) {
    this.config = config;
    this.type = "agent_run";
    this.el = document.createElement("div");
    this.segmentNodes = /* @__PURE__ */ new Map();
    this.el.className = "mur-agent-run";
    this.el.dataset.runId = item.runId;
  }
  update(item, ctx) {
    if (!isAgentRunItem(item))
      return;
    this.el.dataset.runId = item.runId;
    this.renderUserMessage(item.userMessage, ctx);
    this.renderSegments(item.segments, ctx);
  }
  destroy() {
    var _a;
    (_a = this.userNode) === null || _a === void 0 ? void 0 : _a.destroy();
    for (const node of this.segmentNodes.values()) {
      node.destroy();
    }
    this.segmentNodes.clear();
    this.el.remove();
  }
  renderUserMessage(message, ctx) {
    var _a;
    if (!this.userNode || this.userMessageId !== message.id) {
      (_a = this.userNode) === null || _a === void 0 ? void 0 : _a.destroy();
      this.userNode = new MessageNode(message, this.config);
      this.userMessageId = message.id;
    }
    updateMessageNode(this.userNode, message, ctx);
    if (this.el.firstElementChild !== this.userNode.el) {
      this.el.insertBefore(this.userNode.el, this.el.firstChild);
    }
  }
  renderSegments(segments, ctx) {
    var _a, _b;
    let previousEl = (_b = (_a = this.userNode) === null || _a === void 0 ? void 0 : _a.el) !== null && _b !== void 0 ? _b : null;
    for (const segment of segments) {
      let node = this.segmentNodes.get(segment.id);
      if (!node || node.type !== segment.type) {
        node === null || node === void 0 ? void 0 : node.destroy();
        node = createAgentRunSegmentNode(segment, this.config);
        this.segmentNodes.set(segment.id, node);
      }
      if (node.el.parentElement !== this.el || node.el.previousElementSibling !== previousEl) {
        this.el.insertBefore(node.el, previousEl ? previousEl.nextSibling : this.el.firstChild);
      }
      node.update(segment, ctx);
      previousEl = node.el;
    }
    const currentIds = /* @__PURE__ */ new Set();
    for (const segment of segments) {
      currentIds.add(segment.id);
    }
    for (const [id, node] of this.segmentNodes) {
      if (currentIds.has(id))
        continue;
      node.destroy();
      this.segmentNodes.delete(id);
    }
  }
};
function createAgentRunSegmentNode(segment, config) {
  return segment.type === "work" ? new AgentRunWorkSegmentNode(segment, config) : new AgentRunMessagesSegmentNode(config);
}
var AgentRunMessagesSegmentNode = class {
  constructor(config) {
    this.config = config;
    this.type = "messages";
    this.el = document.createElement("div");
    this.messageNodes = /* @__PURE__ */ new Map();
    this.el.className = "mur-agent-run-messages";
  }
  update(segment, ctx) {
    if (segment.type !== "messages")
      return;
    for (let index = 0; index < segment.messages.length; index++) {
      const message = segment.messages[index];
      const key = messageNodeKey(message);
      let node = this.messageNodes.get(key);
      if (!node) {
        node = new MessageNode(message, this.config);
        this.messageNodes.set(key, node);
      }
      if (this.el.children[index] !== node.el) {
        this.el.insertBefore(node.el, this.el.children[index]);
      }
      updateMessageNode(node, message, ctx);
    }
    const currentIds = /* @__PURE__ */ new Set();
    for (const message of segment.messages) {
      currentIds.add(messageNodeKey(message));
    }
    for (const [id, node] of this.messageNodes) {
      if (currentIds.has(id))
        continue;
      node.destroy();
      this.messageNodes.delete(id);
    }
  }
  destroy() {
    clearMessageNodes(this.messageNodes);
    this.el.remove();
  }
};
var AgentRunWorkSegmentNode = class {
  constructor(segment, config) {
    this.config = config;
    this.type = "work";
    this.el = document.createElement("div");
    this.summaryEl = document.createElement("button");
    this.chevronEl = document.createElement("span");
    this.labelEl = document.createElement("span");
    this.stepsEl = document.createElement("div");
    this.stepNodes = /* @__PURE__ */ new Map();
    this.currentSegmentId = segment.id;
    this.el.className = "mur-agent-run-work";
    this.el.dataset.segmentId = segment.id;
    this.summaryEl.type = "button";
    this.summaryEl.className = "mur-agent-run-summary";
    this.summaryEl.addEventListener("click", () => {
      var _a;
      if (this.currentSegmentId)
        (_a = this.onToggleWorkSegment) === null || _a === void 0 ? void 0 : _a.call(this, this.currentSegmentId);
    });
    this.chevronEl.className = "mur-agent-run-summary-chevron";
    this.chevronEl.innerHTML = ICON_CHEVRON;
    this.labelEl.className = "mur-agent-run-summary-label";
    this.summaryEl.append(this.chevronEl, this.labelEl);
    this.stepsEl.className = "mur-agent-run-steps";
    this.el.append(this.summaryEl, this.stepsEl);
  }
  update(segment, ctx) {
    if (segment.type !== "work")
      return;
    this.currentSegmentId = segment.id;
    this.el.dataset.segmentId = segment.id;
    this.onToggleWorkSegment = ctx.onToggleWorkSegment;
    this.renderSummary(segment);
    this.renderSteps(segment, ctx);
  }
  destroy() {
    clearMessageNodes(this.stepNodes);
    this.el.remove();
  }
  renderSummary(segment) {
    this.labelEl.textContent = formatWorkSummary(segment);
    this.summaryEl.setAttribute("aria-expanded", String(!segment.collapsed));
  }
  renderSteps(segment, ctx) {
    this.stepsEl.hidden = segment.collapsed;
    if (segment.collapsed) {
      clearMessageNodes(this.stepNodes);
      return;
    }
    for (let index = 0; index < segment.stepMessages.length; index++) {
      const message = segment.stepMessages[index];
      const key = messageNodeKey(message);
      let node = this.stepNodes.get(key);
      if (!node) {
        node = new MessageNode(message, this.config);
        this.stepNodes.set(key, node);
      }
      if (this.stepsEl.children[index] !== node.el) {
        this.stepsEl.insertBefore(node.el, this.stepsEl.children[index]);
      }
      updateMessageNode(node, message, ctx);
    }
    const currentIds = /* @__PURE__ */ new Set();
    for (const message of segment.stepMessages) {
      currentIds.add(messageNodeKey(message));
    }
    for (const [id, node] of this.stepNodes) {
      if (currentIds.has(id))
        continue;
      node.destroy();
      this.stepNodes.delete(id);
    }
  }
};
function updateMessageNode(node, message, ctx) {
  var _a;
  const targetError = ((_a = ctx.error) === null || _a === void 0 ? void 0 : _a.id) === message.id ? ctx.error.message : null;
  node.update(message, message.id === ctx.generatingMessageId, targetError, ctx.messages);
}
function messageNodeKey(message) {
  return `${message.id}:${message.blocks.map((block) => block.id).join(",")}`;
}
function clearMessageNodes(nodes) {
  for (const node of nodes.values()) {
    node.destroy();
  }
  nodes.clear();
}
function formatWorkSummary(segment) {
  const durationText = segment.durationMs === void 0 || segment.durationMs <= 0 ? void 0 : formatDuration(segment.durationMs);
  const toolCallCount = countToolCalls(segment);
  if (toolCallCount > 0) {
    return durationText ? `${toolCallCount} ${pluralize("tool call", toolCallCount)}, ${durationText}` : `${toolCallCount} ${pluralize("tool call", toolCallCount)}`;
  }
  if (isReasoningOnlySegment(segment)) {
    return durationText ? `Thought for ${durationText}` : "Thought";
  }
  return durationText ? `Worked for ${durationText}` : "Worked";
}
function countToolCalls(segment) {
  let count = 0;
  for (const message of segment.stepMessages) {
    for (const block of message.blocks) {
      if (block.type === "tool_call")
        count++;
    }
  }
  return count;
}
function isReasoningOnlySegment(segment) {
  let hasReasoning = false;
  for (const message of segment.stepMessages) {
    for (const block of message.blocks) {
      if (block.type !== "reasoning")
        return false;
      hasReasoning = true;
    }
  }
  return hasReasoning;
}
function pluralize(label, count) {
  return count === 1 ? label : `${label}s`;
}
function formatDuration(durationMs) {
  const safeDurationMs = Math.max(0, durationMs);
  if (safeDurationMs < 1e3)
    return `${Math.round(safeDurationMs)}ms`;
  const totalSeconds = Math.round(safeDurationMs / 1e3);
  if (totalSeconds < 60)
    return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

// node_modules/murm-ui/dist/components/feed.js
var STICKY_THRESHOLD = 50;
var OLDER_LOAD_THRESHOLD = 200;
var MOBILE_SCROLL_QUERY = "(max-width: 768px)";
var Feed = class {
  constructor(container, config) {
    var _a;
    this.config = config;
    this.hasMoreOlder = false;
    this.isLoadingOlder = false;
    this.firstMessageId = null;
    this.nodes = /* @__PURE__ */ new Map();
    this.expandedWorkSegmentIds = /* @__PURE__ */ new Set();
    this.feedItemsCache = null;
    this.lastMessagesRef = null;
    this.isStickyToBottom = true;
    this.isHistoryBusy = false;
    this.lastScrollTop = 0;
    this.isDestroyed = false;
    this.onToggleWorkSegment = (segmentId) => this.toggleWorkSegment(segmentId);
    this.lastUpdateRequest = null;
    this.pendingScrollFrame = null;
    this.pendingScrollBehavior = null;
    this.usesWindowScroll = false;
    this.activeScrollTarget = null;
    this.onScroll = () => {
      var _a2, _b;
      const { scrollTop, scrollHeight, clientHeight } = this.getScrollMetrics();
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      const delta = scrollTop - this.lastScrollTop;
      this.lastScrollTop = scrollTop;
      const isScrollingUp = delta < 0;
      if (isScrollingUp && distanceToBottom > STICKY_THRESHOLD) {
        this.isStickyToBottom = false;
      } else if (distanceToBottom <= STICKY_THRESHOLD) {
        this.isStickyToBottom = true;
      }
      if (isScrollingUp && scrollTop <= OLDER_LOAD_THRESHOLD && this.hasMoreOlder && !this.isLoadingOlder) {
        (_b = (_a2 = this.config).onReachTop) === null || _b === void 0 ? void 0 : _b.call(_a2);
      }
    };
    this.onHistoryClick = (event) => {
      var _a2;
      const target = event.target;
      const button = (_a2 = target === null || target === void 0 ? void 0 : target.closest) === null || _a2 === void 0 ? void 0 : _a2.call(target, ".mur-code-copy-btn");
      if (!button || button.tagName !== "BUTTON" || !this.historyContainer.contains(button) || !button.closest(".mur-code-header")) {
        return;
      }
      void this.copyCode(button);
    };
    this.onMediaChange = (event) => {
      this.usesWindowScroll = this.usesFullscreenLayout && event.matches;
      this.syncScrollListener();
      this.lastScrollTop = this.getScrollMetrics().scrollTop;
    };
    this.scrollArea = queryOrThrow(container, ".mur-chat-scroll-area");
    this.historyContainer = queryOrThrow(container, ".mur-chat-history");
    this.mediaQueryList = window.matchMedia(MOBILE_SCROLL_QUERY);
    this.usesFullscreenLayout = config.fullscreen !== false;
    this.usesWindowScroll = this.usesFullscreenLayout && this.mediaQueryList.matches;
    this.historyContainer.addEventListener("click", this.onHistoryClick);
    this.syncScrollListener();
    this.addMediaListener();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.requestBottomScroll("auto");
      });
      this.resizeObserver.observe(this.historyContainer);
      this.resizeObserver.observe(this.scrollArea);
    }
    this.spinnerEl = el("div", "mur-feed-spinner", {
      innerHTML: `<div class="mur-message-loading"><span class="mur-loading-dot"></span><span class="mur-loading-dot"></span><span class="mur-loading-dot"></span></div>`
    });
    this.spinnerEl.hidden = true;
    this.scrollArea.appendChild(this.spinnerEl);
    this.olderSpinnerEl = el("div", "mur-feed-spinner mur-feed-spinner-top", {
      innerHTML: `<div class="mur-feed-older-status" role="status"><span class="mur-message-loading" aria-hidden="true"><span class="mur-loading-dot"></span><span class="mur-loading-dot"></span><span class="mur-loading-dot"></span></span><span>Loading older messages...</span></div>`
    });
    this.olderSpinnerEl.hidden = true;
    (_a = this.historyContainer.parentElement) === null || _a === void 0 ? void 0 : _a.insertBefore(this.olderSpinnerEl, this.historyContainer);
  }
  // Drives the older-messages affordance: whether more history exists and
  // whether a load is in flight. Wired from ChatState by the host.
  setOlderMessagesState(hasMore, isLoading) {
    this.hasMoreOlder = hasMore;
    if (isLoading === this.isLoadingOlder)
      return;
    this.isLoadingOlder = isLoading;
    const before = this.olderSpinnerEl.offsetHeight;
    this.olderSpinnerEl.hidden = !isLoading;
    const delta = this.olderSpinnerEl.offsetHeight - before;
    if (delta !== 0 && !this.isStickyToBottom)
      this.adjustScrollTop(delta);
  }
  update(messages, generatingMessageId, isLoadingSession, generationStarted, error = null) {
    var _a, _b;
    this.lastUpdateRequest = { messages, generatingMessageId, isLoadingSession, error };
    this.syncHistoryBusy(generatingMessageId !== null);
    this.spinnerEl.hidden = !isLoadingSession;
    if (isLoadingSession) {
      this.isStickyToBottom = true;
      this.lastScrollTop = 0;
      this.clearAllNodes();
      this.lastMessagesRef = null;
      this.firstMessageId = null;
      return;
    }
    if (generationStarted) {
      this.isStickyToBottom = true;
    }
    const items = this.getFeedItems(messages, generatingMessageId);
    const previousFirstMessageId = this.firstMessageId;
    const nextFirstMessageId = (_b = (_a = messages[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
    const preservesPrependScroll = !this.isStickyToBottom && previousFirstMessageId !== null && nextFirstMessageId !== null && nextFirstMessageId !== previousFirstMessageId && messages.some((message, index) => index > 0 && message.id === previousFirstMessageId);
    const scrollHeightBefore = preservesPrependScroll ? this.getScrollMetrics().scrollHeight : 0;
    let structureChanged = this.lastMessagesRef !== messages || this.nodes.size > items.length;
    this.lastMessagesRef = messages;
    const nodeUpdateCtx = {
      messages,
      generatingMessageId,
      error,
      onToggleWorkSegment: this.onToggleWorkSegment
    };
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let node = this.nodes.get(item.id);
      if (!node || node.type !== feedItemType(item)) {
        node === null || node === void 0 ? void 0 : node.destroy();
        node = createFeedNode(item, this.config);
        this.nodes.set(item.id, node);
        structureChanged = true;
      }
      if (structureChanged && this.historyContainer.children[i] !== node.el) {
        this.historyContainer.insertBefore(node.el, this.historyContainer.children[i]);
      }
      node.update(item, nodeUpdateCtx);
    }
    if (structureChanged) {
      const currentIds = /* @__PURE__ */ new Set();
      for (const item of items) {
        currentIds.add(item.id);
      }
      for (const [id, node] of this.nodes.entries()) {
        if (!currentIds.has(id)) {
          node.destroy();
          this.nodes.delete(id);
        }
      }
    }
    if (preservesPrependScroll) {
      const delta = this.getScrollMetrics().scrollHeight - scrollHeightBefore;
      if (delta !== 0)
        this.adjustScrollTop(delta);
    }
    this.firstMessageId = nextFirstMessageId;
    const isActivelyStreaming = generatingMessageId !== null && !generationStarted;
    this.requestBottomScroll(isActivelyStreaming ? "auto" : "smooth");
  }
  toggleWorkSegment(segmentId) {
    if (this.expandedWorkSegmentIds.has(segmentId)) {
      this.expandedWorkSegmentIds.delete(segmentId);
    } else {
      this.expandedWorkSegmentIds.add(segmentId);
    }
    this.feedItemsCache = null;
    const request = this.lastUpdateRequest;
    if (!request || this.isDestroyed)
      return;
    this.update(request.messages, request.generatingMessageId, request.isLoadingSession, false, request.error);
  }
  getFeedItems(messages, generatingMessageId) {
    const cached = this.feedItemsCache;
    if (cached && cached.messages === messages && cached.messageCount === messages.length && cached.generatingMessageId === generatingMessageId) {
      return cached.items;
    }
    const items = buildFeedItems(messages, {
      generatingMessageId,
      isWorkSegmentExpanded: (segmentId) => this.expandedWorkSegmentIds.has(segmentId),
      minAgentRunSteps: this.config.minAgentRunSteps,
      agentRunCollapse: this.config.agentRunCollapse
    });
    this.feedItemsCache = {
      messages,
      messageCount: messages.length,
      generatingMessageId,
      items
    };
    return items;
  }
  syncHistoryBusy(isBusy) {
    if (this.isHistoryBusy === isBusy)
      return;
    this.isHistoryBusy = isBusy;
    this.historyContainer.setAttribute("aria-busy", isBusy ? "true" : "false");
  }
  destroy() {
    var _a;
    if (this.isDestroyed)
      return;
    this.isDestroyed = true;
    if (this.pendingScrollFrame !== null) {
      cancelAnimationFrame(this.pendingScrollFrame);
      this.pendingScrollFrame = null;
    }
    this.pendingScrollBehavior = null;
    (_a = this.resizeObserver) === null || _a === void 0 ? void 0 : _a.disconnect();
    this.historyContainer.removeEventListener("click", this.onHistoryClick);
    this.removeActiveScrollListener();
    this.removeMediaListener();
    this.clearAllNodes();
    this.spinnerEl.remove();
    this.olderSpinnerEl.remove();
  }
  clearAllNodes() {
    for (const node of this.nodes.values()) {
      node.destroy();
    }
    this.nodes.clear();
    this.feedItemsCache = null;
    this.historyContainer.innerHTML = "";
  }
  requestBottomScroll(behavior, force = false) {
    if (this.isDestroyed)
      return;
    if (force) {
      this.isStickyToBottom = true;
    } else if (!this.isStickyToBottom) {
      return;
    }
    if (this.pendingScrollBehavior !== "smooth") {
      this.pendingScrollBehavior = behavior;
    }
    this.ensureBottomScrollFrame();
  }
  ensureBottomScrollFrame() {
    if (this.pendingScrollFrame !== null)
      return;
    this.pendingScrollFrame = requestAnimationFrame(() => {
      var _a;
      const behavior = (_a = this.pendingScrollBehavior) !== null && _a !== void 0 ? _a : "auto";
      this.pendingScrollFrame = null;
      this.pendingScrollBehavior = null;
      if (this.isDestroyed || !this.isStickyToBottom)
        return;
      if (this.usesWindowScroll) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior
        });
      } else {
        this.scrollArea.scrollTo({
          top: this.scrollArea.scrollHeight,
          behavior
        });
      }
    });
  }
  async copyCode(button) {
    const codeBlock = button.closest(".mur-code-block");
    const codeEl = codeBlock === null || codeBlock === void 0 ? void 0 : codeBlock.querySelector("pre > code");
    const text = codeEl === null || codeEl === void 0 ? void 0 : codeEl.textContent;
    if (text === void 0 || typeof navigator === "undefined" || !navigator.clipboard)
      return;
    try {
      await navigator.clipboard.writeText(text);
      button.innerHTML = ICON_CHECK;
      window.setTimeout(() => {
        if (button.isConnected) {
          button.innerHTML = ICON_COPY;
        }
      }, 2e3);
    } catch (_a) {
    }
  }
  getScrollMetrics() {
    if (this.usesWindowScroll) {
      const doc = document.documentElement;
      return {
        scrollTop: window.scrollY || doc.scrollTop,
        scrollHeight: doc.scrollHeight,
        clientHeight: window.innerHeight
      };
    }
    return {
      scrollTop: this.scrollArea.scrollTop,
      scrollHeight: this.scrollArea.scrollHeight,
      clientHeight: this.scrollArea.clientHeight
    };
  }
  adjustScrollTop(delta) {
    if (this.usesWindowScroll) {
      window.scrollBy(0, delta);
    } else {
      this.scrollArea.scrollTop += delta;
    }
    this.lastScrollTop = this.getScrollMetrics().scrollTop;
  }
  syncScrollListener() {
    const nextTarget = this.usesWindowScroll ? "window" : "scrollArea";
    if (this.activeScrollTarget === nextTarget)
      return;
    this.removeActiveScrollListener();
    if (nextTarget === "window") {
      window.addEventListener("scroll", this.onScroll, { passive: true });
    } else {
      this.scrollArea.addEventListener("scroll", this.onScroll, { passive: true });
    }
    this.activeScrollTarget = nextTarget;
  }
  removeActiveScrollListener() {
    if (this.activeScrollTarget === "window") {
      window.removeEventListener("scroll", this.onScroll);
    } else if (this.activeScrollTarget === "scrollArea") {
      this.scrollArea.removeEventListener("scroll", this.onScroll);
    }
    this.activeScrollTarget = null;
  }
  addMediaListener() {
    if (typeof this.mediaQueryList.addEventListener === "function") {
      this.mediaQueryList.addEventListener("change", this.onMediaChange);
    } else {
      this.mediaQueryList.addListener(this.onMediaChange);
    }
  }
  removeMediaListener() {
    if (typeof this.mediaQueryList.removeEventListener === "function") {
      this.mediaQueryList.removeEventListener("change", this.onMediaChange);
    } else {
      this.mediaQueryList.removeListener(this.onMediaChange);
    }
  }
};

// node_modules/murm-ui/dist/components/header.js
var Header = class {
  constructor(props) {
    this.props = props;
    this.unsubscribeTitle = () => {
    };
    this.onOpenSidebarBound = (event) => {
      event.stopPropagation();
      this.props.onOpenSidebar();
    };
    this.header = queryOrThrow(props.container, ".mur-main-header");
    this.titleEl = this.header.querySelector(".mur-header-title");
    if (props.enableSidebar) {
      this.openSidebarBtn = queryOrThrow(this.header, ".mur-open-sidebar-btn");
      this.openSidebarBtn.addEventListener("click", this.onOpenSidebarBound);
    }
    if (this.titleEl) {
      this.unsubscribeTitle = props.engine.subscribe((state) => {
        var _a, _b;
        return (_b = (_a = state.sessions.find((session) => session.id === state.currentSessionId)) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : "New Chat";
      }, (title) => this.syncTitle(title));
    }
  }
  destroy() {
    var _a;
    this.unsubscribeTitle();
    (_a = this.openSidebarBtn) === null || _a === void 0 ? void 0 : _a.removeEventListener("click", this.onOpenSidebarBound);
  }
  syncTitle(title) {
    if (this.titleEl) {
      this.titleEl.textContent = title;
    }
  }
};

// node_modules/murm-ui/dist/utils/device.js
var IS_TOUCH_DEVICE = typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window || navigator.maxTouchPoints > 0);

// node_modules/murm-ui/dist/components/input.js
var MESSAGE_INPUT_LABEL = "Message";
var SEND_BUTTON_LABEL = "Send message";
var STOP_BUTTON_LABEL = "Stop generation";
var Input = class {
  constructor(props, plugins = []) {
    this.props = props;
    this.plugins = plugins;
    this.isGenerating = false;
    this.isLoadingSession = false;
    this.hasSubmittableText = false;
    this.focusTimeout = null;
    this.supportsFieldSizing = typeof CSS !== "undefined" && CSS.supports("field-sizing", "content");
    this.onInputBound = this.handleInput.bind(this);
    this.onKeydownBound = this.handleKeydown.bind(this);
    this.onSubmitBound = this.handleFormSubmit.bind(this);
    this.form = queryOrThrow(this.props.container, ".mur-chat-form");
    this.input = queryOrThrow(this.props.container, ".mur-chat-input");
    this.sendBtn = queryOrThrow(this.props.container, ".mur-send-btn");
    this.ensureInputAccessibleName();
    for (const plugin of plugins) {
      if (plugin.onInputMount) {
        try {
          plugin.onInputMount({
            container: this.props.container,
            form: this.form,
            input: this.input,
            requestSubmitStateSync: () => this.syncSubmitState()
          });
        } catch (error) {
          console.error(`Plugin "${plugin.name}" failed during onInputMount`, error);
        }
      }
    }
    this.bindEvents();
    this.refreshTextState();
    this.syncSubmitState();
  }
  focus() {
    this.scheduleFocus();
  }
  setGeneratingState(isGenerating, isLoadingSession) {
    this.isGenerating = isGenerating;
    this.isLoadingSession = isLoadingSession;
    this.sendBtn.classList.toggle("mur-generating", isGenerating);
    this.syncSubmitState();
  }
  setText(text) {
    this.input.value = text;
    if (!this.supportsFieldSizing) {
      this.adjustHeight();
    }
    if (this.refreshTextState()) {
      this.syncSubmitState();
    }
  }
  getText() {
    return this.input.value;
  }
  destroy() {
    this.clearPendingFocus();
    this.input.removeEventListener("input", this.onInputBound);
    this.input.removeEventListener("keydown", this.onKeydownBound);
    this.form.removeEventListener("submit", this.onSubmitBound);
  }
  ensureInputAccessibleName() {
    if (this.input.hasAttribute("aria-label") || this.input.hasAttribute("aria-labelledby"))
      return;
    if (this.input.labels && this.input.labels.length > 0)
      return;
    this.input.setAttribute("aria-label", MESSAGE_INPUT_LABEL);
  }
  clearPendingFocus() {
    if (this.focusTimeout === null)
      return;
    clearTimeout(this.focusTimeout);
    this.focusTimeout = null;
  }
  scheduleFocus() {
    if (IS_TOUCH_DEVICE)
      return;
    this.clearPendingFocus();
    this.focusTimeout = setTimeout(() => {
      this.focusTimeout = null;
      this.input.focus({ preventScroll: true });
    }, 0);
  }
  bindEvents() {
    this.input.addEventListener("input", this.onInputBound);
    this.input.addEventListener("keydown", this.onKeydownBound);
    this.form.addEventListener("submit", this.onSubmitBound);
  }
  handleInput() {
    if (!this.supportsFieldSizing) {
      this.adjustHeight();
    }
    if (this.refreshTextState()) {
      this.syncSubmitState();
    }
  }
  handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !IS_TOUCH_DEVICE) {
      e.preventDefault();
      this.handleSubmit();
    }
  }
  handleFormSubmit(e) {
    e.preventDefault();
    this.handleSubmit();
  }
  adjustHeight() {
    const el2 = this.input;
    el2.style.height = "auto";
    const newHeight = Math.min(el2.scrollHeight, this.getMaxHeight());
    el2.style.height = newHeight + "px";
  }
  getMaxHeight() {
    const maxHeight = Number.parseFloat(window.getComputedStyle(this.input).maxHeight);
    return Number.isFinite(maxHeight) && maxHeight > 0 ? maxHeight : 200;
  }
  handleSubmit() {
    if (this.isGenerating) {
      this.props.onStop();
      return;
    }
    if (this.isLoadingSession) {
      this.syncSubmitState();
      return;
    }
    const textStateChanged = this.refreshTextState();
    const text = this.input.value;
    if (!this.canSubmit()) {
      if (textStateChanged) {
        this.syncSubmitState();
      }
      return;
    }
    if (!this.props.onSubmit(text)) {
      this.syncSubmitState();
      return;
    }
    this.focus();
    this.input.value = "";
    this.refreshTextState();
    if (!this.supportsFieldSizing) {
      this.adjustHeight();
    }
    this.syncSubmitState();
  }
  syncSubmitState() {
    const buttonLabel = this.isGenerating ? STOP_BUTTON_LABEL : SEND_BUTTON_LABEL;
    this.sendBtn.setAttribute("aria-label", buttonLabel);
    this.sendBtn.title = buttonLabel;
    if (this.isGenerating) {
      this.sendBtn.disabled = false;
      return;
    }
    this.sendBtn.disabled = !this.canSubmit();
  }
  canSubmit() {
    return !this.isLoadingSession && !this.isSubmitBlocked() && (this.hasSubmittableText || this.hasPendingPluginData());
  }
  isSubmitBlocked() {
    return this.plugins.some((p) => {
      var _a;
      try {
        return Boolean((_a = p.isSubmitBlocked) === null || _a === void 0 ? void 0 : _a.call(p));
      } catch (error) {
        console.error(`Plugin "${p.name}" failed during isSubmitBlocked`, error);
        return false;
      }
    });
  }
  hasPendingPluginData() {
    return this.plugins.some((p) => {
      var _a;
      try {
        return Boolean((_a = p.hasPendingData) === null || _a === void 0 ? void 0 : _a.call(p));
      } catch (error) {
        console.error(`Plugin "${p.name}" failed during hasPendingData`, error);
        return false;
      }
    });
  }
  refreshTextState() {
    const hasSubmittableText = /\S/.test(this.input.value);
    if (hasSubmittableText === this.hasSubmittableText)
      return false;
    this.hasSubmittableText = hasSubmittableText;
    return true;
  }
};

// node_modules/murm-ui/dist/components/dropdown.js
var activeDropdown = null;
var nextDropdownId = 0;
function showDropdown(trigger, items, options = {}) {
  if (activeDropdown) {
    const wasSameTrigger = activeDropdown.trigger === trigger;
    activeDropdown.cleanup(wasSameTrigger);
    if (wasSameTrigger)
      return;
  }
  const menu = el("div", "mur-dropdown-menu");
  const menuId = `mur-dropdown-${++nextDropdownId}`;
  menu.id = menuId;
  menu.tabIndex = -1;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-orientation", "vertical");
  if (options.width)
    menu.style.width = options.width;
  items.forEach((item) => {
    const btnClass = item.danger ? "mur-dropdown-item mur-danger" : "mur-dropdown-item";
    const btn = el("button", btnClass, {
      type: "button",
      disabled: item.disabled,
      onclick: (e) => {
        e.stopPropagation();
        if (!item.disabled) {
          item.onClick();
          closeDropdown();
        }
      }
    });
    btn.setAttribute("role", "menuitem");
    if (item.iconHtml) {
      btn.appendChild(el("span", "mur-dropdown-icon", { innerHTML: item.iconHtml }));
    }
    btn.appendChild(el("span", "mur-dropdown-label", { textContent: item.label }));
    menu.appendChild(btn);
  });
  const enabledItems = Array.from(menu.querySelectorAll(".mur-dropdown-item:not(:disabled)"));
  const appContainer = trigger.closest(".mur-app") || document.body;
  appContainer.appendChild(menu);
  const previousAriaHasPopup = trigger.getAttribute("aria-haspopup");
  const previousAriaExpanded = trigger.getAttribute("aria-expanded");
  const previousAriaControls = trigger.getAttribute("aria-controls");
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "true");
  trigger.setAttribute("aria-controls", menuId);
  const triggerRect = trigger.getBoundingClientRect();
  const appRect = appContainer.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const top = triggerRect.bottom - appRect.top;
  const left = triggerRect.left - appRect.left;
  if (top + 4 + menuHeight > appRect.height) {
    menu.style.top = `${triggerRect.top - appRect.top - menuHeight - 4}px`;
  } else {
    menu.style.top = `${top + 4}px`;
  }
  const alignRightEdge = options.align === "right" || !options.align && left + menuWidth > appRect.width - 16;
  if (alignRightEdge) {
    const rightOffset = appRect.right - triggerRect.right;
    menu.style.right = `${rightOffset}px`;
    menu.style.left = "auto";
  } else {
    menu.style.left = `${left}px`;
    menu.style.right = "auto";
  }
  const handleOutsidePointerDown = (e) => {
    if (!menu.contains(e.target) && !trigger.contains(e.target)) {
      closeDropdown();
    }
  };
  const handleEsc = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeDropdown(true);
    }
  };
  const focusMenuItem = (offset) => {
    if (enabledItems.length === 0)
      return;
    const currentIndex = enabledItems.indexOf(document.activeElement);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + offset + enabledItems.length) % enabledItems.length;
    enabledItems[nextIndex].focus();
  };
  const handleMenuKeydown = (e) => {
    var _a, _b;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusMenuItem(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusMenuItem(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      (_a = enabledItems[0]) === null || _a === void 0 ? void 0 : _a.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      (_b = enabledItems[enabledItems.length - 1]) === null || _b === void 0 ? void 0 : _b.focus();
    } else if (e.key === "Tab") {
      closeDropdown();
    }
  };
  menu.addEventListener("keydown", handleMenuKeydown);
  menu.focus();
  document.addEventListener("pointerdown", handleOutsidePointerDown);
  document.addEventListener("keydown", handleEsc);
  const cleanup = (restoreFocus = false) => {
    menu.remove();
    menu.removeEventListener("keydown", handleMenuKeydown);
    document.removeEventListener("pointerdown", handleOutsidePointerDown);
    document.removeEventListener("keydown", handleEsc);
    restoreAttribute(trigger, "aria-haspopup", previousAriaHasPopup);
    restoreAttribute(trigger, "aria-expanded", previousAriaExpanded);
    restoreAttribute(trigger, "aria-controls", previousAriaControls);
    if (restoreFocus && trigger.isConnected) {
      trigger.focus();
    }
    if ((activeDropdown === null || activeDropdown === void 0 ? void 0 : activeDropdown.menu) === menu)
      activeDropdown = null;
  };
  activeDropdown = { menu, trigger, cleanup };
}
function closeDropdown(restoreFocus = false) {
  if (activeDropdown) {
    activeDropdown.cleanup(restoreFocus);
  }
}
function restoreAttribute(element, name, value) {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, value);
}

// node_modules/murm-ui/dist/components/sidebar.js
var Sidebar = class {
  constructor(props) {
    this.props = props;
    this.pinnedCount = 0;
    this.onNewChatBound = () => this.props.onNewChat();
    this.onCloseBound = (e) => {
      e.stopPropagation();
      this.props.onClose();
    };
    this.sidebar = queryOrThrow(props.container, ".mur-sidebar");
    this.content = queryOrThrow(this.sidebar, ".mur-sidebar-content");
    this.newChatBtn = this.sidebar.querySelector(".mur-new-chat-btn");
    this.closeBtn = this.sidebar.querySelector(".mur-close-sidebar-btn");
    this.loadMoreTrigger = el("div", "mur-sidebar-load-more-trigger");
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          this.props.onLoadMore();
        }
      }, {
        root: this.content,
        // Watch scrolling inside the sidebar
        rootMargin: "50px"
        // Trigger 50px before it actually becomes visible
      });
    }
    this.bindEvents();
  }
  bindEvents() {
    if (this.newChatBtn) {
      this.newChatBtn.addEventListener("click", this.onNewChatBound);
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener("click", this.onCloseBound);
    }
  }
  renderSessions(sessions, activeId, hasMore, isLoading = false) {
    var _a, _b, _c, _d;
    closeDropdown();
    this.pinnedCount = sessions.filter((session) => session.isPinned).length;
    if (isLoading && sessions.length === 0) {
      replaceNodes(this.content, el("p", "mur-sidebar-status", { textContent: "Loading chats..." }));
      (_a = this.observer) === null || _a === void 0 ? void 0 : _a.unobserve(this.loadMoreTrigger);
      return;
    }
    if (sessions.length === 0) {
      replaceNodes(this.content, el("p", "mur-sidebar-status", { textContent: "No past chats." }));
      (_b = this.observer) === null || _b === void 0 ? void 0 : _b.unobserve(this.loadMoreTrigger);
      return;
    }
    const fragment = document.createDocumentFragment();
    sessions.forEach((session, index) => {
      const isActive = session.id === activeId;
      fragment.appendChild(this.createSessionNode(session, isActive));
      if (session.isPinned && sessions[index + 1] && !sessions[index + 1].isPinned) {
        fragment.appendChild(el("div", "mur-sidebar-pin-divider"));
      }
    });
    if (hasMore) {
      fragment.appendChild(this.loadMoreTrigger);
    }
    replaceNodes(this.content, fragment);
    if (hasMore) {
      (_c = this.observer) === null || _c === void 0 ? void 0 : _c.observe(this.loadMoreTrigger);
    } else {
      (_d = this.observer) === null || _d === void 0 ? void 0 : _d.unobserve(this.loadMoreTrigger);
    }
  }
  createSessionNode(session, isActive) {
    const item = el("div", `mur-sidebar-item ${isActive ? "mur-active" : ""} ${session.isPinned ? "mur-pinned" : ""}`);
    item.setAttribute("data-session-id", session.id);
    const link = this.createSessionLink(session, isActive);
    item.appendChild(link);
    const menuItems = this.getSessionMenuItems(session);
    if (menuItems.length > 0) {
      const optionsBtn = el("button", "mur-sidebar-options-btn", {
        type: "button",
        innerHTML: ICON_MORE_VERTICAL,
        title: `Options for "${session.title}"`,
        onclick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          const currentItems = this.getSessionMenuItems(session);
          if (currentItems.length > 0) {
            showDropdown(optionsBtn, currentItems);
          }
        }
      });
      optionsBtn.setAttribute("aria-label", `Options for chat "${session.title}"`);
      item.appendChild(optionsBtn);
    }
    return item;
  }
  createSessionLink(session, isActive) {
    const link = el("a", "mur-sidebar-item-link", {
      href: this.props.getSessionHref(session.id),
      title: session.title,
      onclick: (e) => {
        e.preventDefault();
        this.props.onSelectSession(session.id);
      }
    });
    if (session.isPinned) {
      const pinIcon = el("span", "mur-sidebar-pin-icon", { innerHTML: ICON_PIN });
      pinIcon.setAttribute("aria-label", "Pinned chat");
      link.appendChild(pinIcon);
    }
    link.appendChild(el("span", "mur-sidebar-item-title", { textContent: session.title }));
    if (isActive) {
      link.setAttribute("aria-current", "page");
    }
    return link;
  }
  startRename(session) {
    const item = Array.from(this.content.querySelectorAll(".mur-sidebar-item")).find((node) => node.getAttribute("data-session-id") === session.id);
    const link = item === null || item === void 0 ? void 0 : item.querySelector(".mur-sidebar-item-link");
    if (!item || !link)
      return;
    item.classList.add("mur-renaming");
    const isActive = link.getAttribute("aria-current") === "page";
    const input = el("input", "mur-sidebar-rename-input", {
      type: "text",
      value: session.title,
      ariaLabel: `Rename chat "${session.title}"`,
      onclick: (e) => e.stopPropagation()
    });
    let finished = false;
    const restore = (title = session.title) => {
      const nextLink = this.createSessionLink({ ...session, title }, isActive);
      item.classList.remove("mur-renaming");
      if (input.isConnected) {
        item.replaceChild(nextLink, input);
      } else {
        const currentLink = item.querySelector(".mur-sidebar-item-link");
        if (currentLink)
          item.replaceChild(nextLink, currentLink);
      }
    };
    const commit = () => {
      if (finished)
        return;
      finished = true;
      const title = input.value.trim();
      if (!title || title === session.title) {
        restore();
        return;
      }
      restore(title);
      void this.props.engine.sessions.updateTitle(session.id, title).catch((error) => {
        console.error(`Failed to rename session "${session.id}"`, error);
        restore();
      });
    };
    const cancel = () => {
      if (finished)
        return;
      finished = true;
      restore();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", commit);
    item.replaceChild(input, link);
    input.focus();
    input.select();
  }
  getSessionMenuItems(session) {
    var _a, _b, _c;
    const isPinned = Boolean(session.isPinned);
    const defaultItems = [
      {
        id: "rename",
        label: "Rename",
        iconHtml: ICON_EDIT,
        onClick: () => {
          this.startRename(session);
        }
      },
      {
        id: isPinned ? "unpin" : "pin",
        label: isPinned ? "Unpin" : "Pin",
        iconHtml: isPinned ? ICON_PIN_OFF : ICON_PIN,
        disabled: !isPinned && this.pinnedCount >= MAX_PINNED_SESSIONS,
        onClick: () => {
          void this.props.engine.sessions.updatePinned(session.id, !isPinned).catch((error) => {
            console.error(`Failed to update pinned state for session "${session.id}"`, error);
          });
        }
      },
      {
        id: "delete",
        label: "Delete",
        iconHtml: ICON_TRASH,
        danger: true,
        onClick: () => {
          void this.confirmAndDelete(session);
        }
      }
    ];
    return (_c = (_b = (_a = this.props).sidebarMenu) === null || _b === void 0 ? void 0 : _b.call(_a, defaultItems, { type: "session", session, engine: this.props.engine })) !== null && _c !== void 0 ? _c : defaultItems;
  }
  async confirmAndDelete(session) {
    try {
      const confirmed = this.props.confirmDelete ? await this.props.confirmDelete(session) : confirm(`Delete chat "${session.title}"? This cannot be undone.`);
      if (!confirmed)
        return;
      await this.props.engine.sessions.delete(session.id);
    } catch (error) {
      console.error(`Failed to delete session "${session.id}"`, error);
    }
  }
  setActiveSession(id) {
    var _a, _b;
    const current = this.content.querySelector(".mur-sidebar-item.mur-active");
    if ((current === null || current === void 0 ? void 0 : current.getAttribute("data-session-id")) === id) {
      return;
    }
    if (current) {
      current.classList.remove("mur-active");
      (_a = current.querySelector(".mur-sidebar-item-link")) === null || _a === void 0 ? void 0 : _a.removeAttribute("aria-current");
    }
    const next = Array.from(this.content.querySelectorAll(".mur-sidebar-item")).find((item) => item.getAttribute("data-session-id") === id);
    if (next) {
      next.classList.add("mur-active");
      (_b = next.querySelector(".mur-sidebar-item-link")) === null || _b === void 0 ? void 0 : _b.setAttribute("aria-current", "page");
    }
  }
  setVisible(isVisible) {
    this.sidebar.hidden = !isVisible;
  }
  destroy() {
    var _a;
    closeDropdown();
    (_a = this.observer) === null || _a === void 0 ? void 0 : _a.disconnect();
    if (this.newChatBtn) {
      this.newChatBtn.removeEventListener("click", this.onNewChatBound);
    }
    if (this.closeBtn) {
      this.closeBtn.removeEventListener("click", this.onCloseBound);
    }
  }
};

// node_modules/murm-ui/dist/router.js
var AppRouter = class {
  constructor(config) {
    this.type = (config === null || config === void 0 ? void 0 : config.type) || "hash";
    if (this.type === "path") {
      this.prefix = (config === null || config === void 0 ? void 0 : config.pathPrefix) || "/c/";
    } else {
      this.prefix = (config === null || config === void 0 ? void 0 : config.pathPrefix) || "#/chat/";
    }
  }
  getId() {
    if (this.type === "none")
      return null;
    if (this.type === "path") {
      const path = window.location.pathname;
      if (path.startsWith(this.prefix)) {
        return this.decodeId(path.slice(this.prefix.length));
      }
    } else if (this.type === "hash") {
      const hash = window.location.hash;
      if (hash.startsWith(this.prefix)) {
        return this.decodeId(hash.slice(this.prefix.length));
      }
    }
    return null;
  }
  hrefFor(id) {
    if (this.type === "none")
      return "#";
    return `${this.prefix}${encodeURIComponent(id)}`;
  }
  setUrl(id, replace = false) {
    if (this.type === "none")
      return;
    const currentId = this.getId();
    if (currentId === id)
      return;
    const newUrl = id ? this.hrefFor(id) : this.emptyUrl();
    if (replace) {
      history.replaceState(null, "", newUrl);
    } else {
      history.pushState(null, "", newUrl);
    }
  }
  listen(onNavigate) {
    if (this.type === "none")
      return;
    this.handleNavigate = () => {
      onNavigate(this.getId());
    };
    for (const eventType of this.eventTypes()) {
      window.addEventListener(eventType, this.handleNavigate);
    }
  }
  destroy() {
    if (this.type === "none" || !this.handleNavigate)
      return;
    for (const eventType of this.eventTypes()) {
      window.removeEventListener(eventType, this.handleNavigate);
    }
    this.handleNavigate = void 0;
  }
  eventTypes() {
    return this.type === "hash" ? ["hashchange", "popstate"] : ["popstate"];
  }
  decodeId(value) {
    try {
      return decodeURIComponent(value);
    } catch (_a) {
      return null;
    }
  }
  emptyUrl() {
    if (this.type === "hash")
      return this.emptyHashUrl();
    return this.emptyPathUrl();
  }
  emptyPathUrl() {
    const trimmed = this.prefix.endsWith("/") ? this.prefix.slice(0, -1) : this.prefix;
    const slashIndex = trimmed.lastIndexOf("/");
    if (slashIndex <= 0)
      return "/";
    return `${trimmed.slice(0, slashIndex)}/`;
  }
  emptyHashUrl() {
    const hashPath = this.prefix.startsWith("#") ? this.prefix.slice(1) : this.prefix;
    const trimmed = hashPath.endsWith("/") ? hashPath.slice(0, -1) : hashPath;
    const slashIndex = trimmed.lastIndexOf("/");
    if (slashIndex <= 0)
      return "#/";
    return `#${trimmed.slice(0, slashIndex)}/`;
  }
};

// node_modules/murm-ui/dist/main.js
var PAGE_SCROLL_CLASS = "mur-chat-page-scroll";
var pageScrollAttachCount = 0;
var ChatUI = class {
  constructor(config) {
    this.plugins = [];
    this.inputDrafts = /* @__PURE__ */ new Map();
    this.unsubscribeWindowTitle = () => {
    };
    this.usesFullscreenLayout = false;
    this.onMainAreaClickBound = () => this.closeSidebar(true);
    this.onSidebarRailClickBound = (event) => this.handleSidebarRailClick(event);
    this.onGlobalErrorCloseBound = (e) => {
      e.stopPropagation();
      this.engine.clearError();
    };
    this.config = { enableSidebar: true, ...config };
    this.usesFullscreenLayout = this.config.fullscreen !== false;
    let routerConfig = { type: "hash" };
    if (this.config.routing === false) {
      routerConfig = { type: "none" };
    } else if (typeof this.config.routing === "object") {
      routerConfig = this.config.routing;
    }
    this.router = new AppRouter(routerConfig);
    const el2 = typeof this.config.container === "string" ? document.querySelector(this.config.container) : this.config.container;
    if (!el2)
      throw new Error(`Chat container not found: ${this.config.container}`);
    this.container = el2;
    if (this.usesFullscreenLayout) {
      attachPageScrollClass();
    }
    const initialSessionId = this.config.initialSessionId || this.router.getId() || null;
    this.engine = new ChatEngine({
      provider: this.config.provider,
      storage: this.config.storage,
      initialSessionId,
      titleOptions: this.config.titleOptions,
      titleInstructions: this.config.titleInstructions
    });
    this.initComponents();
    this.bindEvents();
  }
  async destroy() {
    var _a;
    this.router.destroy();
    this.unsubscribeWindowTitle();
    this.headerComponent.destroy();
    await this.engine.destroy();
    this.elements.globalErrorCloseBtn.removeEventListener("click", this.onGlobalErrorCloseBound);
    if (this.config.enableSidebar) {
      this.elements.mainArea.removeEventListener("click", this.onMainAreaClickBound);
      this.elements.sidebarEl.removeEventListener("click", this.onSidebarRailClickBound);
    }
    for (const plugin of this.plugins) {
      if (!plugin.destroy)
        continue;
      try {
        plugin.destroy();
      } catch (error) {
        console.error(`Plugin "${plugin.name}" failed during destroy`, error);
      }
    }
    (_a = this.sidebarComponent) === null || _a === void 0 ? void 0 : _a.destroy();
    this.feedComponent.destroy();
    this.inputComponent.destroy();
    if (this.usesFullscreenLayout) {
      detachPageScrollClass();
      this.usesFullscreenLayout = false;
    }
  }
  initComponents() {
    this.plugins = this.config.plugins ? this.config.plugins(this.engine) : [];
    this.engine.registerPlugins(this.plugins);
    this.elements = {};
    this.elements.mainArea = queryOrThrow(this.container, ".mur-main-area");
    this.headerComponent = new Header({
      container: this.container,
      engine: this.engine,
      enableSidebar: Boolean(this.config.enableSidebar),
      onOpenSidebar: () => this.openSidebar()
    });
    this.elements.globalErrorText = el("span", "mur-global-error-text");
    this.elements.globalErrorCloseBtn = el("button", "mur-global-error-close", {
      type: "button",
      textContent: "\xD7",
      title: "Dismiss error"
    });
    this.elements.globalErrorCloseBtn.setAttribute("aria-label", "Dismiss error");
    this.elements.globalError = el("div", "mur-global-error", {
      hidden: true
    }, [this.elements.globalErrorText, this.elements.globalErrorCloseBtn]);
    this.elements.globalError.setAttribute("role", "alert");
    this.elements.mainArea.appendChild(this.elements.globalError);
    const pluginCtx = {
      engine: this.engine,
      container: this.container
    };
    for (const plugin of this.plugins) {
      if (!plugin.onMount)
        continue;
      try {
        plugin.onMount(pluginCtx);
      } catch (error) {
        console.error(`Plugin "${plugin.name}" failed during onMount`, error);
      }
    }
    this.inputComponent = new Input({
      container: this.container,
      onSubmit: (text) => this.engine.sendMessage(text),
      onStop: () => {
        void this.engine.stopGeneration();
      }
    }, this.plugins);
    this.feedComponent = new Feed(this.container, {
      highlighter: this.config.highlighter,
      plugins: this.plugins,
      fullscreen: this.usesFullscreenLayout,
      agentRunCollapse: this.config.agentRunCollapse,
      minAgentRunSteps: this.config.minAgentRunSteps,
      onReachTop: () => {
        void this.engine.sessions.loadOlderMessages();
      }
    });
    if (this.config.enableSidebar) {
      this.elements.sidebarEl = queryOrThrow(this.container, ".mur-sidebar");
      this.restoreSidebarState();
      this.sidebarComponent = new Sidebar({
        container: this.container,
        engine: this.engine,
        onNewChat: () => {
          void this.engine.sessions.create();
          this.closeSidebar(true);
        },
        onSelectSession: (id) => {
          void this.engine.sessions.switch(id);
          this.closeSidebar(true);
        },
        onLoadMore: () => {
          void this.engine.sessions.loadMore();
        },
        onClose: () => {
          this.closeSidebar(false);
        },
        getSessionHref: (id) => this.router.hrefFor(id),
        sidebarMenu: this.config.sidebarMenu,
        confirmDelete: this.config.confirmDelete
      });
      void this.engine.sessions.loadHistory();
    }
  }
  restoreSidebarState() {
    const isDesktopClosed = lsGetItem("mur_sidebar_closed") === "true";
    if (!isDesktopClosed || window.innerWidth <= 768)
      return;
    const hadAnimatedSidebar = this.container.classList.contains("mur-sidebar-animated");
    if (hadAnimatedSidebar) {
      this.container.classList.remove("mur-sidebar-animated");
    }
    this.container.classList.add("mur-sidebar-closed");
    if (hadAnimatedSidebar) {
      this.elements.sidebarEl.getBoundingClientRect();
      this.container.classList.add("mur-sidebar-animated");
    }
  }
  bindEvents() {
    this.elements.globalErrorCloseBtn.addEventListener("click", this.onGlobalErrorCloseBound);
    if (this.config.enableSidebar) {
      this.elements.mainArea.addEventListener("click", this.onMainAreaClickBound);
      this.elements.sidebarEl.addEventListener("click", this.onSidebarRailClickBound);
    }
    this.router.listen((id) => {
      if (id) {
        void this.engine.sessions.switch(id);
      } else {
        void this.engine.sessions.create();
      }
    });
    if (this.config.updateWindowTitle) {
      this.unsubscribeWindowTitle = this.engine.subscribe((state) => {
        var _a, _b;
        return (_b = (_a = state.sessions.find((session) => session.id === state.currentSessionId)) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : "New Chat";
      }, (title) => this.syncWindowTitle(title));
    }
    this.engine.subscribe((state) => state.sessions, (sessions) => {
      const state = this.engine.state;
      if (this.config.enableSidebar && this.sidebarComponent) {
        this.sidebarComponent.renderSessions(sessions, state.currentSessionId, state.hasMoreSessions, state.isLoadingSessions);
      }
    });
    this.engine.subscribe((state) => (state.hasMoreSessions ? 1 : 0) | (state.isLoadingSessions ? 2 : 0), () => {
      const state = this.engine.state;
      if (this.config.enableSidebar && this.sidebarComponent) {
        this.sidebarComponent.renderSessions(state.sessions, state.currentSessionId, state.hasMoreSessions, state.isLoadingSessions);
      }
    });
    this.engine.subscribe((state) => state.currentSessionId, (currentSessionId) => {
      if (this.config.enableSidebar && this.sidebarComponent) {
        this.sidebarComponent.setActiveSession(currentSessionId);
      }
      this.syncRouterToState();
    });
    this.engine.subscribe((state) => (state.isLoadingSession ? 1 : 0) | (state.error !== null ? 2 : 0) | (state.messages.length > 0 ? 4 : 0), () => this.syncRouterToState());
    this.engine.subscribe((state) => state.isLoadingSession ? null : state.messages.length === 0, (isEmpty) => {
      if (isEmpty !== null) {
        this.container.classList.toggle("mur-chat-empty", isEmpty);
      }
    });
    let prevIsGenerating = false;
    this.engine.subscribeHot((state) => {
      const isGenerating = state.generatingMessageId !== null;
      const generationStarted = !prevIsGenerating && isGenerating;
      this.feedComponent.update(state.messages, state.generatingMessageId, state.isLoadingSession, generationStarted, state.error);
      prevIsGenerating = isGenerating;
    });
    this.engine.subscribe((state) => (state.hasMoreMessages ? 1 : 0) | (state.isLoadingMessages ? 2 : 0), () => {
      const state = this.engine.state;
      this.feedComponent.setOlderMessagesState(state.hasMoreMessages, state.isLoadingMessages);
    });
    let inputSessionId = this.engine.state.currentSessionId;
    this.engine.onChange((state) => state.currentSessionId, (currentSessionId) => {
      var _a;
      const draft = this.inputComponent.getText();
      if (draft.length > 0) {
        this.inputDrafts.set(inputSessionId, draft);
      } else {
        this.inputDrafts.delete(inputSessionId);
      }
      inputSessionId = currentSessionId;
      this.inputComponent.setText((_a = this.inputDrafts.get(currentSessionId)) !== null && _a !== void 0 ? _a : "");
      this.inputComponent.focus();
    });
    this.engine.subscribe((state) => (state.generatingMessageId ? 2 : 0) | (state.isLoadingSession ? 1 : 0), (bits) => {
      const isGenerating = !!(bits & 2);
      const isLoadingSession = !!(bits & 1);
      this.inputComponent.setGeneratingState(isGenerating, isLoadingSession);
    });
    this.engine.subscribe((state) => state.error, (error) => this.renderGlobalError(error));
    this.renderGlobalError(this.engine.state.error);
  }
  syncWindowTitle(title) {
    if (!this.config.updateWindowTitle)
      return;
    document.title = typeof this.config.updateWindowTitle === "function" ? this.config.updateWindowTitle(title) : title;
  }
  renderGlobalError(error) {
    if (!error || error.id) {
      this.elements.globalError.hidden = true;
      this.elements.globalErrorText.textContent = "";
      return;
    }
    this.elements.globalErrorText.textContent = error.message;
    this.elements.globalError.hidden = false;
  }
  syncRouterToState() {
    const state = this.engine.state;
    const currentUrlId = this.router.getId();
    const isSavedSession = state.sessions.some((s) => s.id === state.currentSessionId);
    const shouldHaveUrlId = state.messages.length > 0 || isSavedSession || state.isLoadingSession && currentUrlId === state.currentSessionId;
    const targetId = shouldHaveUrlId ? state.currentSessionId : null;
    if (currentUrlId === targetId)
      return;
    const isErrorFallback = !shouldHaveUrlId && state.error !== null;
    this.router.setUrl(targetId, isErrorFallback);
  }
  openSidebar() {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      this.elements.sidebarEl.classList.add("mur-mobile-open");
    } else {
      this.container.classList.remove("mur-sidebar-closed");
      lsSetItem("mur_sidebar_closed", "false");
    }
  }
  closeSidebar(isNavigation = false) {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      this.elements.sidebarEl.classList.remove("mur-mobile-open");
      return;
    }
    if (isNavigation)
      return;
    this.container.classList.add("mur-sidebar-closed");
    lsSetItem("mur_sidebar_closed", "true");
  }
  handleSidebarRailClick(event) {
    if (window.innerWidth <= 768)
      return;
    if (!this.container.classList.contains("mur-sidebar-closed"))
      return;
    const target = event.target;
    if (!(target instanceof Element))
      return;
    if (target.closest("button, a, input, textarea, select, [role='button']"))
      return;
    this.openSidebar();
  }
};
function lsGetItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (_a) {
    return null;
  }
}
function lsSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_a) {
  }
}
function attachPageScrollClass() {
  pageScrollAttachCount++;
  document.documentElement.classList.add(PAGE_SCROLL_CLASS);
}
function detachPageScrollClass() {
  pageScrollAttachCount = Math.max(0, pageScrollAttachCount - 1);
  if (pageScrollAttachCount === 0) {
    document.documentElement.classList.remove(PAGE_SCROLL_CLASS);
  }
}

// node_modules/murm-ui/dist/plugins/copy/copy-plugin.js
function CopyPlugin() {
  return {
    name: "copy",
    getActionButtons: (msg) => {
      if (msg.role !== "assistant")
        return [];
      if (typeof navigator === "undefined" || !navigator.clipboard)
        return [];
      if (!extractPlainText(msg).trim())
        return [];
      return [
        {
          id: "copy",
          title: "Copy message",
          iconHtml: ICON_COPY,
          onClick: async ({ message, buttonEl }) => {
            try {
              const textToCopy = extractPlainText(message);
              await navigator.clipboard.writeText(textToCopy);
              buttonEl.innerHTML = ICON_CHECK;
              setTimeout(() => {
                if (buttonEl.isConnected) {
                  buttonEl.innerHTML = ICON_COPY;
                }
              }, 2e3);
            } catch (_a) {
            }
          }
        }
      ];
    }
  };
}

// src/storage-keys.ts
var STORAGE_KEYS = {
  endpoints: "llm_fallbacks_proxy_endpoints",
  guestToken: "llm_fallbacks_guest_token",
  defaultModel: "llm_fallbacks_default_model",
  apiKeys: "llm_fallbacks_api_keys"
};
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// src/config.ts
var LOCALHOST_RE = /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i;
function isLocalEndpoint(url) {
  return LOCALHOST_RE.test(url || "");
}
function normalizeEndpoints(list) {
  if (!Array.isArray(list)) return [];
  return list.map((u3) => String(u3).trim().replace(/\/$/, "")).filter((u3) => u3.length > 0 && !isLocalEndpoint(u3));
}
function readRuntimeConfig() {
  const cfg = window.LLM_FALLBACKS_CONFIG || {};
  const storedEndpoints = loadJson(STORAGE_KEYS.endpoints, []);
  const endpoints = storedEndpoints.length > 0 ? normalizeEndpoints(storedEndpoints) : normalizeEndpoints(cfg.endpoints || []);
  return {
    endpoints,
    guestToken: localStorage.getItem(STORAGE_KEYS.guestToken) || cfg.guestToken || "llm-fallbacks-public",
    defaultModel: localStorage.getItem(STORAGE_KEYS.defaultModel) || cfg.defaultModel || "free",
    catalogUrl: cfg.catalogUrl || "",
    providerUrlsUrl: cfg.providerUrlsUrl || "",
    chatProxyUrl: cfg.chatProxyUrl,
    maxTokens: cfg.maxTokens || 512
  };
}
function seedZeroConfigFromPageConfig() {
  const cfg = window.LLM_FALLBACKS_CONFIG;
  if (!cfg) return;
  if (!localStorage.getItem(STORAGE_KEYS.endpoints) && cfg.endpoints?.length) {
    saveJson(STORAGE_KEYS.endpoints, normalizeEndpoints(cfg.endpoints));
  }
  if (!localStorage.getItem(STORAGE_KEYS.guestToken) && cfg.guestToken) {
    localStorage.setItem(STORAGE_KEYS.guestToken, cfg.guestToken);
  }
  if (!localStorage.getItem(STORAGE_KEYS.defaultModel) && cfg.defaultModel) {
    localStorage.setItem(STORAGE_KEYS.defaultModel, cfg.defaultModel);
  }
}
async function mergeChatProxyArtifact(config) {
  if (!config.chatProxyUrl) return config;
  try {
    const res = await fetch(config.chatProxyUrl);
    if (!res.ok) return config;
    const proxyCfg = await res.json();
    const merged = normalizeEndpoints([
      ...config.endpoints,
      ...proxyCfg.endpoints || []
    ]);
    const unique = [...new Set(merged)];
    return {
      ...config,
      endpoints: unique,
      guestToken: proxyCfg.guestToken || config.guestToken
    };
  } catch {
    return config;
  }
}

// src/providers/browser-router.ts
var RETRYABLE = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
var LOCAL_PROVIDERS = /* @__PURE__ */ new Set(["ollama", "vllm", "lmstudio", "xinference"]);
var MAX_CHAIN = 25;
var PROVIDER_KEY_FIELDS = {
  openrouter: "openrouter",
  groq: "groq",
  cerebras: "cerebras",
  google_ai_studio: "google",
  mistral: "mistral",
  codestral: "mistral",
  deepseek: "deepseek",
  together_ai: "together",
  fireworks_ai: "fireworks",
  sambanova: "sambanova",
  nvidia_nim: "nvidia",
  cohere: "cohere",
  github_models: "github_models",
  huggingface: "huggingface",
  novita: "novita",
  hyperbolic: "hyperbolic",
  nebius: "nebius",
  chutes: "chutes",
  glhf: "glhf",
  featherless: "featherless",
  completions_me: "completions_me"
};
function loadKeys() {
  return loadJson(STORAGE_KEYS.apiKeys, {});
}
function saveKeys(keys) {
  saveJson(STORAGE_KEYS.apiKeys, keys);
}
function hasAnyKey(keys) {
  return Object.values(keys).some((v2) => typeof v2 === "string" && v2.trim().length > 0);
}
function isChatCapable(entry) {
  return entry.mode === "chat" || entry.mode === "responses" || entry.mode === "";
}
function isLocalModel(id) {
  return LOCAL_PROVIDERS.has(id.split("/")[0]) || /^https?:\/\/(127\.|localhost)/.test(id);
}
function resolveApiKey(provider, keys) {
  const field = PROVIDER_KEY_FIELDS[provider] || provider;
  const val = keys[field] || keys[provider];
  return val && String(val).trim() ? String(val).trim() : null;
}
function hasKeyForModel(modelId, keys) {
  const slash = modelId.indexOf("/");
  if (slash <= 0) return false;
  return !!resolveApiKey(modelId.slice(0, slash), keys);
}
function buildFreeChain(catalog, keys) {
  const chain = [];
  for (const entry of catalog) {
    if (!isChatCapable(entry) || isLocalModel(entry.id)) continue;
    if (!hasKeyForModel(entry.id, keys)) continue;
    chain.push(entry.id);
    if (chain.length >= MAX_CHAIN) break;
  }
  return chain;
}
function parseModelId(litellmId) {
  const slash = litellmId.indexOf("/");
  if (slash <= 0) return null;
  return { provider: litellmId.slice(0, slash), apiModel: litellmId.slice(slash + 1) };
}
async function callProvider(modelId, body, keys, providerUrls) {
  const parsed = parseModelId(modelId);
  if (!parsed) return { skipped: true, reason: `invalid model id: ${modelId}` };
  const apiKey = resolveApiKey(parsed.provider, keys);
  if (!apiKey) return { skipped: true, reason: `no API key for ${parsed.provider}` };
  const payload = {
    messages: body.messages,
    max_tokens: body.max_tokens,
    stream: false
  };
  if (parsed.provider === "openrouter") {
    const model = modelId === "openrouter/free" ? "openrouter/free" : modelId.replace(/^openrouter\//, "");
    payload.model = model;
    const res2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": location.origin + location.pathname,
        "X-Title": "llm-fallbacks"
      },
      body: JSON.stringify(payload)
    });
    return { res: res2, route: `browser/openrouter/${model}` };
  }
  const base = providerUrls[parsed.provider] || (parsed.provider === "groq" ? "https://api.groq.com/openai/v1" : null);
  if (!base) return { skipped: true, reason: `unsupported provider: ${parsed.provider}` };
  payload.model = parsed.apiModel;
  const url = base.replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  return { res, route: `browser/${parsed.provider}/${parsed.apiModel}` };
}
function isSkipReason(message) {
  return /^no API key for /i.test(message) || /^unsupported provider:/i.test(message) || /^invalid model id:/i.test(message);
}
async function chatWithBrowserFallback(options) {
  const keys = options.keys || loadKeys();
  if (!hasAnyKey(keys)) throw new Error("BROWSER_UNAVAILABLE");
  const model = options.model || "free";
  const chain = model === "free" ? buildFreeChain(options.catalog, keys) : hasKeyForModel(model, keys) ? [model] : [];
  if (!chain.length) throw new Error("BROWSER_UNAVAILABLE");
  let lastError = "Browser fallback chain exhausted";
  let attempted = false;
  for (const modelId of chain) {
    options.onStatus?.(`browser: ${modelId}`);
    try {
      const result = await callProvider(
        modelId,
        { messages: options.messages, max_tokens: options.maxTokens },
        keys,
        options.providerUrls
      );
      if (result.skipped) continue;
      attempted = true;
      const res = result.res;
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        if (!content) throw new Error("Empty response from browser route");
        return { content, route: result.route };
      }
      const errText = await res.text();
      lastError = `${modelId}: HTTP ${res.status} \u2014 ${errText.slice(0, 160)}`;
      if (!RETRYABLE.has(res.status)) throw new Error(lastError);
    } catch (err) {
      attempted = true;
      lastError = `${modelId}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  if (!attempted) throw new Error("BROWSER_UNAVAILABLE");
  if (isSkipReason(lastError)) throw new Error("BROWSER_UNAVAILABLE");
  throw new Error(lastError);
}
function shouldTryBrowser(model, catalog, keys) {
  if (model === "free") {
    return hasAnyKey(keys) && buildFreeChain(catalog, keys).length > 0;
  }
  return hasAnyKey(keys) && hasKeyForModel(model, keys);
}
function shouldFallbackToProxy(browserErr) {
  const msg = browserErr.message || String(browserErr);
  return msg === "BROWSER_UNAVAILABLE" || msg === "PROXY_UNAVAILABLE" || /^no API key for /i.test(msg) || /^unsupported provider:/i.test(msg);
}

// src/providers/sse.ts
async function parseSSE(response, onMessage) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data && onMessage(data) === true) return;
      }
    }
  }
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data) onMessage(data);
    }
  }
}
function randomId() {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
function emitOpenAiSseAsStreamEvents(response, onEvent) {
  let messageStarted = false;
  let currentMessageId = randomId();
  let currentTextBlockId = null;
  let finishEmitted = false;
  return parseSSE(response, (data) => {
    if (data === "[DONE]") return true;
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const choice = parsed.choices?.[0];
    if (!choice) return;
    if (!messageStarted) {
      onEvent({
        type: "message_start",
        message: { id: currentMessageId, role: "assistant", blocks: [] }
      });
      messageStarted = true;
    }
    const delta = choice.delta ?? {};
    if (delta.content) {
      if (!currentTextBlockId) currentTextBlockId = randomId();
      onEvent({
        type: "text_delta",
        messageId: currentMessageId,
        blockId: currentTextBlockId,
        delta: delta.content
      });
    }
    if (choice.finish_reason && !finishEmitted) {
      const reasonMap = {
        stop: "stop",
        length: "length",
        tool_calls: "tool_use"
      };
      onEvent({
        type: "finish",
        reason: reasonMap[choice.finish_reason] || "stop"
      });
      finishEmitted = true;
    }
  });
}
function emitTextAsStreamEvents(text, onEvent) {
  const messageId = randomId();
  const blockId = randomId();
  onEvent({
    type: "message_start",
    message: { id: messageId, role: "assistant", blocks: [] }
  });
  onEvent({ type: "text_delta", messageId, blockId, delta: text });
  onEvent({ type: "finish", reason: "stop" });
}

// src/providers/FailoverProvider.ts
function endpointUrl(base) {
  const trimmed = base.replace(/\/$/, "");
  return trimmed.endsWith("/v1/chat/completions") ? trimmed : `${trimmed}/v1/chat/completions`;
}
function messagesToOpenAi(messages) {
  return messages.map((m2) => {
    const text = m2.blocks.filter((b2) => b2.type === "text").map((b2) => b2.type === "text" ? b2.text : "").join("");
    return { role: m2.role, content: text };
  });
}
var FailoverProvider = class {
  config;
  catalog = [];
  providerUrls = {};
  statusListeners = /* @__PURE__ */ new Set();
  lastRoute = "";
  constructor(initialConfig) {
    this.config = initialConfig || readRuntimeConfig();
  }
  onStatus(listener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
  getLastRoute() {
    return this.lastRoute;
  }
  updateConfig(config) {
    this.config = config;
  }
  setCatalog(catalog, providerUrls) {
    this.catalog = catalog;
    this.providerUrls = providerUrls;
  }
  setStatus(text) {
    for (const fn of this.statusListeners) fn(text);
  }
  getRuntimeConfig() {
    return readRuntimeConfig();
  }
  async chatViaProxy(base, body, guestToken, signal) {
    return fetch(endpointUrl(base), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${guestToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal
    });
  }
  async streamProxyFallback(body, config, onEvent, signal) {
    if (!config.endpoints.length) throw new Error("PROXY_UNAVAILABLE");
    let lastError = "All proxy endpoints failed";
    for (const base of config.endpoints) {
      this.setStatus(`proxy: ${base} \u2026`);
      try {
        const res = await this.chatViaProxy(base, body, config.guestToken, signal);
        if (res.ok) {
          this.lastRoute = `proxy/${base}`;
          window.LLM_FALLBACKS_ROUTE = this.lastRoute;
          await emitOpenAiSseAsStreamEvents(res, onEvent);
          return;
        }
        const errText = await res.text();
        lastError = `${base}: HTTP ${res.status} \u2014 ${errText.slice(0, 160)}`;
        if (!RETRYABLE.has(res.status)) throw new Error(lastError);
      } catch (err) {
        if (signal.aborted) throw err;
        lastError = `${base}: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    throw new Error(lastError);
  }
  async streamChat(request, onEvent) {
    const config = this.getRuntimeConfig();
    const model = request.options.model || config.defaultModel || "free";
    const openAiMessages = messagesToOpenAi(request.messages);
    const body = {
      model,
      messages: openAiMessages,
      max_tokens: request.options.max_tokens ?? config.maxTokens
    };
    const keys = loadKeys();
    const userKeys = keys;
    const tryBrowser = async () => {
      const result = await chatWithBrowserFallback({
        model,
        messages: openAiMessages,
        maxTokens: body.max_tokens,
        catalog: this.catalog,
        providerUrls: this.providerUrls,
        keys: userKeys,
        onStatus: (s) => this.setStatus(s)
      });
      this.lastRoute = result.route;
      window.LLM_FALLBACKS_ROUTE = result.route;
      emitTextAsStreamEvents(result.content, onEvent);
    };
    if (config.endpoints.length) {
      try {
        await this.streamProxyFallback(body, config, onEvent, request.signal);
        return;
      } catch (proxyErr) {
        if (!shouldTryBrowser(model, this.catalog, userKeys)) throw proxyErr;
        this.setStatus("cloud proxy unavailable \u2014 trying optional browser route \u2026");
      }
    }
    if (model !== "free" && !shouldTryBrowser(model, this.catalog, userKeys)) {
      if (config.endpoints.length) {
        await this.streamProxyFallback({ ...body, model: "free" }, config, onEvent, request.signal);
        return;
      }
      throw new Error(
        "Selected model requires an API key for its provider. Choose free or add the provider key in Settings."
      );
    }
    if (shouldTryBrowser(model, this.catalog, userKeys)) {
      try {
        await tryBrowser();
        return;
      } catch (browserErr) {
        const err = browserErr instanceof Error ? browserErr : new Error(String(browserErr));
        if (config.endpoints.length && shouldFallbackToProxy(err)) {
          this.setStatus("browser route failed \u2014 retrying cloud proxy \u2026");
          await this.streamProxyFallback(body, config, onEvent, request.signal);
          return;
        }
        throw err;
      }
    }
    if (config.endpoints.length) {
      await this.streamProxyFallback(body, config, onEvent, request.signal);
      return;
    }
    throw new Error(
      "No chat routes are available yet. The demo proxy is still deploying \u2014 refresh in a minute."
    );
  }
};

// src/plugins/failover-settings/index.ts
function FailoverSettingsPlugin(deps) {
  return {
    name: "failover-settings",
    onMount() {
      window.registerShellPanel?.("failover", (root) => {
        const config = readRuntimeConfig();
        root.innerHTML = `
          <h3>Failover &amp; Proxy</h3>
          <p class="panel-hint">Cloud proxy routes (one per line). Localhost is blocked.</p>
          <label>Proxy endpoints
            <textarea id="apiHostInput" rows="4" placeholder="https://your-worker.workers.dev"></textarea>
          </label>
          <label>Guest token
            <input id="guestTokenInput" type="password" autocomplete="off" />
          </label>
          <label>Default model
            <input id="defaultModelInput" type="text" value="free" />
          </label>
          <div id="routeStatus" class="panel-status">Route: \u2014</div>
          <button type="button" id="testConnectionBtn">Test connection</button>
          <button type="button" id="saveFailoverBtn">Save</button>
        `;
        const endpointsEl = root.querySelector("#apiHostInput");
        const guestEl = root.querySelector("#guestTokenInput");
        const modelEl = root.querySelector("#defaultModelInput");
        const statusEl = root.querySelector("#routeStatus");
        endpointsEl.value = config.endpoints.join("\n");
        guestEl.value = config.guestToken;
        modelEl.value = config.defaultModel;
        deps.provider.onStatus((s) => {
          statusEl.textContent = `Status: ${s}`;
        });
        const updateRoute = () => {
          const route = deps.provider.getLastRoute() || window.LLM_FALLBACKS_ROUTE || "\u2014";
          statusEl.textContent = `Route: ${route}`;
        };
        setInterval(updateRoute, 1e3);
        root.querySelector("#saveFailoverBtn")?.addEventListener("click", () => {
          const lines = endpointsEl.value.split("\n").map((l) => l.trim()).filter(Boolean);
          const bad = lines.find((l) => isLocalEndpoint(l));
          if (bad) {
            alert(`Localhost endpoints are not allowed: ${bad}`);
            return;
          }
          const endpoints = normalizeEndpoints(lines);
          saveJson(STORAGE_KEYS.endpoints, endpoints);
          localStorage.setItem(STORAGE_KEYS.guestToken, guestEl.value.trim());
          localStorage.setItem(STORAGE_KEYS.defaultModel, modelEl.value.trim() || "free");
          deps.provider.updateConfig(readRuntimeConfig());
          deps.onConfigSaved();
          statusEl.textContent = `Saved ${endpoints.length} endpoint(s)`;
        });
        root.querySelector("#testConnectionBtn")?.addEventListener("click", async () => {
          const endpoints = normalizeEndpoints(
            endpointsEl.value.split("\n").map((l) => l.trim()).filter(Boolean)
          );
          if (!endpoints.length) {
            statusEl.textContent = "No endpoints configured";
            return;
          }
          const base = endpoints[0];
          const url = base.endsWith("/v1/chat/completions") ? base : `${base.replace(/\/$/, "")}/v1/chat/completions`;
          statusEl.textContent = `Testing ${base}\u2026`;
          try {
            const res = await fetch(url, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${guestEl.value.trim()}`,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: "free",
                messages: [{ role: "user", content: "ping" }],
                max_tokens: 8,
                stream: false
              })
            });
            statusEl.textContent = res.ok ? `OK (${res.status})` : `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`;
          } catch (err) {
            statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          }
        });
      });
    }
  };
}

// src/plugins/byok-settings/index.ts
var KEY_LABELS = {
  openrouter: "OpenRouter",
  groq: "Groq",
  google: "Google AI Studio",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  together: "Together AI",
  fireworks: "Fireworks AI"
};
function ByokSettingsPlugin(deps) {
  return {
    name: "byok-settings",
    onMount() {
      window.registerShellPanel?.("byok", (root) => {
        const fields = [...new Set(Object.values(PROVIDER_KEY_FIELDS))];
        root.innerHTML = `
          <h3>Bring Your Own Keys</h3>
          <p class="panel-hint">Optional. Keys stay in this browser only \u2014 never sent to GitHub Pages.</p>
          <form id="byok-form">
            <div id="byok-fields"></div>
            <button type="submit">Save keys</button>
          </form>
        `;
        const form = root.querySelector("#byok-form");
        const fieldsHost = root.querySelector("#byok-fields");
        const keys = loadKeys();
        for (const field of fields) {
          const label = document.createElement("label");
          label.textContent = KEY_LABELS[field] || field;
          const input = document.createElement("input");
          input.type = "password";
          input.name = field;
          input.autocomplete = "off";
          input.value = keys[field] || "";
          if (field === "openrouter") input.id = "keyInput";
          label.appendChild(input);
          fieldsHost.appendChild(label);
        }
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const next = {};
          for (const field of fields) {
            const input = form.querySelector(`[name="${field}"]`);
            if (input?.value.trim()) next[field] = input.value.trim();
          }
          saveKeys(next);
          deps.onKeysSaved();
          const note = document.createElement("p");
          note.className = "panel-status";
          note.textContent = "Keys saved locally.";
          form.after(note);
          setTimeout(() => note.remove(), 3e3);
        });
      });
    }
  };
}

// src/shell-panels.ts
var panels = /* @__PURE__ */ new Map();
function registerShellPanel(id, init) {
  panels.set(id, init);
  const el2 = document.getElementById(`panel-${id}`);
  if (el2) init(el2);
}
function initShellPanels() {
  window.registerShellPanel = registerShellPanel;
  for (const [id, init] of panels) {
    const el2 = document.getElementById(`panel-${id}`);
    if (el2) init(el2);
  }
}
function openShellPanel(id) {
  document.querySelectorAll(".shell-panel").forEach((p) => p.classList.remove("open"));
  const panel = document.getElementById(`shell-panel-${id}`);
  const mask = document.getElementById("sysMask");
  if (panel) panel.classList.add("open");
  if (mask) {
    mask.hidden = false;
  }
  const closeBtn = document.getElementById("closeSet");
  if (closeBtn) closeBtn.style.display = "block";
}
function closeShellPanel(_id) {
  document.querySelectorAll(".shell-panel").forEach((p) => p.classList.remove("open"));
  const mask = document.getElementById("sysMask");
  if (mask) mask.hidden = true;
  const closeBtn = document.getElementById("closeSet");
  if (closeBtn) closeBtn.style.display = "none";
}
function bindTopBarButtons() {
  document.getElementById("sysSetting")?.addEventListener("click", () => openShellPanel("failover"));
  document.getElementById("byokSetting")?.addEventListener("click", () => openShellPanel("byok"));
  document.getElementById("explorerSetting")?.addEventListener("click", () => openShellPanel("explorer"));
  document.getElementById("closeSet")?.addEventListener("click", () => closeShellPanel());
  document.getElementById("sysMask")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeShellPanel();
  });
}

// src/plugins/model-explorer/filters.ts
function getColumns(catalog) {
  if (!catalog.length) return [];
  return Object.keys(catalog[0]);
}
function applyFilter(catalog, filter) {
  const { method, column, value, topN } = filter;
  let rows = [...catalog];
  switch (method) {
    case "value":
      if (value) {
        rows = rows.filter((row) => String(row[column] ?? "") === value);
      }
      break;
    case "regex":
      if (value) {
        const re2 = new RegExp(value, "i");
        rows = rows.filter((row) => re2.test(String(row[column] ?? "")));
      }
      break;
    case "categorical":
      if (value) {
        rows = rows.filter(
          (row) => String(row[column] ?? "").toLowerCase() === value.toLowerCase()
        );
      }
      break;
    case "null":
      rows = rows.filter((row) => {
        const v2 = row[column];
        return v2 === null || v2 === void 0 || v2 === "";
      });
      break;
    case "topn":
      rows = rows.slice().sort((a, b2) => {
        const av = Number(a[column]) || 0;
        const bv = Number(b2[column]) || 0;
        return bv - av;
      }).slice(0, Math.max(1, topN || 10));
      break;
  }
  return rows;
}
function sortRows(catalog, column, direction) {
  return catalog.slice().sort((a, b2) => {
    const av = a[column];
    const bv = b2[column];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = String(av).localeCompare(String(bv), void 0, { numeric: true });
    return direction === "asc" ? cmp : -cmp;
  });
}

// src/plugins/model-explorer/index.ts
function ModelExplorerPlugin(deps) {
  return {
    name: "model-explorer",
    onMount() {
      window.registerShellPanel?.("explorer", (root) => {
        root.innerHTML = `
          <h3>Model Explorer</h3>
          <p class="panel-hint">Browse and filter <code>free_models.json</code>.</p>
          <label>Filter method
            <select id="explorer-method">
              <option value="value">value</option>
              <option value="regex">regex</option>
              <option value="topn">topn</option>
              <option value="categorical">categorical</option>
              <option value="null">null</option>
            </select>
          </label>
          <label>Column <select id="explorer-column"></select></label>
          <label>Value <input id="explorer-value" type="text" placeholder="filter value" /></label>
          <label>Top N <input id="explorer-topn" type="number" min="1" value="10" /></label>
          <button type="button" id="explorer-apply">Apply filter</button>
          <button type="button" id="explorer-reload">Reload catalog</button>
          <div id="explorer-status" class="panel-status"></div>
          <div class="explorer-table-wrap"><table id="explorer-table"><thead></thead><tbody></tbody></table></div>
        `;
        const methodEl = root.querySelector("#explorer-method");
        const columnEl = root.querySelector("#explorer-column");
        const valueEl = root.querySelector("#explorer-value");
        const topNEl = root.querySelector("#explorer-topn");
        const statusEl = root.querySelector("#explorer-status");
        const table = root.querySelector("#explorer-table");
        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");
        let catalog = deps.getCatalog();
        let sortColumn = "quality_score";
        let sortDir = "desc";
        function populateColumns() {
          columnEl.innerHTML = "";
          for (const col of getColumns(catalog)) {
            const opt = document.createElement("option");
            opt.value = col;
            opt.textContent = col;
            columnEl.appendChild(opt);
          }
        }
        function renderTable(rows) {
          const cols = ["id", "provider", "mode", "quality_score"].filter(
            (c) => rows.length === 0 || c in rows[0]
          );
          thead.innerHTML = `<tr>${cols.map(
            (c) => `<th data-col="${c}" style="cursor:pointer">${c}${sortColumn === c ? sortDir === "asc" ? " \u25B2" : " \u25BC" : ""}</th>`
          ).join("")}</tr>`;
          tbody.innerHTML = rows.slice(0, 200).map(
            (row) => `<tr>${cols.map((c) => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("")}</tr>`
          ).join("");
          statusEl.textContent = `${rows.length} model(s) shown${rows.length > 200 ? " (first 200)" : ""}`;
          thead.querySelectorAll("th").forEach((th) => {
            th.addEventListener("click", () => {
              const col = th.getAttribute("data-col");
              if (sortColumn === col) sortDir = sortDir === "asc" ? "desc" : "asc";
              else {
                sortColumn = col;
                sortDir = "desc";
              }
              renderTable(sortRows(rows, sortColumn, sortDir));
            });
          });
        }
        function currentFilter() {
          return {
            method: methodEl.value,
            column: columnEl.value,
            value: valueEl.value.trim(),
            topN: Number(topNEl.value) || 10
          };
        }
        root.querySelector("#explorer-apply")?.addEventListener("click", () => {
          renderTable(applyFilter(catalog, currentFilter()));
        });
        root.querySelector("#explorer-reload")?.addEventListener("click", async () => {
          const url = deps.getCatalogUrl();
          if (!url) return;
          statusEl.textContent = "Loading\u2026";
          try {
            const res = await fetch(url);
            catalog = await res.json();
            populateColumns();
            renderTable(catalog);
          } catch (err) {
            statusEl.textContent = `Load failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        });
        populateColumns();
        renderTable(catalog);
      });
    },
    onInputMount(ctx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mur-toolbar-btn";
      btn.textContent = "Models";
      btn.title = "Open model explorer";
      btn.addEventListener("click", () => openShellPanel("explorer"));
      ctx.container.prepend(btn);
    }
  };
}
function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// src/main.ts
async function loadCatalog() {
  let config = readRuntimeConfig();
  config = await mergeChatProxyArtifact(config);
  let catalog = [];
  let providerUrls = {};
  if (config.catalogUrl) {
    try {
      const res = await fetch(config.catalogUrl);
      if (res.ok) catalog = await res.json();
    } catch {
    }
  }
  if (config.providerUrlsUrl) {
    try {
      const res = await fetch(config.providerUrlsUrl);
      if (res.ok) providerUrls = await res.json();
    } catch {
    }
  }
  return { catalog, providerUrls };
}
function wireChatInputIds(container) {
  const input = container.querySelector(".mur-chat-input");
  const send = container.querySelector(".mur-send-btn");
  if (input && !input.id) input.id = "chatinput";
  if (send && !send.id) send.id = "sendbutton";
}
async function bootstrap() {
  seedZeroConfigFromPageConfig();
  initShellPanels();
  bindTopBarButtons();
  const { catalog, providerUrls } = await loadCatalog();
  const config = readRuntimeConfig();
  const provider = new FailoverProvider(config);
  provider.setCatalog(catalog, providerUrls);
  let catalogRef = catalog;
  const ui = new ChatUI({
    container: "#chatMount",
    provider,
    storage: new IndexedDBStorage(),
    fullscreen: false,
    enableSidebar: true,
    routing: false,
    plugins: (engine) => [
      CopyPlugin(),
      FailoverSettingsPlugin({
        provider,
        onConfigSaved: async () => {
          const refreshed = await loadCatalog();
          catalogRef = refreshed.catalog;
          provider.setCatalog(refreshed.catalog, refreshed.providerUrls);
        }
      }),
      ByokSettingsPlugin({
        onKeysSaved: () => {
          provider.setCatalog(catalogRef, providerUrls);
        }
      }),
      ModelExplorerPlugin({
        getCatalog: () => catalogRef,
        getCatalogUrl: () => readRuntimeConfig().catalogUrl
      })
    ]
  });
  wireChatInputIds(document.querySelector("#chatMount"));
  const observer = new MutationObserver(() => wireChatInputIds(document.querySelector("#chatMount")));
  observer.observe(document.querySelector("#chatMount"), { childList: true, subtree: true });
  void ui;
}
bootstrap().catch((err) => {
  console.error("Chat bootstrap failed", err);
  const mount = document.getElementById("chatMount");
  if (mount) {
    mount.innerHTML = `<p class="boot-error">Failed to load chat: ${err instanceof Error ? err.message : String(err)}</p>`;
  }
});
//# sourceMappingURL=chat.js.map
