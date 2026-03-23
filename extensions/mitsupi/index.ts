/**
 * Mitsupi Extension - Personal pi extensions
 * Aggregates multiple command modules into a single extension
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import answer from "./answer.js";
import context from "./context.js";
import control from "./control.js";
import files from "./files.js";
import goToBed from "./go-to-bed.js";
import loop from "./loop.js";
import notify from "./notify.js";
import promptEditor from "./prompt-editor.js";
import review from "./review.js";
import sessionBreakdown from "./session-breakdown.js";
import todos from "./todos.js";
import uv from "./uv.js";
import whimsical from "./whimsical.js";

export default function (pi: ExtensionAPI) {
	// Register all sub-extensions
	answer(pi);
	context(pi);
	control(pi);
	files(pi);
	goToBed(pi);
	loop(pi);
	notify(pi);
	promptEditor(pi);
	review(pi);
	sessionBreakdown(pi);
	todos(pi);
	uv(pi);
	whimsical(pi);
}
