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
    // 微信小程序运行时使用 CommonJS 的 require/module.exports 约定，
    // 由独立的结构与安全测试覆盖，不套用 Next.js 的 ESM 规则。
    "wechat-mini-program/**",
  ]),
]);

export default eslintConfig;
