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
  return docs.flatMap((doc, docIndex) => {
    const nodes = Array.from(doc.querySelectorAll("a,li,div,section,article"));
    return nodes.map((node, index) => {
      const text = clean(node.innerText || node.textContent || "");
      const link = node.matches("a") ? node : node.querySelector("a[href]");
      return {
        docIndex,
        index,
        courseName: text.split(/\s{2,}|[\r\n]/).map(clean).find(Boolean) || text,
        text,
        href: link?.href || "",
        title: node.getAttribute("title") || link?.getAttribute("title") || "",
      };
    }).filter((item) => item.courseName && /course|\u8bfe\u7a0b|\u73ed|\u57fa\u7840|\u8bbe\u8ba1|\u6570\u5b57|effect/i.test(item.text));
  });
})()
