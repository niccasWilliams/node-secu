/** @type {import('ts-jest').JestConfigWithTsJest} **/
module.exports = {
  testEnvironment: "node",
  forceExit: true,
  detectOpenHandles: true,
  silent: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/?(*.)+(test|spec).ts"],
  transform: {
    "^.+.tsx?$": ["ts-jest",{}],
  },
};
