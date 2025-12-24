export function getAskMultipleChoiceDescription(): string {
	return `## ask_multiple_choice
Description: Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add \"(Recommended)\" at the end of the label

CRITICAL: Every question and every option MUST have an id field - results cannot be matched without ids.

Parameters:
- title: (optional) A brief title for the decision group.
- questions: (REQUIRED) An array of question objects (at least 1).
  - id: (REQUIRED) A unique, program-friendly identifier (slug) for the question (e.g., "framework_choice").
  - prompt: (REQUIRED) The text question to display to the user.
  - options: (REQUIRED) An array of option objects (at least 2).
    - id: (REQUIRED) A unique, program-friendly identifier (slug) for the option (e.g., "react", "vue").
    - label: (REQUIRED) The user-facing display text.
  - allow_multiple: (optional) Set to 'true' for checkboxes (multi-select), 'false' for radio buttons (single-select). Defaults to false.

Usage:
<ask_multiple_choice>
  <title>Decision Title</title>
  <questions>
    <question>
      <id>question_slug</id>
      <prompt>Question text?</prompt>
      <options>
        <option>
          <id>option_slug_1</id>
          <label>Option 1 Label</label>
        </option>
        <option>
          <id>option_slug_2</id>
          <label>Option 2 Label</label>
        </option>
      </options>
      <allow_multiple>false</allow_multiple>
    </question>
  </questions>
</ask_multiple_choice>

Example:
<ask_multiple_choice>
  <title>Project Setup</title>
  <questions>
    <question>
      <id>framework</id>
      <prompt>Which framework would you like to use?</prompt>
      <options>
        <option>
          <id>react</id>
          <label>React</label>
        </option>
        <option>
          <id>vue</id>
          <label>Vue.js</label>
        </option>
      </options>
      <allow_multiple>false</allow_multiple>
    </question>
    <question>
      <id>features</id>
      <prompt>Select additional features:</prompt>
      <options>
        <option>
          <id>typescript</id>
          <label>TypeScript</label>
        </option>
        <option>
          <id>linting</id>
          <label>ESLint + Prettier</label>
        </option>
      </options>
      <allow_multiple>true</allow_multiple>
    </question>
  </questions>
</ask_multiple_choice>`
}
