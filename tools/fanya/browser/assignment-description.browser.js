(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const docs = [document];
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      if (frame.contentDocument) docs.push(frame.contentDocument);
    } catch (error) {
      void error;
    }
  }
  const blocks = docs.flatMap((doc, docIndex) => {
    const text = clean(doc.body?.innerText || "");
    const headings = Array.from(doc.querySelectorAll("h1,h2,h3,.title,[class*=title]"))
      .map((node) => clean(node.innerText || node.textContent || ""))
      .filter(Boolean);
    const attachments = Array.from(doc.querySelectorAll("a[href],a[data]"))
      .map((link) => ({
        text: clean(link.innerText || link.textContent || ""),
        href: link.href || "",
        data: link.getAttribute("data") || "",
      }))
      .filter((item) => /doc|docx|pdf|ppt|pptx|mp4|mov|zip|rar|7z|\u9644\u4ef6|\u4e0b\u8f7d|\u9884\u89c8/i.test(`${item.text} ${item.href} ${item.data}`));
    return [{
      docIndex,
      headings,
      text,
      attachments,
    }];
  });
  const best = blocks.sort((a, b) => b.text.length - a.text.length)[0] || { headings: [], text: "", attachments: [] };
  const scoreMatch = best.text.match(/(\d+)\s*(\u5206|points?|score)/i);
  return {
    url: location.href,
    title: best.headings[0] || document.title || "",
    totalScore: scoreMatch ? Number(scoreMatch[1]) : null,
    descriptionText: best.text.slice(0, 12000),
    attachments: best.attachments,
  };
})()
