export default async function handler(req, res) {
  try {
    // =========================
    // ① Notionから案件取得（仮で1件）
    // =========================
    const projects = [
      {
        name: "テスト案件",
        siteUrl: "https://www.vault-mado-reform.com",
        blogDir: "/blog/"
      }
    ];

    let results = [];

    // =========================
    // ② 案件ごとに処理
    // =========================
    for (const project of projects) {
      const baseUrl = project.siteUrl;
      const dir = project.blogDir;

      const firstPage = baseUrl + dir;

      // =========================
      // ③ 1ページ目取得
      // =========================
      const html = await fetch(firstPage).then(r => r.text());

      // =========================
      // ④ 最大ページ数取得
      // =========================
      const matches = html.match(/@p(\d+)\//g);
      let maxPage = 1;

      if (matches) {
        const nums = matches.map(m => Number(m.match(/\d+/)[0]));
        maxPage = Math.max(...nums);
      }

      console.log("maxPage:", maxPage);

      let urls = [];

      // =========================
      // ⑤ 全ページ巡回
      // =========================
      for (let i = 1; i <= maxPage; i++) {
        const pageUrl = i === 1
          ? firstPage
          : `${baseUrl}${dir}@p${i}/`;

        console.log("fetch:", pageUrl);

        const pageHtml = await fetch(pageUrl).then(r => r.text());

        const links = [...pageHtml.matchAll(/href="(https:\/\/www\.vault-mado-reform\.com\/blog\/[^"]+)"/g)]
          .map(m => m[1]);

        urls.push(...links);
      }

      // =========================
      // ⑥ フィルタ
      // =========================
      urls = urls.filter(url => {
        const path = url.replace(baseUrl, "");

        return (
          /^\/blog\/[^\/]+\/?$/.test(path) &&
          !path.includes("@p")
        );
      });

      // 重複削除
      urls = [...new Set(urls)];

      // =========================
      // ⑦ データ整形
      // =========================
      urls.forEach(url => {
        results.push([
          new Date().toISOString(),
          project.name,
          url
        ]);
      });
    }

    // =========================
    // ⑧ GASにPOST
    // =========================

    const gasUrl = "https://script.google.com/macros/s/AKfycbxGoLVPwqDdgcapdAt2IG55eBcGK5sIo7nKjLO7xAI_FVND5eSB_xWHB9p37vKO4vD3nw/exec".trim();
    
    await fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(results)
    });

    return res.json({
      status: "ok",
      count: results.length
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
