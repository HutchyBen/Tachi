// This runs as JS because of https://github.com/tapjs/node-tap/issues/761

const assert = require("assert");
const { execSync } = require("child_process");
const path = require("path");

console.log("Starting test setup via hack-setup.js");

assert(process.env.NODE_ENV === "test", "NODE_ENV WAS NOT TEST, BAILING");
execSync(`ts-node ${path.join(__dirname, "./setup.ts")}`, { stdio: "inherit" });
