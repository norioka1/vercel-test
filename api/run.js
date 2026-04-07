import { Client } from "@notionhq/client";

export default async function handler(req, res) {
  // 環境変数からNotionのキーを取得
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = process.env.NOTION_DATABASE_ID;
  const gasUrl = process.env.GAS_DEPLOY_URL;

  try {
    // --- ① Notionから案件一覧を取得 ---
    // const response = await notion.databases.query({
    //   database_id: databaseId,
    //   filter: {
    //     and: [
    //       { property: "契約内容", select: { equals: "SCSC" } },
    //       { property: "解約", checkbox: { equals: false } }
    //     ]
    //   }
    // });
    // --- ① Notionから案件一覧を取得 ---
    const response = await notion.databases.query({
      database_id: databaseId,
      page_size: 1, // ★ここで1件だけに絞る
      filter: {
        and: [
          { property: "契約内容", select: { equals: "SCSC" } },
          { property: "解約", checkbox: { equals: false } }
        ]
      }
    });

    const projects = response.results.map(page => {
      const props = page.properties;
      return {
        name: props['案件名']?.title[0]?.plain_text || "不明", // 実際のプロパティ名に合わせて調整
        siteUrl: props['本番環境']?.url || "",
        blogDir: props['ブログ記事ディレクトリ']?.rich_text[0]?.plain_text || "/blog/",
        ga4Id: props['GA4 Property ID']?.rich_text[0]?.plain_text || ""
      };
    }).filter(p => p.siteUrl);

    let allResults = [];

    // --- ② 各案件のブログを巡回 ---
    for (const project of projects) {
      const baseUrl = project.siteUrl.replace(/\/$/, "");
      const blogTopUrl = baseUrl + project.blogDir;
      
      console.log(`Processing: ${project.name}`);

      // 1ページ目を取得して最大ページ数を確認
      const firstPageHtml = await fetch(blogTopUrl).then(r => r.text());
      const pageMatches = firstPageHtml.match(/@p(\d+)\//g);
      let maxPage = 1;
      if (pageMatches) {
        maxPage = Math.max(...pageMatches.map(m => parseInt(m.match(/\d+/)[0])));
      }

      let articleUrls = [];

      // ページ分ループ
      for (let i = 1; i <= maxPage; i++) {
        const currentPath = i === 1 ? project.blogDir : `${project.blogDir}@p${i}/`;
        const pageUrl = baseUrl + currentPath;
        
        const html = await fetch(pageUrl).then(r => r.text());
        
        // 記事URLの抽出（ディレクトリ/記事名/ のパターン）
        // 例: /blog/article-name/ を探し、@pを含むものは除外
        const linkRegex = new RegExp(`href="(${project.blogDir}[^" ]+)"`, "g");
        const matches = [...html.matchAll(linkRegex)];
        
        matches.forEach(m => {
          const path = m[1];
          // 重複排除用フィルタ: ページ番号を含まず、ブログトップそのものでもないもの
          if (!path.includes("@p") && path !== project.blogDir) {
            const fullUrl = path.startsWith("http") ? path : baseUrl + path;
            articleUrls.push(fullUrl);
          }
        });
      }

      // 重複削除
      const uniqueUrls = [...new Set(articleUrls)];

      // --- ③ データを整形（将来的にここでGA4等を取得） ---
      uniqueUrls.forEach(url => {
        allResults.push([
          new Date().toLocaleDateString("ja-JP"),
          project.name,
          url,
          project.ga4Id
        ]);
      });
    }

    // --- ④ GASのエンドポイントにPOST ---
    if (allResults.length > 0) {
      await fetch(gasUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(allResults)
      });
    }

    return res.status(200).json({ status: "ok", count: allResults.length });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
