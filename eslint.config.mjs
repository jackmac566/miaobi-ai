import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // v5 目录是把 JSX 模块拼装成单文件 HTML 的独立构建工程，
    // 模块体不是浏览器可直接解析的 .js 语法，由 build.py 与自身测试校验。
    "v5/**",
  ]),
]);

export default eslintConfig;
