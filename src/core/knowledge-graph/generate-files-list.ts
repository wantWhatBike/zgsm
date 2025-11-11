import { ToolArgs } from "../../../../src/core/prompts/tools/types"
import { OUTPUT_FILENAMES } from "./knowledge_graph_extractor"

export function getGenerateFilesListDescription(args: ToolArgs): string {
	return `## generate_files_list
Description: Generate a list of all file paths from source_dir and output to target_dir with the filename ${OUTPUT_FILENAMES.FILE_LIST}. Paths are relative to source_dir, only files are included (not directories). Skips patterns defined in .gitignore/.rooignore/.coignore files.
Parameters:
- source_dir: (required) Source directory path (relative to the current workspace directory ${args.cwd})
- target_dir: (required) Target directory path (relative to the current workspace directory ${args.cwd})
Usage:
<generate_files_list>
<source_dir>Directory path here</source_dir>
<target_dir>Target directory path here</target_dir>
</generate_files_list>

Example: Generate project file list
<generate_files_list>
<source_dir>.</source_dir>
<target_dir>.cospec/knowledge-graph</target_dir>
</generate_files_list>`
}