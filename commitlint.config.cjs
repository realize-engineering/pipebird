// eslint-disable-next-line no-undef
module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: [
    (message) => message.includes("Merge"),
    (message) => message.includes("#"),
  ],
};
