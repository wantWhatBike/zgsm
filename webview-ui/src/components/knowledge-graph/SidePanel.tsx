/**
 * 右侧详情面板组件
 */
import { X, ExternalLink, Folder, File } from "lucide-react"
import type { GraphNode, GraphData } from "@roo-code/types"

interface SidePanelProps {
	node: GraphNode | null
	graphData: GraphData
	onClose: () => void
	onOpenFile: (node: GraphNode) => void
}

export const SidePanel = ({ node, graphData, onClose, onOpenFile }: SidePanelProps) => {
	if (!node) return null
	
	// 查找相关节点
	const children = graphData.nodes.filter(n => n.parentId === node.id)
	const dependencies = graphData.links
		.filter(link => {
			const sourceId = typeof link.source === 'string' ? link.source : link.source
			return sourceId === node.id && link.type === 'import'
		})
		.map(link => {
			const targetId = typeof link.target === 'string' ? link.target : link.target
			return graphData.nodes.find(n => n.id === targetId)
		})
		.filter(Boolean) as GraphNode[]
	
	const dependedBy = graphData.links
		.filter(link => {
			const targetId = typeof link.target === 'string' ? link.target : link.target
			return targetId === node.id && link.type === 'import'
		})
		.map(link => {
			const sourceId = typeof link.source === 'string' ? link.source : link.source
			return graphData.nodes.find(n => n.id === sourceId)
		})
		.filter(Boolean) as GraphNode[]
	
	const getTypeIcon = () => {
		if (node.type === 'directory') return <Folder className="w-5 h-5" />
		return <File className="w-5 h-5" />
	}
	
	const getTypeColor = () => {
		if (node.type === 'directory') return '#8b5cf6'
		if (node.fileType === 'source') return '#06b6d4'
		if (node.fileType === 'test') return '#10b981'
		if (node.fileType === 'config') return '#f59e0b'
		return '#666'
	}
	
	return (
		<div
			style={{
				position: "fixed",
				right: 0,
				top: 0,
				bottom: 0,
				width: "380px",
				background: "rgba(20, 20, 20, 0.95)",
				borderLeft: "1px solid rgba(255, 255, 255, 0.1)",
				color: "#fff",
				overflowY: "auto",
				zIndex: 1000,
				backdropFilter: "blur(10px)",
				animation: "slideIn 0.2s ease-out",
			}}
		>
			<style>
				{`
					@keyframes slideIn {
						from {
							transform: translateX(100%);
						}
						to {
							transform: translateX(0);
						}
					}
				`}
			</style>
			
			{/* 头部 */}
			<div style={{ 
				padding: "20px", 
				borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
				position: "sticky",
				top: 0,
				background: "rgba(20, 20, 20, 0.95)",
				zIndex: 1
			}}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
					<div style={{ flex: 1, marginRight: "12px" }}>
						<div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
							<div style={{ color: getTypeColor() }}>
								{getTypeIcon()}
							</div>
							<h3 style={{ 
								fontSize: "18px", 
								fontWeight: "600",
								margin: 0,
								wordBreak: "break-all"
							}}>
								{node.label}
							</h3>
						</div>
						<div style={{ fontSize: "12px", color: "#888" }}>
							{node.id}
						</div>
					</div>
					<button
						onClick={onClose}
						style={{
							background: "transparent",
							border: "none",
							color: "#fff",
							cursor: "pointer",
							padding: "4px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: "4px",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "transparent"
						}}
					>
						<X className="w-5 h-5" />
					</button>
				</div>
				
				{node.type === 'file' && (
					<button
						onClick={() => onOpenFile(node)}
						style={{
							marginTop: "12px",
							width: "100%",
							padding: "10px 16px",
							background: "#3b82f6",
							border: "none",
							borderRadius: "6px",
							color: "#fff",
							fontSize: "14px",
							fontWeight: "500",
							cursor: "pointer",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							gap: "8px",
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "#2563eb"
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "#3b82f6"
						}}
					>
						<ExternalLink className="w-4 h-4" />
						在编辑器中打开
					</button>
				)}
			</div>
			
			{/* 内容 */}
			<div style={{ padding: "20px" }}>
				{/* 描述 */}
				{node.description && (
					<Section title="描述">
						<p style={{ margin: 0, color: "#ccc", lineHeight: "1.6" }}>
							{node.description}
						</p>
					</Section>
				)}
				
				{/* 父目录 */}
				{node.parentId && (
					<Section title="父目录">
						<div style={{ 
							padding: "8px 12px",
							background: "rgba(255, 255, 255, 0.05)",
							borderRadius: "4px",
							fontSize: "13px",
							color: "#aaa",
							fontFamily: "monospace"
						}}>
							{node.parentId}
						</div>
					</Section>
				)}
				
				{/* 子节点（目录） */}
				{node.type === 'directory' && children.length > 0 && (
					<Section title={`子节点 (${children.length})`}>
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							{children.slice(0, 10).map((child) => (
								<div
									key={child.id}
									style={{
										padding: "8px 12px",
										background: "rgba(255, 255, 255, 0.05)",
										borderRadius: "4px",
										fontSize: "13px",
										display: "flex",
										alignItems: "center",
										gap: "8px"
									}}
								>
									{child.type === 'directory' ? 
										<Folder className="w-4 h-4" style={{ color: '#8b5cf6' }} /> : 
										<File className="w-4 h-4" style={{ color: '#06b6d4' }} />
									}
									<span>{child.label}</span>
								</div>
							))}
							{children.length > 10 && (
								<div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
									...还有 {children.length - 10} 个
								</div>
							)}
						</div>
					</Section>
				)}
				
				{/* 依赖项（文件） */}
				{node.type === 'file' && dependencies.length > 0 && (
					<Section title={`依赖项 (${dependencies.length})`}>
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							{dependencies.slice(0, 10).map((dep) => (
								<div
									key={dep.id}
									style={{
										padding: "8px 12px",
										background: "rgba(255, 255, 255, 0.05)",
										borderRadius: "4px",
										fontSize: "12px",
										color: "#aaa",
										fontFamily: "monospace",
										wordBreak: "break-all"
									}}
								>
									{dep.id}
								</div>
							))}
							{dependencies.length > 10 && (
								<div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
									...还有 {dependencies.length - 10} 个
								</div>
							)}
						</div>
					</Section>
				)}
				
				{/* 被依赖（文件） */}
				{node.type === 'file' && dependedBy.length > 0 && (
					<Section title={`被以下文件依赖 (${dependedBy.length})`}>
						<div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
							{dependedBy.slice(0, 10).map((dep) => (
								<div
									key={dep.id}
									style={{
										padding: "8px 12px",
										background: "rgba(255, 255, 255, 0.05)",
										borderRadius: "4px",
										fontSize: "12px",
										color: "#aaa",
										fontFamily: "monospace",
										wordBreak: "break-all"
									}}
								>
									{dep.id}
								</div>
							))}
							{dependedBy.length > 10 && (
								<div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>
									...还有 {dependedBy.length - 10} 个
								</div>
							)}
						</div>
					</Section>
				)}
				
				{/* 类型信息 */}
				<Section title="类型信息">
					<div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }}>
						<InfoItem label="节点类型" value={node.type === 'directory' ? '目录' : '文件'} />
						{node.fileType && (
							<InfoItem 
								label="文件类型" 
								value={
									node.fileType === 'source' ? '源代码' :
									node.fileType === 'test' ? '测试文件' :
									node.fileType === 'config' ? '配置文件' : node.fileType
								} 
							/>
						)}
					</div>
				</Section>
			</div>
		</div>
	)
}

// 辅助组件
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
	<div style={{ marginBottom: "24px" }}>
		<h4 style={{ 
			fontSize: "14px", 
			fontWeight: "600",
			marginBottom: "12px",
			color: "#fff",
			textTransform: "uppercase",
			letterSpacing: "0.5px"
		}}>
			{title}
		</h4>
		{children}
	</div>
)

const InfoItem = ({ label, value }: { label: string; value: string }) => (
	<div style={{ display: "flex", justifyContent: "space-between" }}>
		<span style={{ color: "#888" }}>{label}:</span>
		<span style={{ color: "#fff", fontWeight: "500" }}>{value}</span>
	</div>
)

