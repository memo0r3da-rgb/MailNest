(function () {
  const form = document.querySelector("#contactForm");
  const status = document.querySelector("#contactStatus");
  const ownerEmail = "memo0r3da@gmail.com";

  if (!form || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.reportValidity()) return;

    const submitButton = form.querySelector("[type='submit']");
    const formData = new FormData(form);
    formData.append("_format", "plain");

    setStatus("sending", "جاري إرسال الرسالة...");
    submitButton.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error(`FormSubmit ${response.status}`);

      form.reset();
      setStatus("success", "تم إرسال الرسالة بنجاح. راجع Gmail للتأكيد أو الرد.");
    } catch (error) {
      const mailto = buildMailto(formData);
      setStatus(
        "error",
        `خدمة FormSubmit غير متاحة حاليا. <a class="text-link" href="${mailto}">افتح Gmail لإرسال الرسالة مباشرة</a>.`
      );
    } finally {
      submitButton.disabled = false;
    }
  });

  function buildMailto(formData) {
    const name = formData.get("name") || "زائر MailNest";
    const email = formData.get("email") || "";
    const topic = formData.get("topic") || "رسالة من الموقع";
    const message = formData.get("message") || "";
    const subject = encodeURIComponent(`MailNest - ${topic}`);
    const body = encodeURIComponent(
      `الاسم: ${name}\nالبريد: ${email}\nنوع الرسالة: ${topic}\n\nالرسالة:\n${message}`
    );
    return `mailto:${ownerEmail}?subject=${subject}&body=${body}`;
  }

  function setStatus(type, message) {
    status.className = `form-status ${type}`;
    status.innerHTML = message;
  }
})();
