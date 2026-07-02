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
    const rows = Array.from(doc.querySelectorAll("tr,li,div,section"));
    return rows.map((row, index) => {
      const text = clean(row.innerText || row.textContent || "");
      const links = Array.from(row.querySelectorAll("a[href],a[data],button,[onclick]")).map((link) => ({
        text: clean(link.innerText || link.textContent || ""),
        href: link.href || "",
        data: link.getAttribute("data") || "",
        onclick: link.getAttribute("onclick") || "",
        className: link.className || "",
      }));
      const reviewLink = links.find((link) => /review|homework|assignment|\u6279\u9605|\u8bc4\u9605|\u67e5\u770b|\u8fdb\u5165|\u4f5c\u4e1a/i.test(`${link.text} ${link.href} ${link.data} ${link.onclick} ${link.className}`));
      return {
        docIndex,
        index,
        assignmentName: text.split(/\s{2,}|[\r\n]/).map(clean).find(Boolean) || text,
        text,
        reviewUrl: reviewLink?.data || reviewLink?.href || "",
        links,
      };
    }).filter((item) => item.text && /homework|assignment|review|\u4f5c\u4e1a|\u6279\u9605|\u8bc4\u9605/i.test(item.text));
  });
})()
