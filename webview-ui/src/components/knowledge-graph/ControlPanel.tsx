/**
 * 控制面板组件
 * 提供缩放、搜索、过滤等功能
 */
import { useState, useMemo, useCallback } from "react"
import { Search, ZoomIn, ZoomOut, RotateCcw, Filter, ChevronDown, ChevronUp } from "lucide-react"
import type { GraphData, GraphNode } from "@roo-code/types"

interface ControlPanelProps {
	graphData: GraphData
	zoom: number
	onZoomChange: (zoom: number) => void
	onResetView: () => void
	onFlyToNode: (node: GraphNode) => void
	onFilterChange?: (filter: NodeFilter) => void
}

export interface NodeFilter {
	showDirectories: boolean
	showFiles: boolean
	showSource: boolean
	showTest: boolean
	showConfig: boolean
}

export const ControlPanel = ({ 
	graphData, 
	zoom, 
	onZoomChange, 
	onResetView, 
	onFlyToNode,
	onFilterChange 
}: ControlPanelProps) => {
	const [searchTerm, setSearchTerm] = useState("")
	const [isFilterOpen, setIsFilterOpen] = useState(false)
	const [filter, setFilter] = useState<NodeFilter>({
		showDirectories: true,
		showFiles: true,
		showSource: true,
		showTest: true,
		showConfig: true,
	})
	
	// 搜索结果
	const searchResults = useMemo(() => {
		if (!searchTerm.trim()) return []
		const term = searchTerm.toLowerCase()
		return graphData.nodes
			.filter(node => 
				node.label.toLowerCase().includes(term) ||
				node.id.toLowerCase().includes(term)
			)
			.slice(0, 10) // 限制结果数量
	}, [graphData.nodes, searchTerm])
	
	// 处理缩放
	const handleZoomIn = useCallback(() => {
		onZoomChange(Math.min(zoom * 1.2, 3))
	}, [zoom, onZoomChange])
	
	const handleZoomOut = useCallback(() => {
		onZoomChange(Math.max(zoom / 1.2, 0.1))
	}, [zoom, onZoomChange])
	
	// 处理过滤器变化
	const handleFilterChange = useCallback((key: keyof NodeFilter, value: boolean) => {
		const newFilter = { ...filter, [key]: value }
		setFilter(newFilter)
		onFilterChange?.(newFilter)
	}, [filter, onFilterChange])
	
	return (
		<div
			style={{
				position: "fixed",
				top: "80px",
				right: "20px",
				background: "var(--vscode-sideBar-background, rgba(20, 20, 20, 0.95))",
				border: "1px solid var(--vscode-panel-border, rgba(255, 255, 255, 0.2))",
				borderRadius: "8px",
				color: "var(--vscode-foreground, #fff)",
				width: "280px",
				backdropFilter: "blur(10px)",
				boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
				zIndex: 999,
			}}
		>
			{/* 搜索框 */}
			<div style={{ padding: "16px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
				<div style={{ position: "relative" }}>
					<Search 
						style={{
							position: "absolute",
							left: "12px",
							top: "50%",
							transform: "translateY(-50%)",
							color: "#888",
							width: "16px",
							height: "16px"
						}}
					/>
					<input
						type="text"
						placeholder="搜索节点..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						style={{
							width: "100%",
							padding: "8px 12px 8px 36px",
							background: "rgba(255, 255, 255, 0.1)",
							border: "1px solid rgba(255, 255, 255, 0.2)",
							borderRadius: "6px",
							color: "#fff",
							fontSize: "13px",
							outline: "none",
						}}
					/>
				</div>
				
				{/* 搜索结果 */}
				{searchResults.length > 0 && (
					<div
						style={{
							marginTop: "8px",
							maxHeight: "200px",
							overflowY: "auto",
							background: "rgba(0, 0, 0, 0.3)",
							borderRadius: "4px",
							padding: "4px",
						}}
					>
						{searchResults.map((node) => (
							<div
								key={node.id}
								onClick={() => {
									onFlyToNode(node)
									setSearchTerm("")
								}}
								style={{
									padding: "8px 10px",
									cursor: "pointer",
									borderRadius: "4px",
									fontSize: "12px",
									marginBottom: "2px",
									background: "transparent",
									transition: "background 0.2s",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "transparent"
								}}
							>
								<div style={{ fontWeight: "500" }}>{node.label}</div>
								<div style={{ color: "#888", fontSize: "11px", marginTop: "2px" }}>
									{node.type === 'directory' ? '📁' : '📄'} {node.id}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
			
			{/* 缩放控制 */}
			<div style={{ padding: "16px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}>
				<div style={{ 
					fontSize: "12px", 
					color: "#888", 
					marginBottom: "8px",
					textTransform: "uppercase",
					letterSpacing: "0.5px"
				}}>
					缩放控制
				</div>
				<div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
					<ControlButton onClick={handleZoomOut} title="缩小">
						<ZoomOut className="w-4 h-4" />
					</ControlButton>
					<div style={{ 
						flex: 1, 
						textAlign: "center", 
						fontSize: "13px",
						fontFamily: "monospace",
						color: "#fff"
					}}>
						{(zoom * 100).toFixed(0)}%
					</div>
					<ControlButton onClick={handleZoomIn} title="放大">
						<ZoomIn className="w-4 h-4" />
					</ControlButton>
					<ControlButton onClick={onResetView} title="重置视图">
						<RotateCcw className="w-4 h-4" />
					</ControlButton>
				</div>
			</div>
			
			{/* 过滤器 */}
			<div style={{ padding: "16px" }}>
				<div 
					onClick={() => setIsFilterOpen(!isFilterOpen)}
					style={{ 
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						cursor: "pointer",
						marginBottom: isFilterOpen ? "12px" : 0
					}}
				>
					<div style={{ 
						fontSize: "12px", 
						color: "#888",
						textTransform: "uppercase",
						letterSpacing: "0.5px",
						display: "flex",
						alignItems: "center",
						gap: "6px"
					}}>
						<Filter className="w-4 h-4" />
						过滤器
					</div>
					{isFilterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
				</div>
				
				{isFilterOpen && (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						<FilterCheckbox
							label="显示目录"
							checked={filter.showDirectories}
							onChange={(checked) => handleFilterChange('showDirectories', checked)}
						/>
						<FilterCheckbox
							label="显示文件"
							checked={filter.showFiles}
							onChange={(checked) => handleFilterChange('showFiles', checked)}
						/>
						<div style={{ 
							marginLeft: "20px", 
							display: "flex", 
							flexDirection: "column", 
							gap: "6px",
							opacity: filter.showFiles ? 1 : 0.5
						}}>
							<FilterCheckbox
								label="源代码"
								checked={filter.showSource}
								onChange={(checked) => handleFilterChange('showSource', checked)}
								disabled={!filter.showFiles}
							/>
							<FilterCheckbox
								label="测试文件"
								checked={filter.showTest}
								onChange={(checked) => handleFilterChange('showTest', checked)}
								disabled={!filter.showFiles}
							/>
							<FilterCheckbox
								label="配置文件"
								checked={filter.showConfig}
								onChange={(checked) => handleFilterChange('showConfig', checked)}
								disabled={!filter.showFiles}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// 辅助组件
const ControlButton = ({ 
	onClick, 
	title, 
	children 
}: { 
	onClick: () => void
	title: string
	children: React.ReactNode 
}) => (
	<button
		onClick={onClick}
		title={title}
		style={{
			padding: "8px",
			background: "rgba(255, 255, 255, 0.1)",
			border: "1px solid rgba(255, 255, 255, 0.2)",
			borderRadius: "6px",
			color: "#fff",
			cursor: "pointer",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			transition: "all 0.2s",
		}}
		onMouseEnter={(e) => {
			e.currentTarget.style.background = "rgba(255, 255, 255, 0.2)"
			e.currentTarget.style.transform = "scale(1.05)"
		}}
		onMouseLeave={(e) => {
			e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"
			e.currentTarget.style.transform = "scale(1)"
		}}
	>
		{children}
	</button>
)

const FilterCheckbox = ({ 
	label, 
	checked, 
	onChange,
	disabled = false
}: { 
	label: string
	checked: boolean
	onChange: (checked: boolean) => void
	disabled?: boolean
}) => (
	<label
		style={{
			display: "flex",
			alignItems: "center",
			gap: "8px",
			fontSize: "13px",
			cursor: disabled ? "not-allowed" : "pointer",
			opacity: disabled ? 0.5 : 1
		}}
	>
		<input
			type="checkbox"
			checked={checked}
			onChange={(e) => onChange(e.target.checked)}
			disabled={disabled}
			style={{
				width: "16px",
				height: "16px",
				cursor: disabled ? "not-allowed" : "pointer"
			}}
		/>
		{label}
	</label>
)

