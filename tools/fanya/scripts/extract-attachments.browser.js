(async () => {
  const frames = Array.from(document.querySelectorAll("iframe"));
  const attachments = [];

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    try {
      const frameDocument = frames[frameIndex].contentDocument;
      const attach = frameDocument?.querySelector?.(".attach");
      if (!attach) continue;

      const objectid = attach.getAttribute("data") || "";
      let meta = null;
      try {
        const response = await fetch(`/ananas/status/${objectid}`);
        meta = await response.json();
      } catch (error) {
        meta = { error: String(error) };
      }

      attachments.push({
        frameIndex,
        objectid,
        type: attach.getAttribute("type") || "",
        text: (frameDocument.body?.innerText || "").trim(),
        meta,
      });
    } catch (error) {
      attachments.push({
        frameIndex,
        error: String(error),
      });
    }
  }

  const bodyText = document.body.innerText || "";
  const studentMatch = bodyText.match(/\n([\u4e00-\u9fa5]{2,4})\n(\d{6,})\n/);

  return {
    student: studentMatch ? { name: studentMatch[1], id: studentMatch[2] } : null,
    attachments,
  };
})();
