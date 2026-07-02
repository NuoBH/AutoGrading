(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const frames = Array.from(document.querySelectorAll("iframe")).map((frame, index) => {
    try {
      return {
        index,
        src: frame.src || "",
        title: frame.title || "",
        text: clean(frame.contentDocument?.body?.innerText || "").slice(0, 500),
      };
    } catch (error) {
      return { index, src: frame.src || "", title: frame.title || "", text: "" };
    }
  });
  return {
    url: location.href,
    title: document.title || "",
    readyState: document.readyState,
    text: clean(document.body?.innerText || "").slice(0, 1000),
    frames,
  };
})()
