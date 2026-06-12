// ============================================================
// Supabase Edge Function: ai-analyze
// ------------------------------------------------------------
// 家計簿アプリの「AI評価」タブから呼ばれる中継役。
// ブラウザから受け取った家計データを Claude(Anthropic Messages API) に渡し、
// 短い日本語の家計分析テキストを返す。
//
// 重要: Anthropic の APIキーは Supabase の Secrets(環境変数 ANTHROPIC_API_KEY)に
//       保存する。ブラウザ側のコードには絶対に書かない（書くと全世界に丸見えになる）。
//
// この関数は「JWT検証ON(デフォルト)」で動かす想定。
// 家計簿アプリは _supabase.functions.invoke() で呼ぶため、ログイン中ユーザーの
// セッショントークンが自動で付き、ログイン済みの人だけが利用できる。
// ============================================================

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// 使用モデル。家計分析は短いタスクなので最新の claude-opus-4-8 でも1回あたり数円以下。
// もっと安く抑えたい場合は "claude-haiku-4-5" に変更してよい。
const MODEL = "claude-opus-4-8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function yen(n: number): string {
  return (Math.round(Number(n)) || 0).toLocaleString("ja-JP");
}

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // CORSプリフライト(ブラウザが事前に投げてくる確認リクエスト)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return jsonResponse(
        { error: "ANTHROPIC_API_KEY が未設定です(SupabaseのSecretsで設定してください)" },
        500,
      );
    }

    const body = await req.json().catch(() => ({}));
    const year = Number(body.year) || new Date().getFullYear();
    const month = Number(body.month) || 1;
    const income = Number(body.income) || 0;
    const expense = Number(body.expense) || 0;
    const balance = Number(body.balance) || income - expense;
    const byCategory = Array.isArray(body.byCategory) ? body.byCategory : [];

    const catStr = byCategory.length
      ? byCategory
          .map((c: { category?: string; amount?: number }) =>
            `${c.category ?? "その他"}:${yen(c.amount ?? 0)}円`
          )
          .join("、")
      : "なし";

    const userPrompt =
      `${year}年${month}月の家計データです。\n` +
      `収入:${yen(income)}円\n` +
      `支出:${yen(expense)}円\n` +
      `収支:${yen(balance)}円\n` +
      `支出内訳:${catStr}\n\n` +
      `この家計を分析し、①収支評価 ②改善できる点 ③貯蓄アドバイス について、` +
      `温かみのある文体で200文字程度の日本語でまとめてください。` +
      `前置きや見出しは不要で、本文だけを返してください。`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return jsonResponse(
        { error: `Anthropic API error (${res.status})`, detail },
        502,
      );
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((b: { type?: string }) => b.type === "text")
      .map((b: { text?: string }) => b.text ?? "")
      .join("")
      .trim();

    return jsonResponse({ text: text || "結果を取得できませんでした。" });
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
});
