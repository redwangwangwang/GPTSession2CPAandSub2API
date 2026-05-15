// ==UserScript==
// @name         GPT Session2CPA/sub2api Converter
// @namespace    https://github.com/redwangwangwang/GPTSession2CPAandSub2API
// @version      0.1.0
// @description  在 ChatGPT 页面本地读取 /api/auth/session，并转换为 sub2api、CPA、Cockpit、9router JSON。
// @author       redwangwangwang, Codex
// @license      MIT
// @homepageURL  https://github.com/redwangwangwang/GPTSession2CPAandSub2API
// @supportURL   https://github.com/redwangwangwang/GPTSession2CPAandSub2API/issues
// @downloadURL  https://raw.githubusercontent.com/redwangwangwang/GPTSession2CPAandSub2API/main/GPTSession2CPAandSub2API.user.js
// @updateURL    https://raw.githubusercontent.com/redwangwangwang/GPTSession2CPAandSub2API/main/GPTSession2CPAandSub2API.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const PANEL_ID = "gpt-session2cpa-userscript-root";
  const SESSION_ENDPOINT = "/api/auth/session";
  const OUTPUT_LABELS = {
    sub2api: "sub2api",
    cpa: "CPA",
    cockpit: "Cockpit",
    "9router": "9router",
  };

  const state = {
    format: "sub2api",
    sessions: [],
    converted: [],
    skipped: [],
    outputText: "",
  };

  let shadow;
  let elements;

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (typeof value === "string" && value.trim() !== "") {
        return value.trim();
      }
    }
    return undefined;
  }

  function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function encodeBase64UrlJson(value) {
    return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  }

  function parseJwtPayload(token) {
    if (typeof token !== "string" || token.trim() === "") {
      return undefined;
    }

    const segments = token.split(".");
    if (segments.length < 2) {
      return undefined;
    }

    try {
      return JSON.parse(decodeBase64Url(segments[1]));
    } catch {
      return undefined;
    }
  }

  function encodeBase64UrlBytes(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function randomBase64Url(byteLength) {
    const bytes = new Uint8Array(byteLength);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      bytes.forEach((_, index) => {
        bytes[index] = Math.floor(Math.random() * 256);
      });
    }
    return encodeBase64UrlBytes(bytes);
  }

  function randomUuid() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    const hex = randomBase64Url(16).replace(/[-_]/g, "").slice(0, 32).padEnd(32, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  function getOpenAIAuthSection(payload) {
    if (!isPlainObject(payload)) {
      return {};
    }

    const auth = payload["https://api.openai.com/auth"];
    return isPlainObject(auth) ? auth : {};
  }

  function getOpenAIProfileSection(payload) {
    if (!isPlainObject(payload)) {
      return {};
    }

    const profile = payload["https://api.openai.com/profile"];
    return isPlainObject(profile) ? profile : {};
  }

  function normalizeTimestamp(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value > 1e11 ? value : value * 1000;
      const date = new Date(milliseconds);
      return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    }

    if (typeof value !== "string" || value.trim() === "") {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  function timestampFromUnixSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return undefined;
    }

    const date = new Date(numeric * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  function epochSecondsFromValue(value) {
    if (value === undefined || value === null || value === "") {
      return 0;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric > 1e11 ? numeric / 1000 : numeric);
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : 0;
  }

  function buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt, sourcePayload = {}) {
    if (!accountId) {
      return undefined;
    }

    const now = Math.trunc(Date.now() / 1000);
    const sourceAuth = getOpenAIAuthSection(sourcePayload);
    const sourceProfile = getOpenAIProfileSection(sourcePayload);
    const issuedAt = Number(sourcePayload?.iat) || now;
    const clientId = firstNonEmpty(sourcePayload?.client_id, "app_X8zY6vW2pQ9tR3dE7nK1jL5gH");
    const tokenEmail = firstNonEmpty(email, sourceProfile.email);
    const tokenUserId = firstNonEmpty(userId, sourceAuth.chatgpt_user_id, sourceAuth.user_id);
    const authInfo = { chatgpt_account_id: accountId };
    const expires = epochSecondsFromValue(expiresAt) || now + 90 * 24 * 60 * 60;

    if (planType) {
      authInfo.chatgpt_plan_type = planType;
    }

    if (tokenUserId) {
      authInfo.chatgpt_user_id = tokenUserId;
      authInfo.user_id = tokenUserId;
    }

    authInfo.groups = sourceAuth.groups || [];
    authInfo.localhost = sourceAuth.localhost ?? true;

    if (sourceAuth.organizations) {
      authInfo.organizations = sourceAuth.organizations;
    }

    const payload = {
      amr: sourceAuth.amr || ["otp", "urn:openai:amr:otp_email"],
      aud: [clientId],
      auth_provider: "passwordless",
      auth_time: Number(sourcePayload?.pwd_auth_time) || issuedAt,
      email: tokenEmail,
      email_verified: sourceProfile.email_verified ?? true,
      exp: expires,
      "https://api.openai.com/auth": authInfo,
      iat: issuedAt,
      iss: sourcePayload?.iss || "https://auth.openai.com",
      jti: randomUuid(),
      name: tokenEmail ? tokenEmail.split("@")[0] : "ChatGPT Account",
      rat: issuedAt,
      sid: sourcePayload?.session_id || randomUuid(),
      sub: sourcePayload?.sub || `auth0|${randomBase64Url(18)}`,
    };

    return `${encodeBase64UrlJson({ alg: "RS256", kid: randomUuid(), typ: "JWT" })}.${encodeBase64UrlJson(payload)}.${randomBase64Url(256)}`;
  }

  function getExpiresIn(expiresAt, now = new Date()) {
    if (!expiresAt) {
      return undefined;
    }

    const expiresMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expiresMs)) {
      return undefined;
    }

    return Math.max(0, Math.floor((expiresMs - now.getTime()) / 1000));
  }

  function stripUnavailable(value) {
    if (Array.isArray(value)) {
      return value.map(stripUnavailable).filter((item) => item !== undefined);
    }

    if (isPlainObject(value)) {
      const entries = Object.entries(value)
        .map(([key, item]) => [key, stripUnavailable(item)])
        .filter(([, item]) => item !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }

    if (value === undefined || value === null || value === "") {
      return undefined;
    }

    return value;
  }

  function toEmailKey(email) {
    if (typeof email !== "string") {
      return undefined;
    }

    return email
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function sanitizeFileToken(value, fallback = "chatgpt-session") {
    const base = firstNonEmpty(value, fallback) || fallback;
    return base
      .replace(/\.[^.]+$/u, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || fallback;
  }

  function getTimestampToken(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("-") + "_" + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("-");
  }

  function formatDisplayDate(value) {
    if (!value) {
      return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const pad = (item) => String(item).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function collectSessionLikeObjects(value, sourceName = "pasted-json") {
    const found = [];
    const visited = new WeakSet();

    function visit(item, path) {
      if (!isPlainObject(item) && !Array.isArray(item)) {
        return;
      }

      if (isPlainObject(item)) {
        if (visited.has(item)) {
          return;
        }
        visited.add(item);

        const token = firstNonEmpty(
          item.accessToken,
          item.access_token,
          item.token?.accessToken,
          item.token?.access_token,
          item.tokens?.accessToken,
          item.tokens?.access_token,
          item.credentials?.accessToken,
          item.credentials?.access_token,
        );
        const hasIdentity = isPlainObject(item.user) || firstNonEmpty(
          item.email,
          item.name,
          item.providerSpecificData?.chatgptAccountId,
          item.providerSpecificData?.chatgpt_account_id,
          item.id,
        );
        if (token && hasIdentity) {
          found.push({ value: item, sourceName, path });
          return;
        }

        for (const [key, child] of Object.entries(item)) {
          if (key === "accessToken" || key === "access_token" || key === "sessionToken" || key === "tokens") {
            continue;
          }
          visit(child, `${path}.${key}`);
        }
        return;
      }

      item.forEach((child, index) => visit(child, `${path}[${index}]`));
    }

    visit(value, "$");
    return found;
  }

  function parseInputDocuments(text, sourceName = "pasted-json") {
    if (typeof text !== "string" || text.trim() === "") {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(`JSON 解析失败：${error.message}`);
    }

    return collectSessionLikeObjects(parsed, sourceName);
  }

  function convertSession(record, options = {}) {
    if (!isPlainObject(record)) {
      throw new Error("session 不是 JSON 对象");
    }

    const accessToken = firstNonEmpty(
      record.accessToken,
      record.access_token,
      record.token?.accessToken,
      record.token?.access_token,
      record.tokens?.accessToken,
      record.tokens?.access_token,
      record.credentials?.accessToken,
      record.credentials?.access_token,
    );
    if (!accessToken) {
      throw new Error("缺少 accessToken");
    }
    const sessionToken = firstNonEmpty(
      record.sessionToken,
      record.session_token,
      record.token?.sessionToken,
      record.token?.session_token,
      record.tokens?.sessionToken,
      record.tokens?.session_token,
      record.credentials?.session_token,
    );
    const refreshToken = firstNonEmpty(
      record.refreshToken,
      record.refresh_token,
      record.token?.refreshToken,
      record.token?.refresh_token,
      record.tokens?.refreshToken,
      record.tokens?.refresh_token,
      record.credentials?.refresh_token,
    );
    const inputIdToken = firstNonEmpty(
      record.idToken,
      record.id_token,
      record.token?.idToken,
      record.token?.id_token,
      record.tokens?.idToken,
      record.tokens?.id_token,
      record.credentials?.id_token,
    );

    const payload = parseJwtPayload(accessToken);
    const idPayload = parseJwtPayload(inputIdToken);
    const auth = getOpenAIAuthSection(payload);
    const idAuth = getOpenAIAuthSection(idPayload);
    const profile = getOpenAIProfileSection(payload);
    const expiresAt = firstNonEmpty(
      payload ? timestampFromUnixSeconds(payload.exp) : undefined,
      normalizeTimestamp(record.expires),
      normalizeTimestamp(record.expiresAt),
      normalizeTimestamp(record.expired),
      normalizeTimestamp(record.expires_at),
    );
    const email = firstNonEmpty(
      record.user?.email,
      record.email,
      record.credentials?.email,
      record.providerSpecificData?.email,
      profile.email,
      idPayload?.email,
      payload?.email,
    );
    const accountId = firstNonEmpty(
      record.account?.id,
      record.account_id,
      record.chatgptAccountId,
      record.providerSpecificData?.chatgptAccountId,
      record.providerSpecificData?.chatgpt_account_id,
      record.credentials?.chatgpt_account_id,
      auth.chatgpt_account_id,
      idAuth.chatgpt_account_id,
      record.provider === "codex" ? record.id : undefined,
    );
    const userId = firstNonEmpty(
      record.user?.id,
      record.user_id,
      record.chatgptUserId,
      record.providerSpecificData?.chatgptUserId,
      record.providerSpecificData?.chatgpt_user_id,
      auth.chatgpt_user_id,
      auth.user_id,
      idAuth.chatgpt_user_id,
      idAuth.user_id,
    );
    const planType = firstNonEmpty(
      record.account?.planType,
      record.account?.plan_type,
      record.planType,
      record.plan_type,
      record.providerSpecificData?.chatgptPlanType,
      record.providerSpecificData?.chatgpt_plan_type,
      record.credentials?.plan_type,
      auth.chatgpt_plan_type,
      idAuth.chatgpt_plan_type,
    );
    const exportedAt = normalizeTimestamp(options.now || new Date());
    const expiresIn = getExpiresIn(expiresAt, options.now || new Date());
    const sourceName = firstNonEmpty(options.sourceName, "pasted-json");
    const sourceType = record.provider === "codex" && record.authType === "oauth"
      ? "9router"
      : isPlainObject(record.tokens)
        ? "cockpit_export"
        : "chatgpt_web_session";
    const name = firstNonEmpty(email, sourceName, "ChatGPT Account");
    const syntheticIdToken = !inputIdToken
      ? buildSyntheticCodexIdToken(email, accountId, planType, userId, expiresAt, payload)
      : undefined;
    const idToken = firstNonEmpty(inputIdToken, syntheticIdToken);

    const cpa = Object.fromEntries(Object.entries({
      type: "codex",
      account_id: accountId,
      chatgpt_account_id: accountId,
      email,
      name,
      plan_type: planType,
      chatgpt_plan_type: planType,
      id_token: idToken,
      id_token_synthetic: Boolean(syntheticIdToken) || undefined,
      access_token: accessToken,
      refresh_token: refreshToken || "",
      session_token: sessionToken,
      last_refresh: exportedAt,
      expired: expiresAt,
      disabled: Boolean(record.disabled) || undefined,
    }).filter(([, value]) => value !== undefined && value !== null));

    const cockpit = {
      type: "codex",
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken || "",
      session_token: sessionToken || undefined,
      account_id: accountId,
      last_refresh: exportedAt,
      email,
      expired: expiresAt,
      account_note: firstNonEmpty(record.account_note, record.accountInfo, record.account_info, record.note, record.notes, record.remark),
    };

    const sub2apiAccount = stripUnavailable({
      name: firstNonEmpty(name, email, sourceName, "ChatGPT Account"),
      platform: "openai",
      type: "oauth",
      concurrency: 10,
      priority: 1,
      credentials: {
        access_token: accessToken,
        refresh_token: refreshToken || undefined,
        id_token: idToken,
        session_token: sessionToken || undefined,
        chatgpt_account_id: accountId,
        chatgpt_user_id: userId,
        email,
        expires_at: expiresAt,
        expires_in: expiresIn,
        plan_type: planType,
      },
      extra: {
        email,
        email_key: toEmailKey(email),
        name,
        auth_provider: firstNonEmpty(record.authProvider, record.auth_provider),
        source: sourceType,
        last_refresh: exportedAt,
      },
    });
    const priority = Number.isFinite(Number(record.priority)) ? Number(record.priority) : 9;
    const isActive = typeof record.isActive === "boolean" ? record.isActive : !Boolean(record.disabled);
    const createdAt = normalizeTimestamp(record.createdAt) || exportedAt;
    const updatedAt = normalizeTimestamp(record.updatedAt) || exportedAt;
    const nineRouter = stripUnavailable({
      accessToken,
      refreshToken,
      expiresAt,
      testStatus: firstNonEmpty(record.testStatus, record.test_status, "active"),
      expiresIn,
      providerSpecificData: {
        chatgptAccountId: accountId,
        chatgptPlanType: planType,
      },
      id: accountId,
      provider: "codex",
      authType: "oauth",
      name,
      email,
      priority,
      isActive,
      createdAt,
      updatedAt,
    });

    return {
      sourceName,
      sourcePath: options.sourcePath,
      email,
      name,
      expiresAt,
      cpa,
      cockpit,
      nineRouter,
      sub2apiAccount,
    };
  }

  function buildSub2apiDocument(converted, now = new Date()) {
    return {
      exported_at: normalizeTimestamp(now),
      proxies: [],
      accounts: converted.map((item) => item.sub2apiAccount),
    };
  }

  function buildOutputDocument() {
    const now = new Date();
    if (state.format === "sub2api") {
      return buildSub2apiDocument(state.converted, now);
    }

    if (state.format === "cpa") {
      return state.converted.length === 1
        ? state.converted[0].cpa
        : state.converted.map((item) => item.cpa);
    }

    if (state.format === "cockpit") {
      return state.converted.length === 1
        ? state.converted[0].cockpit
        : state.converted.map((item) => item.cockpit);
    }

    if (state.format === "9router") {
      return state.converted.length === 1
        ? state.converted[0].nineRouter
        : state.converted.map((item) => item.nineRouter);
    }

    return buildSub2apiDocument(state.converted, now);
  }

  function convertFromText(text, sourceName = "pasted-json") {
    const sources = parseInputDocuments(text, sourceName);
    const converted = [];
    const skipped = [];
    const now = new Date();

    sources.forEach((item, index) => {
      try {
        converted.push(convertSession(item.value, {
          now,
          sourceName: item.sourceName,
          sourcePath: item.path || `$[${index}]`,
        }));
      } catch (error) {
        skipped.push({
          sourceName: item.sourceName,
          path: item.path,
          reason: error instanceof Error ? error.message : "无法转换",
        });
      }
    });

    if (!sources.length) {
      skipped.push({
        sourceName,
        path: "$",
        reason: "未找到包含 accessToken 和 user/email 的 session 对象",
      });
    }

    state.converted = converted;
    state.skipped = skipped;
    state.sessions = sources;
    updateOutput();
  }

  function ensureUi() {
    if (shadow) {
      return;
    }

    const host = document.createElement("div");
    host.id = PANEL_ID;
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        button,
        textarea,
        input {
          font: inherit;
        }

        .fab {
          position: fixed;
          right: 18px;
          bottom: 18px;
          z-index: 2147483647;
          border: 0;
          border-radius: 999px;
          padding: 11px 15px;
          color: #ffffff;
          background: #155eef;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.24);
          cursor: pointer;
          font-size: 13px;
          font-weight: 700;
        }

        .panel {
          position: fixed;
          top: 16px;
          right: 16px;
          z-index: 2147483647;
          width: min(460px, calc(100vw - 32px));
          max-height: calc(100vh - 32px);
          display: none;
          grid-template-rows: auto auto minmax(140px, 1fr) auto minmax(140px, 1fr) auto;
          gap: 10px;
          overflow: hidden;
          border: 1px solid #d7deea;
          border-radius: 8px;
          color: #111827;
          background: #ffffff;
          box-shadow: 0 22px 80px rgba(15, 23, 42, 0.28);
        }

        .panel.is-open {
          display: grid;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 14px 4px;
        }

        .title {
          min-width: 0;
        }

        .title strong {
          display: block;
          font-size: 15px;
          line-height: 1.2;
        }

        .title span {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.35;
        }

        .close {
          width: 30px;
          height: 30px;
          flex: 0 0 auto;
          border: 1px solid #d7deea;
          border-radius: 6px;
          background: #ffffff;
          color: #334155;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .toolbar,
        .footer,
        .formats,
        .stats {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 0 14px;
        }

        .toolbar button,
        .footer button,
        .formats button {
          min-height: 32px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 6px 10px;
          color: #111827;
          background: #ffffff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 650;
        }

        .toolbar button.primary,
        .footer button.primary {
          border-color: #155eef;
          color: #ffffff;
          background: #155eef;
        }

        .toolbar button:disabled,
        .footer button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }

        .formats button[aria-pressed="true"] {
          border-color: #155eef;
          color: #155eef;
          background: #eef4ff;
        }

        .textarea-wrap {
          min-height: 0;
          padding: 0 14px;
        }

        textarea {
          width: 100%;
          height: 100%;
          min-height: 130px;
          resize: vertical;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          padding: 10px;
          color: #0f172a;
          background: #ffffff;
          font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
          font-size: 12px;
          line-height: 1.45;
          outline: none;
        }

        textarea:focus {
          border-color: #155eef;
          box-shadow: 0 0 0 3px rgba(21, 94, 239, 0.12);
        }

        textarea[readonly] {
          background: #f8fafc;
        }

        .status {
          padding: 0 14px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.35;
        }

        .status.ok {
          color: #047857;
        }

        .status.error {
          color: #b42318;
        }

        .stats {
          color: #475569;
          font-size: 12px;
        }

        .stats strong {
          color: #0f172a;
        }

        .accounts,
        .issues {
          margin: 0 14px;
          max-height: 96px;
          overflow: auto;
          border: 1px solid #e2e8f0;
          border-radius: 7px;
          background: #f8fafc;
        }

        .accounts table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11px;
        }

        .accounts th,
        .accounts td {
          overflow: hidden;
          padding: 6px 7px;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .accounts th {
          color: #475569;
          font-weight: 700;
        }

        .issues {
          display: none;
          padding: 8px;
          color: #b42318;
          font-size: 12px;
          line-height: 1.45;
        }

        .issues.is-visible {
          display: block;
        }

        .footer {
          padding-bottom: 14px;
        }

        input[type="file"] {
          display: none;
        }

        @media (max-width: 560px) {
          .panel {
            inset: 8px;
            width: auto;
            max-height: calc(100vh - 16px);
          }
        }
      </style>
      <button class="fab" type="button" data-action="toggle">Session 转换</button>
      <section class="panel" aria-label="GPT Session 转换器">
        <div class="header">
          <div class="title">
            <strong>GPT Session 格式转换</strong>
            <span>本地转换为 sub2api / CPA / Cockpit / 9router，不写入本地存储。</span>
          </div>
          <button class="close" type="button" data-action="close" title="关闭">×</button>
        </div>
        <div class="toolbar">
          <button class="primary" type="button" data-action="fetch">读取当前登录 session</button>
          <button type="button" data-action="read-page">读取本页 JSON</button>
          <button type="button" data-action="pick-files">导入 JSON 文件</button>
          <button type="button" data-action="clear">清空</button>
          <input type="file" accept=".json,application/json" multiple />
        </div>
        <div class="textarea-wrap">
          <textarea data-role="input" spellcheck="false" placeholder="粘贴 ChatGPT /api/auth/session JSON，或点击上方按钮读取当前登录态。"></textarea>
        </div>
        <div class="status" data-role="input-status">等待输入。</div>
        <div class="formats">
          <button type="button" data-format="sub2api" aria-pressed="true">sub2api</button>
          <button type="button" data-format="cpa" aria-pressed="false">CPA</button>
          <button type="button" data-format="cockpit" aria-pressed="false">Cockpit</button>
          <button type="button" data-format="9router" aria-pressed="false">9router</button>
        </div>
        <div class="textarea-wrap">
          <textarea data-role="output" readonly spellcheck="false" placeholder="转换后的 JSON 会显示在这里。"></textarea>
        </div>
        <div class="stats">
          <span>格式：<strong data-role="format">sub2api</strong></span>
          <span>账号：<strong data-role="count">0</strong></span>
          <span>跳过：<strong data-role="errors">0</strong></span>
        </div>
        <div class="accounts">
          <table>
            <thead>
              <tr>
                <th>账号</th>
                <th>邮箱</th>
                <th>过期时间</th>
              </tr>
            </thead>
            <tbody data-role="accounts"></tbody>
          </table>
        </div>
        <div class="issues" data-role="issues"></div>
        <div class="status" data-role="output-status">暂无输出。</div>
        <div class="footer">
          <button type="button" data-action="copy" disabled>复制输出</button>
          <button class="primary" type="button" data-action="download" disabled>下载 JSON</button>
        </div>
      </section>
    `;

    document.documentElement.append(host);

    elements = {
      fab: shadow.querySelector(".fab"),
      panel: shadow.querySelector(".panel"),
      input: shadow.querySelector('[data-role="input"]'),
      output: shadow.querySelector('[data-role="output"]'),
      inputStatus: shadow.querySelector('[data-role="input-status"]'),
      outputStatus: shadow.querySelector('[data-role="output-status"]'),
      format: shadow.querySelector('[data-role="format"]'),
      count: shadow.querySelector('[data-role="count"]'),
      errors: shadow.querySelector('[data-role="errors"]'),
      accounts: shadow.querySelector('[data-role="accounts"]'),
      issues: shadow.querySelector('[data-role="issues"]'),
      copy: shadow.querySelector('[data-action="copy"]'),
      download: shadow.querySelector('[data-action="download"]'),
      fileInput: shadow.querySelector('input[type="file"]'),
      formatButtons: Array.from(shadow.querySelectorAll("[data-format]")),
    };

    bindUiEvents();
    updateOutput();
  }

  function bindUiEvents() {
    shadow.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      if (action === "toggle") {
        togglePanel();
      } else if (action === "close") {
        closePanel();
      } else if (action === "fetch") {
        fetchCurrentSession();
      } else if (action === "read-page") {
        readJsonFromCurrentPage();
      } else if (action === "pick-files") {
        elements.fileInput.click();
      } else if (action === "clear") {
        clearInput();
      } else if (action === "copy") {
        copyOutput();
      } else if (action === "download") {
        downloadOutput();
      }
    });

    elements.input.addEventListener("input", scheduleConvert);
    elements.fileInput.addEventListener("change", (event) => {
      readFiles(event.target.files);
      event.target.value = "";
    });

    elements.formatButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.format = button.dataset.format;
        elements.formatButtons.forEach((item) => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        updateOutput();
      });
    });
  }

  function openPanel() {
    ensureUi();
    elements.panel.classList.add("is-open");
    elements.fab.style.display = "none";
  }

  function closePanel() {
    ensureUi();
    elements.panel.classList.remove("is-open");
    elements.fab.style.display = "";
  }

  function togglePanel() {
    ensureUi();
    if (elements.panel.classList.contains("is-open")) {
      closePanel();
    } else {
      openPanel();
    }
  }

  function setStatus(element, text, tone = "") {
    element.textContent = text;
    element.classList.toggle("ok", tone === "ok");
    element.classList.toggle("error", tone === "error");
  }

  function clearInput() {
    elements.input.value = "";
    state.converted = [];
    state.skipped = [];
    state.sessions = [];
    updateOutput();
    setStatus(elements.inputStatus, "等待输入。");
  }

  function scheduleConvert() {
    const text = elements.input.value;
    if (!text.trim()) {
      clearInput();
      return;
    }

    try {
      convertFromText(text);
      if (state.converted.length) {
        setStatus(elements.inputStatus, `解析完成：${state.converted.length} 个账号，跳过 ${state.skipped.length} 项。`, "ok");
      } else {
        setStatus(elements.inputStatus, "没有可转换账号。", "error");
      }
    } catch (error) {
      state.converted = [];
      state.skipped = [{
        sourceName: "pasted-json",
        path: "$",
        reason: error instanceof Error ? error.message : "JSON 解析失败",
      }];
      state.outputText = "";
      updateOutput();
      setStatus(elements.inputStatus, error instanceof Error ? error.message : "JSON 解析失败", "error");
    }
  }

  function updateOutput() {
    const hasConverted = state.converted.length > 0;
    const outputText = hasConverted ? JSON.stringify(buildOutputDocument(), null, 2) : "";
    state.outputText = outputText;

    elements.output.value = outputText;
    elements.copy.disabled = !outputText;
    elements.download.disabled = !outputText;
    elements.format.textContent = OUTPUT_LABELS[state.format];
    elements.count.textContent = String(state.converted.length);
    elements.errors.textContent = String(state.skipped.length);
    renderAccounts();
    renderIssues();

    if (outputText) {
      setStatus(elements.outputStatus, `已生成 ${state.converted.length} 个账号的 ${OUTPUT_LABELS[state.format]} JSON。`, "ok");
    } else {
      setStatus(elements.outputStatus, "暂无输出。", state.skipped.length ? "error" : "");
    }
  }

  function renderAccounts() {
    elements.accounts.textContent = "";
    if (!state.converted.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 3;
      cell.textContent = "暂无可转换账号。";
      row.append(cell);
      elements.accounts.append(row);
      return;
    }

    state.converted.forEach((item) => {
      const row = document.createElement("tr");
      [item.name || "-", item.email || "-", formatDisplayDate(item.expiresAt) || "-"].forEach((text) => {
        const cell = document.createElement("td");
        cell.textContent = text;
        cell.title = text;
        row.append(cell);
      });
      elements.accounts.append(row);
    });
  }

  function renderIssues() {
    elements.issues.textContent = "";
    elements.issues.classList.toggle("is-visible", state.skipped.length > 0);
    state.skipped.forEach((item) => {
      const line = document.createElement("div");
      line.textContent = `${item.sourceName || "input"} ${item.path || ""}: ${item.reason}`;
      elements.issues.append(line);
    });
  }

  async function fetchCurrentSession() {
    openPanel();
    setStatus(elements.inputStatus, "正在读取当前 ChatGPT 登录 session...");

    try {
      const response = await fetch(SESSION_ENDPOINT, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`读取失败：HTTP ${response.status}`);
      }
      loadText(text, "chatgpt-session");
    } catch (error) {
      setStatus(elements.inputStatus, error instanceof Error ? error.message : "读取 session 失败", "error");
    }
  }

  function readJsonFromCurrentPage() {
    openPanel();
    try {
      const pre = document.querySelector("pre");
      const text = (pre || document.body)?.textContent || "";
      if (!text.trim()) {
        throw new Error("当前页面没有可读取的 JSON 文本");
      }
      loadText(text, location.pathname.includes("/api/auth/session") ? "chatgpt-session" : "current-page");
    } catch (error) {
      setStatus(elements.inputStatus, error instanceof Error ? error.message : "读取本页 JSON 失败", "error");
    }
  }

  function loadText(text, sourceName) {
    elements.input.value = text.trim();
    try {
      convertFromText(elements.input.value, sourceName);
      if (state.converted.length) {
        setStatus(elements.inputStatus, `解析完成：${state.converted.length} 个账号，跳过 ${state.skipped.length} 项。`, "ok");
      } else {
        setStatus(elements.inputStatus, "没有可转换账号。", "error");
      }
    } catch (error) {
      state.converted = [];
      state.skipped = [{
        sourceName,
        path: "$",
        reason: error instanceof Error ? error.message : "JSON 解析失败",
      }];
      updateOutput();
      setStatus(elements.inputStatus, error instanceof Error ? error.message : "JSON 解析失败", "error");
    }
  }

  async function readFiles(files) {
    const jsonFiles = Array.from(files || []).filter((file) => file.name.toLowerCase().endsWith(".json"));
    if (!jsonFiles.length) {
      setStatus(elements.inputStatus, "没有选择 JSON 文件。", "error");
      return;
    }

    const documents = [];
    const skipped = [];

    for (const file of jsonFiles) {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const found = collectSessionLikeObjects(parsed, file.webkitRelativePath || file.name);
        if (!found.length) {
          skipped.push({
            sourceName: file.webkitRelativePath || file.name,
            path: "$",
            reason: "未找到包含 accessToken 和 user/email 的 session 对象",
          });
        }
        documents.push(...found);
      } catch (error) {
        skipped.push({
          sourceName: file.webkitRelativePath || file.name,
          path: "$",
          reason: error instanceof Error ? error.message : "无法读取文件",
        });
      }
    }

    const now = new Date();
    const converted = [];
    const convertSkipped = [...skipped];
    documents.forEach((item) => {
      try {
        converted.push(convertSession(item.value, {
          now,
          sourceName: item.sourceName,
          sourcePath: item.path,
        }));
      } catch (error) {
        convertSkipped.push({
          sourceName: item.sourceName,
          path: item.path,
          reason: error instanceof Error ? error.message : "无法转换",
        });
      }
    });

    state.sessions = documents;
    state.converted = converted;
    state.skipped = convertSkipped;
    elements.input.value = documents.length === 1
      ? JSON.stringify(documents[0].value, null, 2)
      : JSON.stringify(documents.map((item) => item.value), null, 2);
    updateOutput();
    setStatus(elements.inputStatus, `读取 ${jsonFiles.length} 个文件，生成 ${converted.length} 个账号，跳过 ${convertSkipped.length} 项。`, converted.length ? "ok" : "error");
  }

  async function copyOutput() {
    if (!state.outputText) {
      return;
    }

    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(state.outputText, "text");
      } else {
        await navigator.clipboard.writeText(state.outputText);
      }
      setStatus(elements.outputStatus, "已复制到剪贴板。", "ok");
    } catch {
      elements.output.select();
      document.execCommand("copy");
      setStatus(elements.outputStatus, "已复制到剪贴板。", "ok");
    }
  }

  function downloadOutput() {
    if (!state.outputText) {
      return;
    }

    const first = state.converted[0];
    const base = sanitizeFileToken(first?.email || first?.name || state.format);
    const fileName = `${base}.${state.format}.${getTimestampToken()}.json`;
    const blob = new Blob([state.outputText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function init() {
    ensureUi();

    if (typeof GM_registerMenuCommand === "function") {
      GM_registerMenuCommand("打开 GPT Session 转换器", openPanel);
      GM_registerMenuCommand("读取当前 ChatGPT session", fetchCurrentSession);
    }

    if (location.pathname.includes("/api/auth/session")) {
      openPanel();
      readJsonFromCurrentPage();
    }
  }

  init();
})();
