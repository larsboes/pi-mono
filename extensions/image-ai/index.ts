/**
 * image-ai — Image generation and recognition for pi.
 *
 * Tools:
 *   - generate_image: Text-to-image via Cloudflare FLUX.1 Schnell (fast, cheap)
 *   - analyze_image: Image understanding via Gemini 2.5 Flash (best quality)
 *
 * Provider-agnostic: backends configurable via env vars.
 * Private extensions can override with corporate model endpoints.
 *
 * Env vars:
 *   CLOUDFLARE_ACCOUNT_ID — CF account for Workers AI
 *   CLOUDFLARE_API_TOKEN  — CF API token with Workers AI permission
 *   GEMINI_API_KEY        — Google AI Studio key for vision
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Configuration ────────────────────────────────────────────────────────

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const CF_FLUX_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const GEMINI_VISION_MODEL = "gemini-2.5-flash-latest";

// ── Helpers ──────────────────────────────────────────────────────────────

function getOutputDir(): string {
	const dir = path.join(os.tmpdir(), "pi-image-ai");
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	return dir;
}

function generateFilename(prefix: string, ext: string): string {
	const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	return `${prefix}-${ts}.${ext}`;
}

async function cfGenerateImage(prompt: string, options?: { width?: number; height?: number; steps?: number }): Promise<Buffer> {
	if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
		throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required for image generation");
	}

	const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_FLUX_MODEL}`;
	const body: Record<string, unknown> = { prompt };
	if (options?.width) body.width = options.width;
	if (options?.height) body.height = options.height;
	if (options?.steps) body.num_steps = options.steps;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${CF_API_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Cloudflare FLUX error (${response.status}): ${text}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

async function geminiAnalyzeImage(imageBase64: string, mimeType: string, prompt: string): Promise<string> {
	if (!GEMINI_API_KEY) {
		throw new Error("GEMINI_API_KEY required for image analysis");
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

	const body = {
		contents: [{
			parts: [
				{ text: prompt },
				{
					inline_data: {
						mime_type: mimeType,
						data: imageBase64,
					},
				},
			],
		}],
		generationConfig: {
			temperature: 0.4,
			maxOutputTokens: 4096,
		},
	};

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Gemini vision error (${response.status}): ${text}`);
	}

	const json = await response.json() as {
		candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
	};
	const parts = json.candidates?.[0]?.content?.parts;
	if (!parts || parts.length === 0) {
		throw new Error("Gemini returned empty response");
	}
	return parts.map((p) => p.text || "").join("");
}

function readImageAsBase64(filePath: string): { base64: string; mimeType: string } {
	const resolved = path.resolve(filePath);
	if (!fs.existsSync(resolved)) {
		throw new Error(`Image file not found: ${resolved}`);
	}
	const buffer = fs.readFileSync(resolved);
	const ext = path.extname(resolved).toLowerCase();
	const mimeMap: Record<string, string> = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".bmp": "image/bmp",
	};
	const mimeType = mimeMap[ext] || "image/png";
	return { base64: buffer.toString("base64"), mimeType };
}

// ── Extension Entry ──────────────────────────────────────────────────────

export default function imageAi(pi: ExtensionAPI): void {
	// ── generate_image tool ──────────────────────────────────────────────

	pi.registerTool({
		name: "generate_image",
		label: "Generate Image",
		description:
			"Generate an image from a text description using AI. Returns the file path to the generated PNG image. Use for creating diagrams, mockups, illustrations, placeholders, or any visual content.",
		parameters: Type.Object({
			prompt: Type.String({
				description: "Text description of the image to generate. Be specific and detailed for best results.",
			}),
			width: Type.Optional(Type.Number({
				description: "Image width in pixels (default: 1024, max: 1024)",
				minimum: 256,
				maximum: 1024,
			})),
			height: Type.Optional(Type.Number({
				description: "Image height in pixels (default: 1024, max: 1024)",
				minimum: 256,
				maximum: 1024,
			})),
			steps: Type.Optional(Type.Number({
				description: "Number of inference steps (default: 4, more = better quality but slower)",
				minimum: 1,
				maximum: 8,
			})),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const imageBuffer = await cfGenerateImage(params.prompt, {
				width: params.width,
				height: params.height,
				steps: params.steps,
			});

			const filename = generateFilename("generated", "png");
			const outputPath = path.join(getOutputDir(), filename);
			fs.writeFileSync(outputPath, imageBuffer);

			const sizeKB = Math.round(imageBuffer.length / 1024);
			return {
				content: [{ type: "text", text: `Image generated and saved to: ${outputPath}\nSize: ${sizeKB} KB\nPrompt: "${params.prompt}"` }],
				details: { path: outputPath, sizeBytes: imageBuffer.length },
			};
		},
	});

	// ── analyze_image tool ───────────────────────────────────────────────

	pi.registerTool({
		name: "analyze_image",
		label: "Analyze Image",
		description:
			"Analyze an image using AI vision. Provide a file path to an image and a question or instruction about what to analyze. Can describe content, read text (OCR), identify objects, understand diagrams, explain UI screenshots, etc.",
		parameters: Type.Object({
			image_path: Type.String({
				description: "Path to the image file to analyze (PNG, JPEG, GIF, WebP)",
			}),
			prompt: Type.Optional(Type.String({
				description: "Question or instruction about what to analyze in the image (default: 'Describe this image in detail')",
			})),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const question = params.prompt || "Describe this image in detail.";
			const { base64, mimeType } = readImageAsBase64(params.image_path);
			const analysis = await geminiAnalyzeImage(base64, mimeType, question);

			return {
				content: [{ type: "text", text: analysis }],
				details: { imagePath: params.image_path, prompt: question },
			};
		},
	});

	// ── Status on load ───────────────────────────────────────────────────

	const capabilities: string[] = [];
	if (CF_ACCOUNT_ID && CF_API_TOKEN) capabilities.push("generate (CF FLUX)");
	if (GEMINI_API_KEY) capabilities.push("analyze (Gemini)");

	if (capabilities.length > 0) {
		pi.on("session_start", async (_event, ctx) => {
			ctx.ui.notify(`[image-ai] Ready: ${capabilities.join(", ")}`, "info");
		});
	}
}
