import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const BANNED_MATH = [
  "random", "sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh",
  "exp", "expm1", "log", "log1p", "log2", "log10", "pow", "cbrt", "hypot",
];
const HINT = "Pieces must be deterministic: use @/lib/art/math or @/lib/art/rng instead.";
const BANNED_MATH_RE = `/^(${BANNED_MATH.join("|")})$/`;
// Global-object aliases a piece could reach banned globals through.
const GLOBAL_OBJ_RE = "/^(globalThis|window|self|global)$/";
// Math is handled member-by-member below (Math.sqrt etc. stay allowed).
const BANNED_GLOBALS_RE = "/^(Date|performance|crypto)$/";

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
  ]),
  {
    files: ["src/pieces/**/*.ts", "src/pieces/**/*.tsx"],
    rules: {
      "no-restricted-properties": [
        "error",
        ...BANNED_MATH.map((property) => ({
          object: "Math",
          property,
          message: `Math.${property} is banned in pieces. ${HINT}`,
        })),
        { object: "performance", property: "now", message: `performance.now is banned in pieces. ${HINT}` },
      ],
      "no-restricted-globals": [
        "error",
        { name: "Date", message: `Date is banned in pieces. ${HINT}` },
        { name: "performance", message: `performance is banned in pieces. ${HINT}` },
        { name: "crypto", message: `crypto is banned in pieces (non-deterministic). ${HINT}` },
      ],
      "no-restricted-syntax": [
        "error",
        // globalThis.Math.sin, window.Math['random'], globalThis['Math'].pow, ...
        {
          selector: `MemberExpression[object.type='MemberExpression'][object.object.name=${GLOBAL_OBJ_RE}][object.property.name='Math'][property.name=${BANNED_MATH_RE}]`,
          message: `Banned Math member reached through a global object. ${HINT}`,
        },
        {
          selector: `MemberExpression[object.type='MemberExpression'][object.object.name=${GLOBAL_OBJ_RE}][object.property.name='Math'][property.value=${BANNED_MATH_RE}]`,
          message: `Banned Math member reached through a global object. ${HINT}`,
        },
        {
          selector: `MemberExpression[object.type='MemberExpression'][object.object.name=${GLOBAL_OBJ_RE}][object.property.value='Math'][property.name=${BANNED_MATH_RE}]`,
          message: `Banned Math member reached through a global object. ${HINT}`,
        },
        {
          selector: `MemberExpression[object.type='MemberExpression'][object.object.name=${GLOBAL_OBJ_RE}][object.property.value='Math'][property.value=${BANNED_MATH_RE}]`,
          message: `Banned Math member reached through a global object. ${HINT}`,
        },
        // const { sin } = globalThis.Math
        {
          selector: `VariableDeclarator[init.object.name=${GLOBAL_OBJ_RE}] > ObjectPattern > Property[key.name=${BANNED_MATH_RE}]`,
          message: `Banned Math member reached through a global object. ${HINT}`,
        },
        // globalThis.crypto, window.Date, self.performance, ...
        {
          selector: `MemberExpression[object.name=${GLOBAL_OBJ_RE}][property.name=${BANNED_GLOBALS_RE}]`,
          message: `Non-deterministic global reached through a global object. ${HINT}`,
        },
        {
          selector: "MemberExpression[property.name='getImageData']",
          message: `getImageData is banned in pieces (platform-dependent). ${HINT}`,
        },
        {
          selector: "MemberExpression[property.value='getImageData']",
          message: `getImageData is banned in pieces (platform-dependent). ${HINT}`,
        },
        {
          selector: "ObjectPattern > Property[key.name='getImageData']",
          message: `getImageData is banned in pieces (platform-dependent). ${HINT}`,
        },
        {
          selector: "ObjectPattern > Property[key.value='getImageData']",
          message: `getImageData is banned in pieces (platform-dependent). ${HINT}`,
        },
      ],
    },
  },
]);

export default eslintConfig;
