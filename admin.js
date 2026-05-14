(function () {
  const credentials = {
    email: "admin@mailnest.local",
    password: "MailNest@2026",
  };
  const keys = {
    session: "mailnest.admin.session",
    articles: "mailnest.cms.articles",
    sections: "mailnest.cms.sections",
    pages: "mailnest.cms.pages",
    payments: "mailnest.payment.requests",
    notifications: "mailnest.premium.notifications",
  };

  const els = {
    loginView: document.querySelector("#loginView"),
    dashboardView: document.querySelector("#dashboardView"),
    loginForm: document.querySelector("#loginForm"),
    logoutButton: document.querySelector("#logoutButton"),
    sectionForm: document.querySelector("#sectionForm"),
    pageForm: document.querySelector("#pageForm"),
    articleForm: document.querySelector("#articleForm"),
    resetContent: document.querySelector("#resetContent"),
    contentLists: document.querySelector("#contentLists"),
    paymentReviewList: document.querySelector("#paymentReviewList"),
    refreshPayments: document.querySelector("#refreshPayments"),
    toast: document.querySelector("#adminToast"),
  };

  function init() {
    bindEvents();
    if (localStorage.getItem(keys.session) === "active") showDashboard();
    renderLists();
    renderPayments();
    refreshIcons();
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = document.querySelector("#adminEmail").value.trim();
      const password = document.querySelector("#adminPassword").value;

      if (email === credentials.email && password === credentials.password) {
        localStorage.setItem(keys.session, "active");
        showDashboard();
        showToast("تم تسجيل الدخول");
      } else {
        showToast("بيانات الدخول غير صحيحة");
      }
    });

    els.logoutButton.addEventListener("click", () => {
      localStorage.removeItem(keys.session);
      els.dashboardView.hidden = true;
      els.loginView.hidden = false;
    });

    els.sectionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = formData(els.sectionForm);
      addItem(keys.sections, {
        id: crypto.randomUUID(),
        title: data.title,
        icon: data.icon || "panel-top",
        content: data.content,
      });
      els.sectionForm.reset();
      showToast("تمت إضافة السكشن");
    });

    els.pageForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = formData(els.pageForm);
      addItem(keys.pages, {
        id: crypto.randomUUID(),
        title: data.title,
        slug: slugify(data.slug),
        content: data.content,
      });
      els.pageForm.reset();
      showToast("تمت إضافة الصفحة للهيدر");
    });

    els.articleForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = formData(els.articleForm);
      addItem(keys.articles, {
        id: crypto.randomUUID(),
        title: data.title,
        category: data.category,
        slug: slugify(data.slug),
        excerpt: data.excerpt,
        content: data.content,
        date: new Date().toISOString(),
      });
      els.articleForm.reset();
      showToast("تم نشر المقال");
    });

    els.resetContent.addEventListener("click", () => {
      localStorage.removeItem(keys.sections);
      localStorage.removeItem(keys.pages);
      localStorage.removeItem(keys.articles);
      renderLists();
      showToast("تم مسح محتوى اللوحة");
    });

    els.refreshPayments.addEventListener("click", renderPayments);
    els.paymentReviewList.addEventListener("click", (event) => {
      const action = event.target.closest("[data-payment-action]");
      if (!action) return;
      if (action.dataset.paymentAction === "approve") approvePayment(action.dataset.id);
      if (action.dataset.paymentAction === "reject") rejectPayment(action.dataset.id);
      if (action.dataset.paymentAction === "copy") copyText(action.dataset.code);
    });
  }

  function showDashboard() {
    els.loginView.hidden = true;
    els.dashboardView.hidden = false;
    renderLists();
    renderPayments();
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function addItem(key, item) {
    const items = read(key);
    items.unshift(item);
    localStorage.setItem(key, JSON.stringify(items));
    renderLists();
  }

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function renderLists() {
    const sections = read(keys.sections);
    const pages = read(keys.pages);
    const articles = read(keys.articles);

    els.contentLists.innerHTML = `
      ${listBlock("سكشنز الصفحة الرئيسية", sections, (item) => item.title)}
      ${listBlock("صفحات الهيدر", pages, (item) => `${item.title} - page.html?slug=${item.slug}`)}
      ${listBlock("المقالات", articles, (item) => `${item.title} - article.html?slug=${item.slug}`)}
    `;
  }

  function renderPayments() {
    const payments = read(keys.payments);
    if (!payments.length) {
      els.paymentReviewList.innerHTML = `<div class="empty-admin-state">لا توجد طلبات دفع للمراجعة بعد.</div>`;
      return;
    }

    els.paymentReviewList.innerHTML = payments.map((payment) => paymentCard(payment)).join("");
    refreshIcons();
  }

  function listBlock(title, items, label) {
    return `
      <div class="content-list">
        <h3>${escapeHtml(title)}</h3>
        ${items.length ? items.map((item) => `<p>${escapeHtml(label(item))}</p>`).join("") : "<p>لا يوجد محتوى مخصص بعد.</p>"}
      </div>
    `;
  }

  function paymentCard(payment) {
    const statusLabel = payment.status === "approved" ? "مقبول" : payment.status === "rejected" ? "مرفوض" : "قيد المراجعة";
    const codeBlock = payment.activationNoticeId
      ? `<div class="activation-code-box"><span>إشعار التفعيل</span><strong>تم إنشاء إشعار للمستخدم</strong><a class="ghost-button" href="${replyMailto(payment)}">إبلاغ المستخدم</a></div>`
      : "";
    const actions = payment.status === "pending"
      ? `<div class="checkout-actions"><button class="primary-button" type="button" data-payment-action="approve" data-id="${payment.id}">قبول الدفع</button><button class="danger-button" type="button" data-payment-action="reject" data-id="${payment.id}">رفض</button></div>`
      : "";

    return `
      <article class="payment-review-card ${escapeHtml(payment.status)}">
        <div class="payment-review-main">
          <div>
            <p class="eyebrow">${escapeHtml(statusLabel)} · ${formatDate(payment.createdAt)}</p>
            <h3>${escapeHtml(payment.id)}</h3>
            <p>${escapeHtml(payment.email)} · ${escapeHtml(payment.method)} · ${escapeHtml(payment.amount)} ${escapeHtml(payment.currency)}</p>
            <p>رقم العملية: <strong>${escapeHtml(payment.transactionRef || "غير مرفق")}</strong></p>
          </div>
          ${payment.proofImage ? `<a href="${payment.proofImage}" target="_blank" rel="noopener"><img class="proof-thumb" src="${payment.proofImage}" alt="صورة التحويل" /></a>` : `<div class="proof-missing">لا توجد صورة</div>`}
        </div>
        ${codeBlock}
        ${actions}
      </article>
    `;
  }

  function approvePayment(id) {
    const payments = read(keys.payments);
    const payment = payments.find((item) => item.id === id);
    if (!payment) return;

    payment.status = "approved";
    payment.reviewedAt = Date.now();
    payment.activationNoticeId = `NOTICE-${Date.now().toString(36).toUpperCase()}`;

    const notifications = read(keys.notifications);
    notifications.unshift({
      id: payment.activationNoticeId,
      paymentId: payment.id,
      status: "approved",
      email: payment.email,
      message: "تم قبول الدفع. يمكنك الآن تفعيل Premium من صفحة Premium بدون كود يدوي.",
      used: false,
      createdAt: Date.now(),
    });

    localStorage.setItem(keys.payments, JSON.stringify(payments));
    localStorage.setItem(keys.notifications, JSON.stringify(notifications));
    renderPayments();
    showToast("تم قبول الدفع وإنشاء إشعار التفعيل");
  }

  function rejectPayment(id) {
    const payments = read(keys.payments);
    const payment = payments.find((item) => item.id === id);
    if (!payment) return;
    payment.status = "rejected";
    payment.reviewedAt = Date.now();

    const notifications = read(keys.notifications);
    notifications.unshift({
      id: `NOTICE-${Date.now().toString(36).toUpperCase()}`,
      paymentId: payment.id,
      status: "rejected",
      email: payment.email,
      message: "تم رفض طلب الدفع. راجع بيانات التحويل أو تواصل مع الدعم.",
      used: true,
      createdAt: Date.now(),
    });

    localStorage.setItem(keys.payments, JSON.stringify(payments));
    localStorage.setItem(keys.notifications, JSON.stringify(notifications));
    renderPayments();
    showToast("تم رفض الطلب");
  }

  async function copyText(value) {
    await navigator.clipboard.writeText(value);
    showToast("تم النسخ");
  }

  function replyMailto(payment) {
    const subject = encodeURIComponent("تمت مراجعة دفع MailNest Premium");
    const body = encodeURIComponent([
      "مرحبا،",
      "",
      "تم قبول الدفع بنجاح.",
      "",
      "افتح صفحة Premium، واكتب بريدك في قسم متابعة طلب التفعيل، ثم اضغط فحص ليظهر إشعار التفعيل.",
    ].join("\n"));
    return `mailto:${payment.email}?subject=${subject}&body=${body}`;
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `page-${Date.now()}`;
  }

  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("visible"), 2400);
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
    if (window.lucide) window.lucide.createIcons();
  }

  init();
})();
