#!/bin/bash
# Agent文件批量生成脚本
# 使用方法：bash scripts/generate_remaining_agents.sh

set -e

WORKSPACE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SUBTASKS_DIR="$WORKSPACE_ROOT/src/core/costrict/wiki/wiki-prompts/subtasks"
PROMPTS_DIR="$WORKSPACE_ROOT/src/core/costrict/wiki/参考提示词/kb-commands/prompts"

echo "📝 批量生成 Wiki Prompts Agent 文件"
echo "工作目录: $WORKSPACE_ROOT"
echo ""

# 定义文档映射: "编号:markdown文件名:常量名:agent名称"
AGENTS=(
  "02:02-仓库依赖.md:REPOSITORY_DEPENDENCIES_MD:REPOSITORY_DEPENDENCIES_AGENT:仓库依赖文档"
  "03:06-数据结构.md:DATA_STRUCTURE_MD:DATA_STRUCTURE_AGENT:数据结构文档"
  "04:03-核心业务领域.md:CORE_BUSINESS_MD:CORE_BUSINESS_AGENT:核心业务领域文档"
  "05:04-API文档.md:API_INDEX_MD:API_INDEX_AGENT:API索引文档"
  "06:10-业务流程索引.md:BUSINESS_FLOW_INDEX_MD:BUSINESS_FLOW_INDEX_AGENT:业务流程索引文档"
  "07:09-业务流程详解.md:BUSINESS_FLOW_DETAIL_MD:BUSINESS_FLOW_DETAIL_AGENT:业务流程详解文档"
  "08:05-代码编写指南.md:CODE_GUIDE_MD:CODE_GUIDE_AGENT:代码编写指南文档"
  "09:07-单元测试.md:UNIT_TEST_MD:UNIT_TEST_AGENT:单元测试文档"
  "10:11-外部接入指南.md:EXTERNAL_INTEGRATION_MD:EXTERNAL_INTEGRATION_AGENT:外部接入指南文档"
  "11:12-排障指南.md:TROUBLESHOOTING_MD:TROUBLESHOOTING_AGENT:排障指南文档"
  "12:01-仓库概览.md:REPOSITORY_OVERVIEW_MD:REPOSITORY_OVERVIEW_AGENT:仓库概览文档"
)

# 生成单个agent文件的函数
generate_agent() {
  local num=$1
  local md_file=$2
  local const_name=$3
  local agent_name=$4
  local doc_title=$5

  local output_file="$SUBTASKS_DIR/${num}_${agent_name//_/-}-agent.ts"
  local md_path="$PROMPTS_DIR/$md_file"

  if [ ! -f "$md_path" ]; then
    echo "❌ 错误: markdown文件不存在: $md_path"
    return 1
  fi

  echo "   生成: ${num}_${agent_name//_/-}-agent.ts"

  # 读取markdown内容并转义（反引号和美元符号）
  local md_content=$(cat "$md_path" | sed 's/`/\\`/g' | sed 's/\$/\\\$/g')

  # 生成TypeScript文件（使用不展开变量的 heredoc）
  cat > "$output_file" << 'ENDOFFILE'
// DOCTITLE生成 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants";

export const AGENTNAME_TEMPLATE = (workspace: string) => `
MDCONTENT
`;

export default AGENTNAME_TEMPLATE;
ENDOFFILE

  # 替换占位符
  sed -i "s/DOCTITLE/${doc_title}/g" "$output_file"
  sed -i "s/AGENTNAME/${agent_name}/g" "$output_file"

  # 使用临时文件来替换 MDCONTENT（避免 sed 处理特殊字符问题）
  awk -v content="$md_content" '{gsub(/MDCONTENT/, content)}1' "$output_file" > "$output_file.tmp"
  mv "$output_file.tmp" "$output_file"

  # 替换路径
  sed -i "s|doc/kb/|\${workspace}/\${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}|g" "$output_file"
  sed -i "s|\\\`doc/kb/|\\\\\\\`\${workspace}/\${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}|g" "$output_file"
}

# 批量生成文档agents (02-12)
echo "🔨 生成文档agents (02-12)..."
for agent_def in "${AGENTS[@]}"; do
  IFS=':' read -r num md_file const_name agent_name doc_title <<< "$agent_def"
  generate_agent "$num" "$md_file" "$const_name" "$agent_name" "$doc_title"
done

# 生成质量管理agents (97-99)
echo ""
echo "🔨 生成质量管理agents (97-99)..."

# 97 - 质量优化
echo "   生成: 97_quality-optimization-agent.ts"
md_content=$(cat "$WORKSPACE_ROOT/src/core/costrict/wiki/参考提示词/kb-commands/kb-optimize.md" | sed 's/`/\\`/g' | sed 's/\$/\\\$/g')
cat > "$SUBTASKS_DIR/97_quality-optimization-agent.ts" << 'ENDOFFILE'
// 质量优化 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants";

export const QUALITY_OPTIMIZATION_AGENT_TEMPLATE = (workspace: string) => `
MDCONTENT
`;

export default QUALITY_OPTIMIZATION_AGENT_TEMPLATE;
ENDOFFILE
awk -v content="$md_content" '{gsub(/MDCONTENT/, content)}1' "$SUBTASKS_DIR/97_quality-optimization-agent.ts" > "$SUBTASKS_DIR/97_quality-optimization-agent.ts.tmp"
mv "$SUBTASKS_DIR/97_quality-optimization-agent.ts.tmp" "$SUBTASKS_DIR/97_quality-optimization-agent.ts"
sed -i "s|doc/kb/|\${workspace}/\${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}|g" "$SUBTASKS_DIR/97_quality-optimization-agent.ts"

# 98 - 质量评估
echo "   生成: 98_quality-evaluation-agent.ts"
md_content=$(cat "$WORKSPACE_ROOT/src/core/costrict/wiki/参考提示词/kb-commands/kb-eval.md" | sed 's/`/\\`/g' | sed 's/\$/\\\$/g')
cat > "$SUBTASKS_DIR/98_quality-evaluation-agent.ts" << 'ENDOFFILE'
// 质量评估 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants";

export const QUALITY_EVALUATION_AGENT_TEMPLATE = (workspace: string) => `
MDCONTENT
`;

export default QUALITY_EVALUATION_AGENT_TEMPLATE;
ENDOFFILE
awk -v content="$md_content" '{gsub(/MDCONTENT/, content)}1' "$SUBTASKS_DIR/98_quality-evaluation-agent.ts" > "$SUBTASKS_DIR/98_quality-evaluation-agent.ts.tmp"
mv "$SUBTASKS_DIR/98_quality-evaluation-agent.ts.tmp" "$SUBTASKS_DIR/98_quality-evaluation-agent.ts"
sed -i "s|doc/kb/|\${workspace}/\${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}|g" "$SUBTASKS_DIR/98_quality-evaluation-agent.ts"

# 99 - 增量更新
echo "   生成: 99_incremental-update-agent.ts"
md_content=$(cat "$WORKSPACE_ROOT/src/core/costrict/wiki/参考提示词/kb-commands/kb-update.md" | sed 's/`/\\`/g' | sed 's/\$/\\\$/g')
cat > "$SUBTASKS_DIR/99_incremental-update-agent.ts" << 'ENDOFFILE'
// 增量更新 Agent
import { WIKI_OUTPUT_FILE_PATHS } from "../common/constants";

export const INCREMENTAL_UPDATE_AGENT_TEMPLATE = (workspace: string) => `
MDCONTENT
`;

export default INCREMENTAL_UPDATE_AGENT_TEMPLATE;
ENDOFFILE
awk -v content="$md_content" '{gsub(/MDCONTENT/, content)}1' "$SUBTASKS_DIR/99_incremental-update-agent.ts" > "$SUBTASKS_DIR/99_incremental-update-agent.ts.tmp"
mv "$SUBTASKS_DIR/99_incremental-update-agent.ts.tmp" "$SUBTASKS_DIR/99_incremental-update-agent.ts"
sed -i "s|doc/kb/|\${workspace}/\${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}|g" "$SUBTASKS_DIR/99_incremental-update-agent.ts"

echo ""
echo "✅ 完成！生成了以下agent文件："
ls -1 "$SUBTASKS_DIR"/*.ts | wc -l
echo ""
echo "📋 文件列表："
ls -1 "$SUBTASKS_DIR"/*.ts

echo ""
echo "🎉 所有agent文件生成完成！"
