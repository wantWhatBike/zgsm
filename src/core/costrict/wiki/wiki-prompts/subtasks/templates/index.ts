// 文档模板导出

import { DEFAULT_DOC_TEMPLATE } from './00_default-doc';
import { OVERVIEW_DOC_TEMPLATE } from './01_overview-doc';
import { ARCHITECTURE_DOC_TEMPLATE } from './02_architecture-doc';
import { BUSINESS_FLOW_DOC_TEMPLATE } from './03_business-flow-doc';
import { API_DOC_TEMPLATE } from './04_api-doc';
import { DATA_STORAGE_DOC_TEMPLATE } from './05_data-storage-doc';
import { CODING_STANDARD_DOC_TEMPLATE } from './06_coding-standard-doc';
import { TESTING_GUIDE_DOC_TEMPLATE } from './07_testing-guide-doc';
import { BUILD_DEPLOY_DOC_TEMPLATE } from './08_build-deploy-doc';
import { SERVICE_COMM_DOC_TEMPLATE } from './09_service-comm-doc';
import { MIDDLEWARE_DOC_TEMPLATE } from './10_middleware-doc';
import { SECURITY_AUTH_DOC_TEMPLATE } from './11_security-auth-doc';

// 再导出（保持原有接口）
export { DEFAULT_DOC_TEMPLATE } from './00_default-doc';
export { OVERVIEW_DOC_TEMPLATE } from './01_overview-doc';
export { ARCHITECTURE_DOC_TEMPLATE } from './02_architecture-doc';
export { BUSINESS_FLOW_DOC_TEMPLATE } from './03_business-flow-doc';
export { API_DOC_TEMPLATE } from './04_api-doc';
export { DATA_STORAGE_DOC_TEMPLATE } from './05_data-storage-doc';
export { CODING_STANDARD_DOC_TEMPLATE } from './06_coding-standard-doc';
export { TESTING_GUIDE_DOC_TEMPLATE } from './07_testing-guide-doc';
export { BUILD_DEPLOY_DOC_TEMPLATE } from './08_build-deploy-doc';
export { SERVICE_COMM_DOC_TEMPLATE } from './09_service-comm-doc';
export { MIDDLEWARE_DOC_TEMPLATE } from './10_middleware-doc';
export { SECURITY_AUTH_DOC_TEMPLATE } from './11_security-auth-doc';

// 模板映射表
export const DOC_TEMPLATES: Record<string, (workspace: string) => string> = {
  '00_default-doc': DEFAULT_DOC_TEMPLATE,
  '01_overview-doc': OVERVIEW_DOC_TEMPLATE,
  '02_architecture-doc': ARCHITECTURE_DOC_TEMPLATE,
  '03_business-flow-doc': BUSINESS_FLOW_DOC_TEMPLATE,
  '04_api-doc': API_DOC_TEMPLATE,
  '05_data-storage-doc': DATA_STORAGE_DOC_TEMPLATE,
  '06_coding-standard-doc': CODING_STANDARD_DOC_TEMPLATE,
  '07_testing-guide-doc': TESTING_GUIDE_DOC_TEMPLATE,
  '08_build-deploy-doc': BUILD_DEPLOY_DOC_TEMPLATE,
  '09_service-comm-doc': SERVICE_COMM_DOC_TEMPLATE,
  '10_middleware-doc': MIDDLEWARE_DOC_TEMPLATE,
  '11_security-auth-doc': SECURITY_AUTH_DOC_TEMPLATE,
};

/**
 * 根据模板ID获取模板函数
 * @param templateId 模板ID
 * @returns 模板函数，如果不存在则返回默认模板
 */
export function getDocTemplate(templateId: string): (workspace: string) => string {
  return DOC_TEMPLATES[templateId] || DOC_TEMPLATES['00_default-doc'];
}

