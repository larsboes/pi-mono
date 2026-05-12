# image-ai

Image generation and recognition extension for pi.

## Tools

### `generate_image`

Generate images from text descriptions using Cloudflare Workers AI (FLUX.1 Schnell).

```
generate_image({ prompt: "a cat astronaut on the moon, digital art", width: 1024, height: 1024 })
```

**Backend:** Cloudflare FLUX.1 Schnell — fast, cheap ($0.000053/tile), high quality.

### `analyze_image`

Understand images using Gemini 2.5 Flash vision.

```
analyze_image({ image_path: "./screenshot.png", prompt: "What error is shown?" })
```

**Backend:** Gemini 2.5 Flash — best-in-class multimodal understanding.

## Setup

Set environment variables:

```bash
# For image generation (Cloudflare Workers AI)
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"

# For image analysis (Gemini)
export GEMINI_API_KEY="your-gemini-key"
```

Either or both can be configured — the extension enables whichever tools have valid credentials.

## Pricing

| Tool | Backend | Cost |
|------|---------|------|
| generate_image | CF FLUX.1 Schnell | ~$0.000053 per 512×512 tile (essentially free) |
| analyze_image | Gemini 2.5 Flash | ~$0.01 per image (based on token count) |

Cloudflare free tier: 10,000 neurons/day ≈ ~100 images/day at no cost.

## Output

Generated images are saved to `/tmp/pi-image-ai/generated-YYYY-MM-DDTHH-MM-SS.png`.

## Design

- **Provider-agnostic:** Backends are swappable via environment variables
- **Lane-aware:** Private extensions can override backends for security-sensitive contexts
- **Minimal dependencies:** Uses only `fetch` (native) and `node:fs`
