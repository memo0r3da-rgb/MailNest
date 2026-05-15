(function () {
  const PREMIUM_KEY = "mailnest.premium";
  const REQUESTS_KEY = "mailnest.payment.requests";
  const NOTIFICATIONS_KEY = "mailnest.premium.notifications";
  const LAST_REQUEST_KEY = "mailnest.payment.lastRequestAt";
  const ORDER = {
    amount: 250,
    currency: "EGP",
    plan: "MailNest Web Premium - 1 month",
  };
  const MAX_PROOF_SIZE = 3 * 1024 * 1024;
  const ALLOWED_PROOF_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
  const ALLOWED_METHODS = new Set(["instapay", "vodafone", "etisalat", "orange"]);
  const REQUEST_COOLDOWN = 60 * 1000;

  const els = {
    overlay: document.querySelector("#checkoutOverlay"),
    open: document.querySelector("#openCheckout"),
    close: document.querySelector("#closeCheckout"),
    email: document.querySelector("#checkoutEmail"),
    consent: document.querySelector("#checkoutConsent"),
    transaction: document.querySelector("#transactionRef"),
    proofImage: document.querySelector("#proofImage"),
    proofPreview: document.querySelector("#proofPreview"),
    proofForm: document.querySelector("#paymentProofForm"),
    proofMethod: document.querySelector("#proofMethod"),
    proofEmail: document.querySelector("#proofEmail"),
    proofTransaction: document.querySelector("#proofTransaction"),
    proofRequestId: document.querySelector("#proofRequestId"),
    continue: document.querySelector("#continueToPayment"),
    back: document.querySelector("#backToDetails"),
    confirm: document.querySelector("#confirmPayment"),
    requestId: document.querySelector("#reviewRequestId"),
    notificationEmail: document.querySelector("#notificationEmail"),
    checkNotifications: document.querySelector("#checkNotifications"),
    notificationList: document.querySelector("#notificationList"),
    toast: document.querySelector("#paymentToast"),
  };

  let selectedMethod = "instapay";
  let proofDataUrl = "";

  function init() {
    if (!els.open) return;
    bindEvents();
    updatePremiumCopy();
  }

  function bindEvents() {
    els.open.addEventListener("click", openCheckout);
    els.close.addEventListener("click", closeCheckout);
    els.overlay.addEventListener("click", (event) => {
      if (event.target === els.overlay) closeCheckout();
    });
    els.continue.addEventListener("click", continueToPayment);
    els.back.addEventListener("click", () => setStep("details"));
    els.confirm.addEventListener("click", submitPaymentReview);
    els.checkNotifications.addEventListener("click", renderNotifications);

    els.proofImage.addEventListener("change", async () => {
      proofDataUrl = "";
      const file = els.proofImage.files?.[0];
      if (!file) {
        els.proofPreview.hidden = true;
        els.proofPreview.innerHTML = "";
        return;
      }
      if (!ALLOWED_PROOF_TYPES.has(file.type)) {
        showToast("ارفع صورة PNG أو JPG أو WebP فقط");
        els.proofImage.value = "";
        return;
      }
      if (file.size > MAX_PROOF_SIZE) {
        showToast("حجم صورة التحويل يجب ألا يتجاوز 3MB");
        els.proofImage.value = "";
        return;
      }
      if (!file.type.startsWith("image/")) {
        showToast("ارفع صورة صحيحة للتحويل");
        els.proofImage.value = "";
        return;
      }
      proofDataUrl = await fileToDataUrl(file);
      els.proofPreview.hidden = false;
      els.proofPreview.innerHTML = `<img src="${proofDataUrl}" alt="معاينة صورة التحويل" /><span>${escapeHtml(file.name)}</span>`;
    });

    document.querySelectorAll("[data-method]").forEach((button) => {
      button.addEventListener("click", () => selectMethod(button.dataset.method));
    });

    document.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copy);
        showToast("تم النسخ");
      });
    });
  }

  function continueToPayment() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(els.email.value.trim())) {
      showToast("اكتب بريدا صحيحا للتفعيل");
      els.email.focus();
      return;
    }
    if (!els.consent.checked) {
      showToast("يجب الموافقة على إرسال بيانات المراجعة");
      return;
    }
    setStep("payment");
  }

  function openCheckout() {
    els.overlay.hidden = false;
    document.body.classList.add("checkout-open");
    setStep("details");
    window.lucide?.createIcons();
  }

  function closeCheckout() {
    els.overlay.hidden = true;
    document.body.classList.remove("checkout-open");
  }

  function setStep(step) {
    document.querySelectorAll("[data-step]").forEach((section) => {
      section.classList.toggle("active", section.dataset.step === step);
    });
    document.querySelectorAll("[data-step-indicator]").forEach((indicator) => {
      indicator.classList.toggle("active", indicator.dataset.stepIndicator === step);
    });
  }

  function selectMethod(method) {
    if (!ALLOWED_METHODS.has(method)) return;
    selectedMethod = method;
    els.proofMethod.value = method;
    document.querySelectorAll("[data-method]").forEach((button) => {
      button.classList.toggle("active", button.dataset.method === method);
      button.setAttribute("aria-pressed", String(button.dataset.method === method));
    });
    document.querySelectorAll("[data-method-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.methodPanel === method);
    });
  }

  async function submitPaymentReview() {
    const transactionRef = els.transaction.value.trim();
    const lastRequestAt = Number(localStorage.getItem(LAST_REQUEST_KEY) || 0);
    if (Date.now() - lastRequestAt < REQUEST_COOLDOWN) {
      showToast("انتظر دقيقة قبل إرسال طلب دفع جديد");
      return;
    }
    if (!transactionRef) {
      showToast("اكتب رقم العملية أو آخر 4 أرقام");
      els.transaction.focus();
      return;
    }
    if (!/^[\w\s\u0600-\u06FF-]{4,40}$/.test(transactionRef)) {
      showToast("رقم العملية يجب أن يكون من 4 إلى 40 حرفا");
      els.transaction.focus();
      return;
    }
    if (!els.proofImage.files?.[0]) {
      showToast("ارفع صورة التحويل أولا");
      return;
    }

    const id = createRequestId();
    const request = {
      id,
      status: "pending",
      email: els.email.value.trim().toLowerCase(),
      method: ALLOWED_METHODS.has(selectedMethod) ? selectedMethod : "instapay",
      transactionRef,
      amount: ORDER.amount,
      currency: ORDER.currency,
      plan: ORDER.plan,
      proofImage: proofDataUrl,
      createdAt: Date.now(),
    };

    const requests = readList(REQUESTS_KEY);
    requests.unshift(request);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    localStorage.setItem(LAST_REQUEST_KEY, String(Date.now()));

    els.proofEmail.value = request.email;
    els.proofTransaction.value = request.transactionRef;
    els.proofMethod.value = request.method;
    els.proofRequestId.value = request.id;
    await sendProofToOwner();

    els.requestId.textContent = request.id;
    setStep("success");
    showToast("تم إرسال الطلب للأدمن");
    window.lucide?.createIcons();
  }

  async function sendProofToOwner() {
    const formData = new FormData(els.proofForm);
    const file = els.proofImage.files?.[0];
    if (file && !formData.has("proof_image")) {
      formData.append("proof_image", file, file.name);
    }

    try {
      const response = await fetch(els.proofForm.action, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`FormSubmit ${response.status}`);
    } catch {
      showToast("تم حفظ الطلب محليا، لكن FormSubmit غير متاح حاليا");
    }
  }

  function renderNotifications() {
    const email = els.notificationEmail.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("اكتب البريد المستخدم في طلب الدفع");
      return;
    }

    const notifications = readList(NOTIFICATIONS_KEY)
      .filter((item) => item.email.toLowerCase() === email)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!notifications.length) {
      els.notificationList.innerHTML = `<p class="small-note">لا توجد إشعارات لهذا البريد بعد.</p>`;
      return;
    }

    els.notificationList.innerHTML = notifications.map((item) => `
      <article class="notification-card ${item.status}">
        <strong>${item.status === "approved" ? "تم قبول الدفع" : "تم رفض الدفع"}</strong>
        <span>${new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</span>
        <p>${item.message}</p>
        ${item.status === "approved" && !item.used ? `<button class="primary-button wide" type="button" data-activate-notification="${item.id}">تفعيل Premium الآن</button>` : ""}
      </article>
    `).join("");

    els.notificationList.querySelectorAll("[data-activate-notification]").forEach((button) => {
      button.addEventListener("click", () => activateFromNotification(button.dataset.activateNotification));
    });
  }

  function activateFromNotification(id) {
    const notifications = readList(NOTIFICATIONS_KEY);
    const notification = notifications.find((item) => item.id === id && item.status === "approved" && !item.used);

    if (!notification) {
      showToast("الإشعار غير صالح أو تم استخدامه");
      return;
    }

    const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(PREMIUM_KEY, JSON.stringify({
      active: true,
      email: notification.email,
      source: "admin-notification",
      notificationId: notification.id,
      paymentId: notification.paymentId,
      activatedAt: Date.now(),
      expiresAt,
    }));

    notification.used = true;
    notification.usedAt = Date.now();
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(notifications));

    document.documentElement.classList.add("premium-active");
    updatePremiumCopy();
    renderNotifications();
    showToast("تم تفعيل Premium بنجاح");
  }

  function updatePremiumCopy() {
    try {
      const premium = JSON.parse(localStorage.getItem(PREMIUM_KEY) || "null");
      if (premium?.active && premium.expiresAt > Date.now()) {
        els.open.innerHTML = '<i data-lucide="crown"></i> Premium مفعل';
        window.lucide?.createIcons();
      }
    } catch {
      return;
    }
  }

  function readList(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function createRequestId() {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return `MN-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("visible"), 2200);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  init();
})();
