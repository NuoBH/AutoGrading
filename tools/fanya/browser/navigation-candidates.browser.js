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
    const nodes = Array.from(doc.querySelectorAll("a,button,[role=button],li,div[onclick],span[onclick]"));
    return nodes.map((node, index) => ({
      docIndex,
      index,
      tagName: node.tagName,
      text: clean(node.innerText || node.textContent || node.getAttribute("title") || ""),
      href: node.href || "",
      title: node.getAttribute("title") || "",
      data: node.getAttribute("data") || "",
      onclick: node.getAttribute("onclick") || "",
      className: node.className || "",
    })).filter((item) => item.text || item.href || item.onclick || item.data);
  });
})()
