#!/usr/bin/env node

const url = process.argv[2];

if (!url) {
	console.log("Usage: jina.js <url>");
	console.log("\nExtracts readable content from a webpage using Jina AI Reader (free).");
	console.log("\nExamples:");
	console.log("  jina.js https://example.com/article");
	console.log("  jina.js https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html");
	process.exit(1);
}

// Ensure URL has protocol
let targetUrl = url;
if (!url.startsWith("http://") && !url.startsWith("https://")) {
	targetUrl = `https://${url}`;
}

const jinaUrl = `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//, "")}`;

try {
	const response = await fetch(jinaUrl, {
		headers: {
			"Accept": "text/plain",
		},
		signal: AbortSignal.timeout(30000),
	});

	if (!response.ok) {
		console.error(`HTTP ${response.status}: ${response.statusText}`);
		process.exit(1);
	}

	const content = await response.text();

	if (!content || content.trim().length === 0) {
		console.error("No content extracted from this page.");
		process.exit(1);
	}

	console.log(content);
} catch (e) {
	console.error(`Error: ${e.message}`);
	process.exit(1);
}
