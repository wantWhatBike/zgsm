import { ToolArgs } from "../../prompts/tools/types"

export function getSearchCodesDescription(args: ToolArgs): string {
	return `## search_codes
Description: Search for code files and their dependencies from the knowledge graph based on keywords. This tool performs full-text retrieval across file summaries (description, keywords, and function names) in the knowledge graph. If the knowledge graph is not available, it will automatically fall back to the search_files tool.

IMPORTANT: Before using this tool, expand the search keywords to include synonyms and related terms to improve search coverage. For example, if searching for "authentication", also include terms like "auth", "login", "signin", "credential", "session", etc. Limit the total number of keywords to a maximum of 10.

Parameters:
- keywords: (required) A JSON array of search keywords. Include the main term and its synonyms/related terms. Maximum 10 keywords total. Example: ["authenticate", "auth", "login", "signin"]
- type: (optional) Search type - "precise" for exact matching or "fuzzy" for partial matching. Default is "precise".
  - "precise": Exact match on keywords array, exact match on function names
  - "fuzzy": Partial match on keywords array, substring match on function names
- max_results: (optional) Maximum number of results to return. Default is 5.

Returns: A JSON array of matching files with:
- path: File path
- description: File description
- match_functions: List of matched function names
- dependencies: File dependencies

Usage:
<search_codes>
<keywords>["authenticate", "auth", "login", "signin"]</keywords>
<type>fuzzy</type>
<max_results>5</max_results>
</search_codes>

Example: Search for authentication-related code with synonyms
<search_codes>
<keywords>["authenticate", "auth", "login", "signin", "credential", "session"]</keywords>
<type>fuzzy</type>
</search_codes>

Example: Precise search for specific function names
<search_codes>
<keywords>["handleLogin", "processAuth", "validateUser"]</keywords>
<type>precise</type>
<max_results>3</max_results>
</search_codes>`
}

