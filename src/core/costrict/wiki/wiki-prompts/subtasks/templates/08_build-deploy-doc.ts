import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS, ADVANCED_TOOL_STRATEGY } from "../../common/constants";

export const BUILD_DEPLOY_DOC_TEMPLATE = (workspace: string) => `# 构建部署文档生成

## 角色定义
您是技术文档撰写专家，负责生成构建部署文档，帮助AI理解项目的构建流程、CI/CD配置和部署方式。

## 核心原则
${ADVANCED_TOOL_STRATEGY}
- 文档优先服务AI（理解构建和部署流程以正确运行项目）
- **可选图表**：复杂部署架构可使用图表
- 所有命令/YAML 片段必须注明来源文件
- 在引用任何文件前必须确认其存在，若不存在则跳过该小节并说明原因
- 禁止编造配置或命令

## 输入参数
- **文档信息**：
  - docId: "08"
  - docName: "构建部署"
  - docFilename: "08_构建部署.md"
  - relatedSources: 构建部署相关文件
  - contextScope: 上下文范围
  - globalContext: 全局上下文
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：提取构建证据 (EBR)
1. **脚本分析**：
   - 读取 \`package.json\` 或 \`Makefile\`。
   - **证据要求**：必须提取 \`scripts\` 区块或 Makefile target 定义。
2. **容器化分析**：
   - 读取 \`Dockerfile\` 或 \`docker-compose.yml\`。
   - **证据要求**：提取 \`FROM\`, \`RUN build\` 等关键指令。

### 步骤2：提取 CI/CD 证据
1. **流程扫描**：基于 \`contextScope\` 扫描 \`.github/workflows/\` 等目录。
2. **逻辑提取**：
   - 读取核心 CI 配置文件。
   - **证据要求**：提取定义 Build/Test/Deploy 步骤的 YAML 片段。

### 步骤3：分析环境配置
1. **变量提取**：读取 \`.env.example\`，提取环境变量列表。

### 步骤4：生成文档
- 输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}08_构建部署.md\`
- **强制**：在描述构建流程前，先展示提取到的脚本/配置片段。

## 输出格式

\`\`\`markdown
# 构建部署

<details>
<summary>相关源文件</summary>

- package.json
- Dockerfile
- docker-compose.yml
- .github/workflows/ci.yml
- .env.example
- scripts/deploy.sh
- ...

</details>

## 概述
本文档描述项目的构建流程、CI/CD配置和部署方式。
来源: 构建和部署配置分析

## 本地开发

### 环境要求

| 依赖 | 版本要求 | 说明 |
|-----|---------|-----|
| Node.js | >= 18.x | 运行环境 |
| npm | >= 9.x | 包管理器 |
| Docker | >= 20.x | 容器化（可选） |
| PostgreSQL | >= 14.x | 数据库 |

来源: package.json engines, README.md

### 环境配置

\`\`\`bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
vim .env
\`\`\`

**必需环境变量**

| 变量名 | 说明 | 示例值 |
|-------|-----|-------|
| DATABASE_URL | 数据库连接 | postgresql://user:pass@localhost:5432/db |
| REDIS_URL | Redis连接 | redis://localhost:6379 |
| JWT_SECRET | JWT密钥 | your-secret-key |
| PORT | 服务端口 | 3000 |

来源: .env.example

### 安装依赖

\`\`\`bash
# 安装项目依赖
npm install

# 安装开发依赖（如果需要）
npm install --include=dev
\`\`\`

来源: package.json

### 启动服务

\`\`\`bash
# 开发模式（热重载）
npm run dev

# 生产模式
npm start

# 调试模式
npm run debug
\`\`\`

来源: package.json scripts

---

## 构建流程

### 构建命令

\`\`\`bash
# TypeScript 编译
npm run build

# 类型检查（不生成文件）
npm run type-check

# 清理构建产物
npm run clean
\`\`\`

来源: package.json scripts

### 构建配置

**构建脚本证据 (Build Script Evidence)**

\`\`\`json
// 摘自: package.json
// (必须展示真实存在的 scripts 配置)
{
  "scripts": {
    "build": "tsc && npm run copy-assets",
    "build:prod": "NODE_ENV=production npm run build",
    "clean": "rimraf dist",
    "type-check": "tsc --noEmit"
  }
}
\`\`\`

来源: package.json

### 构建产物

\`\`\`
dist/
├── index.js          # 入口文件
├── api/              # API层编译结果
├── service/          # Service层编译结果
├── models/           # 模型层编译结果
└── utils/            # 工具函数编译结果
\`\`\`

来源: tsconfig.json outDir

---

## Docker 容器化

### Dockerfile

\`\`\`dockerfile
# 摘自: Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000
CMD ["npm", "start"]
\`\`\`

来源: Dockerfile

### Docker Compose

\`\`\`yaml
# 摘自: docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/app
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: app
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
\`\`\`

来源: docker-compose.yml

### Docker 命令

\`\`\`bash
# 构建镜像
docker build -t myapp:latest .

# 使用 docker-compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f app

# 停止服务
docker-compose down
\`\`\`

来源: docker-compose.yml

---

## CI/CD 配置

### GitHub Actions

\`\`\`yaml
# 摘自: .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --coverage

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to production
        run: |
          # 部署脚本
\`\`\`

来源: .github/workflows/ci.yml

### CI/CD 流程

\`\`\`mermaid
graph LR
    A[Push/PR] --> B[Lint]
    B --> C[Type Check]
    C --> D[Test]
    D --> E[Build]
    E --> F{Branch?}
    F -->|main| G[Deploy Prod]
    F -->|develop| H[Deploy Staging]
\`\`\`

相关代码: .github/workflows/

---

## 部署配置

### 环境区分

| 环境 | 分支 | 域名 | 配置文件 |
|-----|-----|-----|---------|
| 开发 | develop | dev.example.com | .env.development |
| 测试 | staging | staging.example.com | .env.staging |
| 生产 | main | example.com | .env.production |

来源: 部署配置分析

### 部署脚本

\`\`\`bash
# 摘自: scripts/deploy.sh
#!/bin/bash
set -e

ENV=\${1:-production}
echo "Deploying to \$ENV..."

# 拉取最新代码
git pull origin main

# 安装依赖
npm ci --production

# 构建
npm run build

# 运行数据库迁移
npm run db:migrate

# 重启服务
pm2 restart app
\`\`\`

来源: scripts/deploy.sh

---

## Kubernetes 部署（如适用）

### K8s 配置

\`\`\`yaml
# 摘自: k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: myapp:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: myapp-secrets
              key: database-url
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
\`\`\`

来源: k8s/deployment.yaml

### Service 配置

\`\`\`yaml
# 摘自: k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
  namespace: production
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
\`\`\`

来源: k8s/service.yaml

### Helm Chart（如有）

\`\`\`yaml
# 摘自: helm/values.yaml
replicaCount: 3

image:
  repository: myapp
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: LoadBalancer
  port: 80

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 250m
    memory: 256Mi

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
\`\`\`

来源: helm/values.yaml

### 部署命令

\`\`\`bash
# 使用 kubectl 部署
kubectl apply -f k8s/

# 查看部署状态
kubectl get pods -n production
kubectl get services -n production

# 使用 Helm 部署
helm install myapp ./helm -n production

# 更新部署
helm upgrade myapp ./helm -n production

# 回滚
helm rollback myapp -n production
\`\`\`

来源: k8s/, helm/

---

### 健康检查

\`\`\`bash
# 健康检查端点
curl http://localhost:3000/health

# 预期响应
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12345
}
\`\`\`

来源: src/api/health.ts

---

## 数据库迁移

\`\`\`bash
# 运行迁移
npm run db:migrate

# 回滚迁移
npm run db:rollback

# 生成迁移文件
npm run db:generate -- --name create_users_table

# 重置数据库
npm run db:reset
\`\`\`

来源: package.json scripts

---

## 常见问题

### 端口占用

\`\`\`bash
# 查找占用端口的进程
lsof -i :3000

# 结束进程
kill -9 <PID>
\`\`\`

### 依赖安装失败

\`\`\`bash
# 清理缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install
\`\`\`

### 构建失败

\`\`\`bash
# 检查 TypeScript 错误
npm run type-check

# 清理后重新构建
npm run clean && npm run build
\`\`\`
\`\`\`

${CODE_REFERENCE_RULES}

## 图表使用
- 可选：CI/CD 流程可使用流程图展示
- 图表必须标注关联的配置文件

## 质量要求
1. **证据优先**：必须先展示构建脚本/配置文件片段，再描述流程。
2. **真实性**：所有命令和配置必须来自实际文件，禁止编造。
3. **环境一致性**：环境变量必须与 .env.example 一致。
4. 若检测不到某配置文件，需输出“未检测到 {文件}”。
5. 文档长度控制在 300-500 行。
`;

