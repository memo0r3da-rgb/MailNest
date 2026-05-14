const PROVIDERS = [
  { name: "mail.gw", baseUrl: "https://api.mail.gw" },
  { name: "mail.tm", baseUrl: "https://api.mail.tm" },
];
const STORAGE_KEY = "mailnest.currentMailbox";
const POLL_MS = 12000;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

const state = {
  mailbox: null,
  messages: [],
  selectedMessageId: null,
  poller: null,
  timer: null,
  busy: false,
};

const els = {
  emailAddress: document.querySelector("#emailAddress"),
  statusText: document.querySelector("#statusText"),
  timerText: document.querySelector("#timerText"),
  copyEmail: document.querySelector("#copyEmail"),
  generateEmail: document.querySelector("#generateEmail"),
  refreshInbox: document.querySelector("#refreshInbox"),
  refreshInboxSmall: document.querySelector("#refreshInboxSmall"),
  changeEmail: document.querySelector("#changeEmail"),
  deleteEmail: document.querySelector("#deleteEmail"),
  newEmailTop: document.querySelector("#newEmailTop"),
  messageList: document.querySelector("#messageList"),
  messageCount: document.querySelector("#messageCount"),
  emptyState: document.querySelector("#emptyState"),
  messageDetail: document.querySelector("#messageDetail"),
  deleteMessage: document.querySelector("#deleteMessage"),
  themeToggle: document.querySelector("#themeToggle"),
  toast: document.querySelector("#toast"),
};

function init() {
  hydrateTheme();
  hydrateMailbox();
  bindEvents();
  renderMailbox();
  renderMessages();
  startTimer();

  if (state.mailbox?.token) {
    refreshMessages();
    startPolling();
  }

  refreshIcons();
}

function bindEvents() {
  els.generateEmail.addEventListener("click", () => createMailbox());
  els.newEmailTop.addEventListener("click", () => createMailbox({ replace: true }));
  els.changeEmail.addEventListener("click", () => createMailbox({ replace: true }));
  els.refreshInbox.addEventListener("click", () => refreshMessages(true));
  els.refreshInboxSmall.addEventListener("click", () => refreshMessages(true));
  els.copyEmail.addEventListener("click", copyCurrentEmail);
  els.deleteEmail.addEventListener("click", deleteCurrentMailbox);
  els.deleteMessage.addEventListener("click", deleteSelectedMessage);
}

function hydrateTheme() {
  const saved = localStorage.getItem("mailnest.theme");
  if (saved === "dark") {
    document.documentElement.classList.add("dark");
  }
}

function toggleTheme() {
  document.documentElement.classList.toggle("dark");
  localStorage.setItem(
    "mailnest.theme",
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
  refreshIcons();
}

function hydrateMailbox() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.mailbox = raw ? JSON.parse(raw) : null;
    if (state.mailbox?.createdAt && state.mailbox.expiresAt - state.mailbox.createdAt > DEFAULT_TTL_MS) {
      state.mailbox.expiresAt = state.mailbox.createdAt + DEFAULT_TTL_MS;
      persistMailbox();
    }
  } catch {
    state.mailbox = null;
  }
}

function persistMailbox() {
  if (!state.mailbox) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.mailbox));
}

async function api(path, options = {}, baseUrl = state.mailbox?.baseUrl || PROVIDERS[0].baseUrl) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(state.mailbox?.token ? { Authorization: `Bearer ${state.mailbox.token}` } : {}),
    ...options.headers,
  };

  Object.keys(headers).forEach((key) => {
    if (headers[key] === undefined || headers[key] === null) {
      delete headers[key];
    }
  });

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = data["hydra:description"] || data.detail || data.message || "تعذر تنفيذ الطلب";
      throw new Error(detail);
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("انتهت مهلة الاتصال بالخدمة");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function createMailbox({ replace = false } = {}) {
  if (state.busy) return;
  setBusy(true);

  try {
    if (replace && state.mailbox?.id) {
      await deleteMailboxRemote({ silent: true });
    }

    updateStatus("جاري جلب الدومينات...");
    const providerData = await getAvailableProvider();
    const activeDomain = providerData.domain;

    const localPart = generateLocalPart();
    const password = cryptoRandom(18);
    const address = `${localPart}@${activeDomain}`;

    updateStatus(`جاري إنشاء البريد عبر ${providerData.provider.name}...`);
    const account = await api("/accounts", {
      method: "POST",
      headers: { Authorization: undefined },
      body: JSON.stringify({ address, password }),
    }, providerData.provider.baseUrl);

    updateStatus("جاري تفعيل الجلسة...");
    const tokenData = await api("/token", {
      method: "POST",
      headers: { Authorization: undefined },
      body: JSON.stringify({ address, password }),
    }, providerData.provider.baseUrl);

    const now = Date.now();
    const retentionMs = account.retentionAt ? new Date(account.retentionAt).getTime() : now + DEFAULT_TTL_MS;
    const sessionExpiresAt = Number.isFinite(retentionMs)
      ? Math.min(retentionMs, now + DEFAULT_TTL_MS)
      : now + DEFAULT_TTL_MS;

    state.mailbox = {
      id: account.id || tokenData.id,
      address,
      password,
      token: tokenData.token,
      provider: providerData.provider.name,
      baseUrl: providerData.provider.baseUrl,
      createdAt: now,
      expiresAt: sessionExpiresAt,
    };
    state.messages = [];
    state.selectedMessageId = null;
    persistMailbox();
    renderMailbox();
    renderMessages();
    renderEmptyDetail();
    startPolling();
    startTimer();
    await refreshMessages();
    showToast("تم توليد بريد جديد بنجاح");
  } catch (error) {
    showToast(error.message || "حدث خطأ أثناء توليد البريد");
    updateStatus("تعذر التوليد");
  } finally {
    setBusy(false);
  }
}

async function getAvailableProvider() {
  const errors = [];

  for (const provider of PROVIDERS) {
    try {
      const domainsResponse = await api("/domains?page=1", {
        headers: { Authorization: undefined },
      }, provider.baseUrl);
      const domains = Array.isArray(domainsResponse) ? domainsResponse : domainsResponse["hydra:member"] || [];
      const activeDomain = domains.find((item) => item.isActive !== false)?.domain || domains[0]?.domain;

      if (activeDomain) {
        return { provider, domain: activeDomain };
      }

      errors.push(`${provider.name}: لا توجد دومينات متاحة`);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(errors.join(" | ") || "لا توجد دومينات متاحة حاليا");
}

async function refreshMessages(manual = false) {
  if (!state.mailbox?.token) {
    if (manual) showToast("ولد بريدا أولا لاستقبال الرسائل");
    return;
  }

  try {
    updateStatus("جاري تحديث الرسائل...");
    const data = await api("/messages?page=1");
    state.messages = Array.isArray(data) ? data : data["hydra:member"] || [];
    renderMessages();
    updateStatus(`الصندوق متصل عبر ${state.mailbox.provider || "mail.gw"}`);
    if (manual) showToast("تم تحديث الصندوق");
  } catch (error) {
    updateStatus("تعذر تحديث الرسائل");
    if (manual) showToast(error.message || "لم نتمكن من تحديث الرسائل");
  }
}

async function openMessage(messageId) {
  if (!state.mailbox?.token) return;
  state.selectedMessageId = messageId;
  renderMessages();
  renderDetailLoading();

  try {
    const message = await api(`/messages/${messageId}`);
    renderMessageDetail(message);
    await api(`/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/merge-patch+json" },
      body: JSON.stringify({ seen: true }),
    }).catch(() => null);
    refreshMessages();
  } catch (error) {
    renderDetailError(error.message || "تعذر فتح الرسالة");
  }
}

async function deleteSelectedMessage() {
  if (!state.selectedMessageId) return;

  try {
    await api(`/messages/${state.selectedMessageId}`, { method: "DELETE" });
    state.selectedMessageId = null;
    renderEmptyDetail();
    await refreshMessages();
    showToast("تم حذف الرسالة");
  } catch (error) {
    showToast(error.message || "تعذر حذف الرسالة");
  }
}

async function deleteCurrentMailbox() {
  if (!state.mailbox) {
    showToast("لا يوجد بريد لحذفه");
    return;
  }

  setBusy(true);
  try {
    await deleteMailboxRemote();
    clearMailboxLocal();
    showToast("تم حذف البريد الحالي");
  } catch (error) {
    clearMailboxLocal();
    showToast(error.message || "تم حذف الجلسة محليا");
  } finally {
    setBusy(false);
  }
}

async function deleteMailboxRemote({ silent = false } = {}) {
  if (!state.mailbox?.id || !state.mailbox?.token) return;
  try {
    await api(`/accounts/${state.mailbox.id}`, { method: "DELETE" });
  } catch (error) {
    if (!silent) throw error;
  }
}

function clearMailboxLocal() {
  state.mailbox = null;
  state.messages = [];
  state.selectedMessageId = null;
  persistMailbox();
  stopPolling();
  renderMailbox();
  renderMessages();
  renderEmptyDetail();
  startTimer();
}

async function copyCurrentEmail() {
  if (!state.mailbox?.address) {
    showToast("لا يوجد بريد لنسخه");
    return;
  }

  await navigator.clipboard.writeText(state.mailbox.address);
  showToast("تم نسخ البريد");
}

async function copyText(value, label = "تم النسخ") {
  await navigator.clipboard.writeText(value);
  showToast(label);
}

function renderMailbox() {
  const hasMailbox = Boolean(state.mailbox?.address);
  els.emailAddress.value = hasMailbox ? state.mailbox.address : "اضغط توليد بريد";
  els.copyEmail.disabled = !hasMailbox;
  els.refreshInbox.disabled = !hasMailbox;
  els.refreshInboxSmall.disabled = !hasMailbox;
  els.changeEmail.disabled = !hasMailbox;
  els.deleteEmail.disabled = !hasMailbox;
  updateStatus(hasMailbox ? `الصندوق متصل عبر ${state.mailbox.provider || "mail.gw"}` : "جاهز للتوليد");
}

function renderMessages() {
  els.messageList.innerHTML = "";
  els.messageCount.textContent = `${state.messages.length} رسالة`;
  els.emptyState.hidden = state.messages.length > 0;

  state.messages.forEach((message) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `message-item${message.id === state.selectedMessageId ? " active" : ""}`;
    item.addEventListener("click", () => openMessage(message.id));

    item.innerHTML = `
      <div class="message-title">
        <span>${escapeHtml(message.subject || "بدون عنوان")}</span>
        <small>${message.seen ? "مقروءة" : "جديدة"}</small>
      </div>
      <p class="message-intro">${escapeHtml(message.intro || "لا توجد معاينة متاحة")}</p>
      <div class="message-meta">
        <span>${escapeHtml(message.from?.address || "مرسل غير معروف")}</span>
        <span>${formatDate(message.createdAt)}</span>
      </div>
    `;

    els.messageList.appendChild(item);
  });
}

function renderDetailLoading() {
  els.deleteMessage.disabled = true;
  els.messageDetail.innerHTML = `
    <div class="empty-state compact">
      <i data-lucide="loader"></i>
      <h3>جاري فتح الرسالة</h3>
      <p>لحظة واحدة فقط.</p>
    </div>
  `;
  refreshIcons();
}

function renderEmptyDetail() {
  els.deleteMessage.disabled = true;
  els.messageDetail.innerHTML = `
    <div class="empty-state compact">
      <i data-lucide="mouse-pointer-click"></i>
      <h3>اختر رسالة</h3>
      <p>عند وصول رسالة تفعيل، افتحها هنا لنسخ الكود أو الرابط.</p>
    </div>
  `;
  refreshIcons();
}

function renderDetailError(message) {
  els.deleteMessage.disabled = true;
  els.messageDetail.innerHTML = `
    <div class="empty-state compact">
      <i data-lucide="circle-alert"></i>
      <h3>تعذر فتح الرسالة</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  refreshIcons();
}

function renderMessageDetail(message) {
  const code = extractVerificationCode([message.subject, message.text, ...(message.html || [])].join(" "));
  const textBody = message.text || "لا يوجد نص مباشر لهذه الرسالة.";
  const htmlBody = Array.isArray(message.html) ? message.html.join("") : "";

  els.deleteMessage.disabled = false;
  els.messageDetail.innerHTML = `
    <article class="detail-content">
      <h3>${escapeHtml(message.subject || "بدون عنوان")}</h3>
      <div class="field-line">
        <span>من</span>
        <strong>${escapeHtml(message.from?.address || "مرسل غير معروف")}</strong>
      </div>
      <div class="field-line">
        <span>التاريخ</span>
        <strong>${formatDate(message.createdAt)}</strong>
      </div>
      <div class="code-strip ${code ? "visible" : ""}">
        <span>كود محتمل</span>
        <code>${escapeHtml(code || "")}</code>
        <button class="icon-button" type="button" data-copy-code="${escapeHtml(code || "")}" aria-label="نسخ الكود">
          <i data-lucide="copy"></i>
        </button>
      </div>
      <div class="message-actions">
        <button class="ghost-button" type="button" data-copy-body>
          <i data-lucide="copy-check"></i>
          نسخ النص
        </button>
      </div>
      <div class="text-body">${escapeHtml(textBody)}</div>
      ${htmlBody ? `<iframe class="html-frame" sandbox="" title="محتوى HTML للرسالة"></iframe>` : ""}
    </article>
  `;

  const copyCode = els.messageDetail.querySelector("[data-copy-code]");
  if (copyCode && code) copyCode.addEventListener("click", () => copyText(code, "تم نسخ الكود"));

  const copyBody = els.messageDetail.querySelector("[data-copy-body]");
  if (copyBody) copyBody.addEventListener("click", () => copyText(textBody, "تم نسخ نص الرسالة"));

  const frame = els.messageDetail.querySelector(".html-frame");
  if (frame) {
    frame.srcdoc = htmlBody;
  }

  refreshIcons();
}

function startPolling() {
  stopPolling();
  state.poller = window.setInterval(refreshMessages, POLL_MS);
}

function stopPolling() {
  if (state.poller) {
    window.clearInterval(state.poller);
    state.poller = null;
  }
}

function startTimer() {
  if (state.timer) window.clearInterval(state.timer);
  updateTimer();
  state.timer = window.setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!state.mailbox?.expiresAt) {
    els.timerText.textContent = "10:00";
    return;
  }

  const remaining = Math.max(0, state.mailbox.expiresAt - Date.now());
  const minutes = Math.floor(remaining / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  els.timerText.textContent = `${minutes}:${seconds}`;

  if (remaining <= 0) {
    updateStatus("انتهت مدة البريد");
  }
}

function updateStatus(text) {
  els.statusText.textContent = text;
}

function setBusy(isBusy) {
  state.busy = isBusy;
  document.body.classList.toggle("is-loading", isBusy);
  els.generateEmail.disabled = isBusy;
  els.newEmailTop.disabled = isBusy;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), 2600);
}

function generateLocalPart() {
  return `inbox-${cryptoRandom(10).toLowerCase()}`;
}

function cryptoRandom(length) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function extractVerificationCode(input) {
  const match = String(input || "").match(/\b\d{4,8}\b/);
  return match ? match[0] : "";
}

function formatDate(value) {
  if (!value) return "الآن";
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

init();
