import * as path from "path"
import { getGlobalCommandsDir } from "../wiki-prompts/subtasks/constants"

/**
 * Check if the path is the .roo/commands directory or its subdirectory
 * @param filePath The file path to check
 * @returns Returns true if the path is the .roo/commands directory or its subdirectory
 */
export function isRooGlobalCommandsDirectory(filePath: string): boolean {
	const absolutePath = path.resolve(filePath)
	const globalCommandsDir = getGlobalCommandsDir()

	// Check if the path starts with the .roo/commands directory
	return absolutePath.startsWith(globalCommandsDir + path.sep) || absolutePath === globalCommandsDir
}

/**
 * Handle approval skip logic for .roo/commands directory files
 * @param fileResult The file result object
 * @param relPath The relative path
 * @param cline The cline instance
 * @param updateFileResult The function to update file result
 * @returns Returns true if approval was skipped, otherwise returns false
 */
export function handleRooCommandsApprovalSkip(
	fileResult: any,
	relPath: string,
	cline: any,
	updateFileResult: (relPath: string, result: any) => void,
): boolean {
	if (fileResult.status === "pending") {
		const fullPath = path.resolve(cline.cwd, relPath)
		if (isRooGlobalCommandsDirectory(fullPath)) {
			// Auto-approve .roo/commands files
			updateFileResult(relPath, {
				status: "approved",
			})
			return true
		}
	}
	return false
}
