import type OpenAI from "openai"

const ASK_MULTIPLE_CHOICE_DESCRIPTION = `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Use allow_multiple: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add \"(Recommended)\" at the end of the label

Example (single-select + multi-select):
{ "title": "Project Setup", "questions": [
  { "id": "framework", "prompt": "Which framework would you like to use?", "allow_multiple": false,
    "options": [{ "id": "react", "label": "React" }, { "id": "vue", "label": "Vue.js" }] },
  { "id": "features", "prompt": "Select additional features:", "allow_multiple": true,
    "options": [{ "id": "typescript", "label": "TypeScript" }, { "id": "linting", "label": "ESLint + Prettier" }] }
]}`

export default {
	type: "function",
	function: {
		name: "ask_multiple_choice",
		description: ASK_MULTIPLE_CHOICE_DESCRIPTION,
		strict: true,
		parameters: {
			type: "object",
			properties: {
				title: { type: "string" },
				questions: {
					type: "array",
					minItems: 1,
					items: {
						type: "object",
						properties: {
							id: { type: "string" },
							prompt: { type: "string" },
							allow_multiple: { type: "boolean" },
							options: {
								type: "array",
								minItems: 2,
								items: {
									type: "object",
									properties: {
										id: { type: "string" },
										label: { type: "string" },
									},
									required: ["id", "label"],
									additionalProperties: false,
								},
							},
						},
						required: ["id", "prompt", "options"],
						additionalProperties: false,
					},
				},
			},
			required: ["questions"],
			additionalProperties: false,
		},
	},
} satisfies OpenAI.Chat.ChatCompletionTool


