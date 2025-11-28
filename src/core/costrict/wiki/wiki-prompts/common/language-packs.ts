export interface LanguageExample {
  name: string;
  fileExtensions: string[];
  filePath: string;
  codeSnippet: string;
  command: string;
  namingConvention: string;
  importSyntax: string;
  classDefinition: string;
  functionDefinition: string;
  testFile: string;
  testSnippet: string;
  configFile: string;
  dependencyFile: string;
}

export const GENERIC_PACK: LanguageExample = {
  name: "Generic",
  fileExtensions: [],
  filePath: "path/to/file.ext",
  codeSnippet: `// Code snippet example
function example() {
  return "value";
}`,
  command: "run command",
  namingConvention: "camelCase or snake_case",
  importSyntax: "import dependency",
  classDefinition: "class Example { ... }",
  functionDefinition: "function example() { ... }",
  testFile: "test/example.test.ext",
  testSnippet: "assert(result == expected)",
  configFile: "config.ext",
  dependencyFile: "package-manager.ext",
};

export const TS_PACK: LanguageExample = {
  name: "TypeScript",
  fileExtensions: [".ts", ".js", ".tsx", ".jsx"],
  filePath: "src/service/userService.ts",
  codeSnippet: `export class UserService {
  async getUser(id: string): Promise<User> {
    return this.repo.findById(id);
  }
}`,
  command: "npm run build",
  namingConvention: "camelCase for vars/funcs, PascalCase for classes",
  importSyntax: "import { User } from './user';",
  classDefinition: "export class UserService { ... }",
  functionDefinition: "function getUser(id: string) { ... }",
  testFile: "test/service/userService.test.ts",
  testSnippet: `describe('UserService', () => {
  it('should return user', async () => {
    expect(result).toBeDefined();
  });
});`,
  configFile: "tsconfig.json",
  dependencyFile: "package.json",
};

export const GO_PACK: LanguageExample = {
  name: "Go",
  fileExtensions: [".go"],
  filePath: "internal/service/user_service.go",
  codeSnippet: `func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
	return s.repo.FindById(ctx, id)
}`,
  command: "go build ./...",
  namingConvention: "camelCase for local vars, PascalCase for exported",
  importSyntax: `import "github.com/pkg/errors"`,
  classDefinition: "type UserService struct { ... }",
  functionDefinition: "func GetUser(id string) { ... }",
  testFile: "internal/service/user_service_test.go",
  testSnippet: `func TestGetUser(t *testing.T) {
	assert.NotNil(t, result)
}`,
  configFile: "config.yaml",
  dependencyFile: "go.mod",
};

export const JAVA_PACK: LanguageExample = {
  name: "Java",
  fileExtensions: [".java"],
  filePath: "src/main/java/com/example/service/UserService.java",
  codeSnippet: `public class UserService {
    public User getUser(String id) {
        return userRepository.findById(id);
    }
}`,
  command: "./mvnw clean install",
  namingConvention: "camelCase for vars/methods, PascalCase for classes",
  importSyntax: "import com.example.model.User;",
  classDefinition: "public class UserService { ... }",
  functionDefinition: "public User getUser(String id) { ... }",
  testFile: "src/test/java/com/example/service/UserServiceTest.java",
  testSnippet: `@Test
public void testGetUser() {
    assertNotNull(result);
}`,
  configFile: "application.properties",
  dependencyFile: "pom.xml",
};

export const PYTHON_PACK: LanguageExample = {
  name: "Python",
  fileExtensions: [".py"],
  filePath: "src/services/user_service.py",
  codeSnippet: `class UserService:
    def get_user(self, user_id: str) -> User:
        return self.repo.find_by_id(user_id)`,
  command: "pip install -r requirements.txt",
  namingConvention: "snake_case for vars/funcs, PascalCase for classes",
  importSyntax: "from models import User",
  classDefinition: "class UserService:",
  functionDefinition: "def get_user(self, id):",
  testFile: "tests/services/test_user_service.py",
  testSnippet: `def test_get_user(self):
    self.assertIsNotNone(result)`,
  configFile: "settings.py",
  dependencyFile: "requirements.txt",
};

export const RUST_PACK: LanguageExample = {
  name: "Rust",
  fileExtensions: [".rs"],
  filePath: "src/services/user_service.rs",
  codeSnippet: `impl UserService {
    pub fn get_user(&self, id: &str) -> Result<User, Error> {
        self.repo.find_by_id(id)
    }
}`,
  command: "cargo build --release",
  namingConvention: "snake_case for vars/funcs, PascalCase for structs",
  importSyntax: "use crate::models::User;",
  classDefinition: "struct UserService { ... }",
  functionDefinition: "fn get_user(id: &str) { ... }",
  testFile: "src/services/user_service_test.rs",
  testSnippet: `#[test]
fn test_get_user() {
    assert!(result.is_ok());
}`,
  configFile: "Config.toml",
  dependencyFile: "Cargo.toml",
};

export const CPP_PACK: LanguageExample = {
  name: "C++",
  fileExtensions: [".cpp", ".h", ".hpp", ".cc"],
  filePath: "src/services/UserService.cpp",
  codeSnippet: `User UserService::getUser(const std::string& id) {
    return repo->findById(id);
}`,
  command: "cmake --build .",
  namingConvention: "snake_case or camelCase",
  importSyntax: "#include \"UserService.h\"",
  classDefinition: "class UserService { ... };",
  functionDefinition: "User getUser(string id) { ... }",
  testFile: "tests/UserServiceTest.cpp",
  testSnippet: `TEST(UserServiceTest, GetUser) {
    ASSERT_TRUE(result != nullptr);
}`,
  configFile: "CMakeLists.txt",
  dependencyFile: "conanfile.txt",
};

export const LANGUAGE_PACKS: Record<string, LanguageExample> = {
  "typescript": TS_PACK,
  "javascript": TS_PACK,
  "go": GO_PACK,
  "golang": GO_PACK,
  "java": JAVA_PACK,
  "python": PYTHON_PACK,
  "rust": RUST_PACK,
  "c++": CPP_PACK,
  "cpp": CPP_PACK,
  "c": CPP_PACK,
  "generic": GENERIC_PACK,
};

export function getLanguagePack(language: string): LanguageExample {
  const normalizedLang = language.toLowerCase().trim();
  return LANGUAGE_PACKS[normalizedLang] || GENERIC_PACK;
}