import OpenAI from "openai";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

type MetricScores = {
    scalpDensity: number;
    lighting: number;
    sharpness: number;
};

type AnalysisResponse = {
    before: MetricScores;
    after: MetricScores;
};

function toDataUrl(base64: string, mimeType: string) {
    return `data:${mimeType};base64,${base64}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
}

function isBlobLike(value: unknown): value is Blob {
    return (
        typeof value === "object" &&
        value !== null &&
        "arrayBuffer" in value &&
        typeof (value as { arrayBuffer: unknown }).arrayBuffer === "function"
    );
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const before = formData.get("before");
        const after = formData.get("after");

        if (!isBlobLike(before) || !isBlobLike(after)) {
            return new Response(
                JSON.stringify({ error: "Both 'before' and 'after' images are required" }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const beforeBlob = before;
        const afterBlob = after;
        const [beforeB64, afterB64] = await Promise.all([
            blobToBase64(beforeBlob),
            blobToBase64(afterBlob),
        ]);

        const beforeType = beforeBlob.type || "image/jpeg";
        const afterType = afterBlob.type || "image/jpeg";
        const beforeUrl = toDataUrl(beforeB64, beforeType);
        const afterUrl = toDataUrl(afterB64, afterType);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
                { status: 500, headers: { "Content-Type": "application/json" } }
            );
        }

        const model = process.env.OPENAI_MODEL || "gpt-5";
        const openai = new OpenAI({ apiKey });

        const system =
            "You are a vision QA tool scoring scalp images. Return STRICT JSON only.";
        const instructions = `Analyze two scalp photos (before, after) and score each image on three metrics:
- scalpDensity: 0-100 (more visible follicles/coverage -> higher)
- lighting: 0-100 (even, sufficient exposure without blown highlights -> higher)
- sharpness: 0-100 (fine hair/skin detail -> higher)

Respond with a JSON object ONLY (no prose) that matches this TypeScript type exactly:
{
  "before": { "scalpDensity": number, "lighting": number, "sharpness": number },
  "after": { "scalpDensity": number, "lighting": number, "sharpness": number }
}

All scores must be integers between 0 and 100.`;

        const completion = await openai.chat.completions.create({
            model,
            temperature: 1,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                {
                    role: "user",
                    content: [
                        { type: "text", text: instructions },
                        { type: "image_url", image_url: { url: beforeUrl } },
                        { type: "image_url", image_url: { url: afterUrl } },
                    ],
                },
            ],
        });

        const raw = completion.choices?.[0]?.message?.content || "{}";
        let parsed: AnalysisResponse;
        try {
            parsed = JSON.parse(raw) as AnalysisResponse;
        } catch {
            return new Response(
                JSON.stringify({ error: "Failed to parse model response", raw }),
                { status: 502, headers: { "Content-Type": "application/json" } }
            );
        }

        const sanitize = (n: unknown) => {
            const x = Math.round(Number(n));
            if (!Number.isFinite(x)) return 0;
            return Math.max(0, Math.min(100, x));
        };

        const safe: AnalysisResponse = {
            before: {
                scalpDensity: sanitize(parsed?.before?.scalpDensity),
                lighting: sanitize(parsed?.before?.lighting),
                sharpness: sanitize(parsed?.before?.sharpness),
            },
            after: {
                scalpDensity: sanitize(parsed?.after?.scalpDensity),
                lighting: sanitize(parsed?.after?.lighting),
                sharpness: sanitize(parsed?.after?.sharpness),
            },
        };

        return new Response(JSON.stringify(safe), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : typeof error === "string"
                    ? error
                    : "Unexpected error";
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}


