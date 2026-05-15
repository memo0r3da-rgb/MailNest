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
    toast: document.querySelector("#adminToast"),
  };

  function init() {
    bindEvents();
    if (localStorage.getItem(keys.session) === "active") showDashboard();
    renderLists();
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
  }

  function showDashboard() {
    els.loginView.hidden = true;
    els.dashboardView.hidden = false;
    renderLists();
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

  function listBlock(title, items, label) {
    return `
      <div class="content-list">
        <h3>${escapeHtml(title)}</h3>
        ${items.length ? items.map((item) => `<p>${escapeHtml(label(item))}</p>`).join("") : "<p>لا يوجد محتوى مخصص بعد.</p>"}
      </div>
    `;
  }

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || `page-${Date.now()}`;
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
