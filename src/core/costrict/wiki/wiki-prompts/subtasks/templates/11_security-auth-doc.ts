import { CODE_REFERENCE_RULES, WIKI_OUTPUT_FILE_PATHS } from "../../common/constants";

export const SECURITY_AUTH_DOC_TEMPLATE = (workspace: string) => `# 安全认证文档生成

## 角色定义
您是技术文档撰写专家，负责生成安全认证文档，帮助AI理解项目的认证授权机制与安全实践。

## 核心原则
- 文档优先服务AI（正确实现认证授权逻辑）
- **可使用认证流程图**展示登录/鉴权过程
- 所有配置与代码必须来自实际文件
- 禁止编造安全策略或虚构配置

## 输入参数
- **文档信息**：
  - docId: "11"
  - docName: "安全认证"
  - docFilename: "11_安全认证.md"
  - relatedSources: 认证与授权相关的配置和代码
- **项目分析结果**：\`${WIKI_OUTPUT_FILE_PATHS.PROJECT_BASIC_ANALYZE_JSON}\`

## 执行流程

### 步骤1：识别认证机制
从代码中识别并分类：
- JWT / Session / OAuth / API Key / 第三方登录
- Token 生成、刷新、校验流程
- 登录入口与退出流程

### 步骤2：分析授权模型
梳理：
- 角色/权限定义（RBAC/ABAC/自定义模型）
- 权限检查中间件或装饰器
- 资源与操作映射关系
- 安全中间件（CORS、Rate Limit、输入校验等）

### 步骤3：生成文档
输出到 \`${workspace}/${WIKI_OUTPUT_FILE_PATHS.WIKI_OUTPUT_DIR}11_安全认证.md\`

## 输出格式

\`\`\`markdown
# 安全认证

<details>
<summary>相关源文件</summary>

- src/middleware/auth.ts
- src/service/authService.ts
- src/config/jwt.ts
- src/utils/permissions.ts
- ...

</details>

## 概述
本文档描述项目的认证授权机制，包括 JWT/Session 认证、RBAC 权限模型以及安全实践。
来源: src/middleware/auth.ts, src/service/authService.ts

## 认证机制

### 认证方式

| 方式 | 适用场景 | 实现文件 |
|-----|---------|---------|
| JWT | API 认证 | src/middleware/auth.ts |
| Session | Web 应用 | src/middleware/session.ts |
| API Key | 服务间调用 | src/middleware/apiKey.ts |

来源: src/middleware/

### JWT 认证流程

\`\`\`mermaid
sequenceDiagram
    participant Client
    participant API
    participant AuthService
    participant DB

    Client->>API: POST /login (email, password)
    API->>AuthService: authenticate(email, password)
    AuthService->>DB: findUser(email)
    DB-->>AuthService: User
    AuthService->>AuthService: verifyPassword
    AuthService->>AuthService: generateToken(user)
    AuthService-->>API: { token, expiresIn }
    API-->>Client: 200 { token }

    Note over Client,API: 后续请求
    Client->>API: GET /api/** (Authorization: Bearer token)
    API->>AuthService: verifyToken(token)
    AuthService-->>API: User
    API-->>Client: Response
\`\`\`

相关代码: src/middleware/auth.ts, src/service/authService.ts

---

## JWT 配置与实现

### 配置文件

\`\`\`typescript
// 摘自: src/config/jwt.ts
export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '7d',
  issuer: 'my-app',
  algorithm: 'HS256' as const,
};
\`\`\`

来源: src/config/jwt.ts

### Token 生成

\`\`\`typescript
// 摘自: src/service/authService.ts
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';

export function generateTokens(user: User): TokenPair {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, jwtConfig.secret, {
    expiresIn: jwtConfig.accessTokenExpiry,
    issuer: jwtConfig.issuer,
  });

  const refreshToken = jwt.sign(
    { sub: user.id, type: 'refresh' },
    jwtConfig.secret,
    { expiresIn: jwtConfig.refreshTokenExpiry }
  );

  return { accessToken, refreshToken };
}
\`\`\`

来源: src/service/authService.ts

### Token 验证中间件

\`\`\`typescript
// 摘自: src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt';

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, jwtConfig.secret) as JwtPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}
\`\`\`

来源: src/middleware/auth.ts

---

## 授权模型（RBAC）

### 角色定义

| 角色 | 代码 | 说明 | 权限 |
|-----|-----|-----|-----|
| 超级管理员 | SUPER_ADMIN | 系统最高权限 | 全部 |
| 管理员 | ADMIN | 管理权限 | 用户管理、内容管理 |
| 普通用户 | USER | 基本权限 | 查看、编辑自己的数据 |
| 访客 | GUEST | 只读权限 | 查看公开内容 |

来源: src/constants/roles.ts

### 权限定义

\`\`\`typescript
// 摘自: src/constants/permissions.ts
export const PERMISSIONS = {
  USER_READ: 'user:read',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  ORDER_READ: 'order:read',
  ORDER_CREATE: 'order:create',
  ORDER_UPDATE: 'order:update',
  ORDER_DELETE: 'order:delete',
  SYSTEM_ADMIN: 'system:admin',
} as const;

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  ADMIN: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
  ],
  USER: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_CREATE,
  ],
};
\`\`\`

来源: src/constants/permissions.ts

### 权限检查中间件

\`\`\`typescript
// 摘自: src/middleware/authorize.ts
import { ROLE_PERMISSIONS } from '../constants/permissions';

export function authorize(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userPermissions = ROLE_PERMISSIONS[user.role] || [];
    const hasPermission = requiredPermissions.every(perm => userPermissions.includes(perm));

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}
\`\`\`

来源: src/middleware/authorize.ts

### 使用示例

\`\`\`typescript
// 摘自: src/api/user.ts
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';

router.get('/profile', authenticate, getProfile);

router.get(
  '/users',
  authenticate,
  authorize(PERMISSIONS.USER_READ),
  listUsers
);

router.delete(
  '/users/:id',
  authenticate,
  authorize(PERMISSIONS.USER_DELETE),
  deleteUser
);
\`\`\`

来源: src/api/user.ts

---

## 密码与安全实践

### 密码加密

\`\`\`typescript
// 摘自: src/utils/crypto.ts
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
\`\`\`

来源: src/utils/crypto.ts

### 密码策略

| 规则 | 要求 |
|-----|-----|
| 最小长度 | 8 字符 |
| 大写字母 | 至少 1 个 |
| 小写字母 | 至少 1 个 |
| 数字 | 至少 1 个 |
| 特殊字符 | 推荐 |

来源: src/utils/validators.ts

---

## 安全实践

| 措施 | 实现 | 文件 |
|-----|-----|-----|
| HTTPS | Nginx/Ingress 配置 | nginx.conf / k8s ingress |
| CORS | 白名单限制 | src/middleware/cors.ts |
| Rate Limiting | 请求限流 | src/middleware/rateLimit.ts |
| XSS 防护 | 输入过滤 | src/middleware/sanitize.ts |
| SQL 注入防护 | ORM 参数化 | repository 层 |

来源: src/middleware/, src/repository/

### Rate Limiting 配置示例

\`\`\`typescript
// 摘自: src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts' },
});
\`\`\`

来源: src/middleware/rateLimit.ts

## 相关文档
- [API接口文档](./04_API接口文档.md)
- [编码规范](./06_编码规范.md)
\`\`\`

${CODE_REFERENCE_RULES}

## 图表要求
- 必须包含认证流程时序图（登录→鉴权→访问接口）
- 图中的组件必须与实际代码一致

## 质量要求
1. JWT/Session 配置必须与实际文件一致
2. 角色与权限定义必须来自源码
3. 中间件示例必须引用真实文件
4. 文档长度控制在 300-500 行
`;

