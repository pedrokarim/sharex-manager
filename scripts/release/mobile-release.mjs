#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));

const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const fail = (message) => {
  console.error(`Erreur de release mobile : ${message}`);
  process.exit(1);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const packageManifest = readJson("sharex-mobile/package.json");
const packageLock = readJson("sharex-mobile/package-lock.json");
const appConfig = readJson("sharex-mobile/app.json");
const changelogPath = path.join(repositoryRoot, "sharex-mobile/CHANGELOG.md");
const changelog = fs.readFileSync(changelogPath, "utf8");

const version = appConfig?.expo?.version;
const versions = new Map([
  ["sharex-mobile/app.json (expo.version)", version],
  ["sharex-mobile/package.json", packageManifest.version],
  ["sharex-mobile/package-lock.json", packageLock.version],
  ["sharex-mobile/package-lock.json (packages[''])", packageLock.packages?.[""]?.version],
]);

if (typeof version !== "string") {
  fail("expo.version est absent de sharex-mobile/app.json.");
}

for (const [source, candidate] of versions) {
  if (candidate !== version) {
    fail(`${source} contient ${JSON.stringify(candidate)} au lieu de ${version}.`);
  }
}

const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;
if (!semverPattern.test(version)) {
  fail(`${version} ne respecte pas la politique SemVer du projet.`);
}

const tag = argumentValue("--tag");
const expectedTag = `mobile-v${version}`;
let releaseNotes = "";

if (tag) {
  if (tag !== expectedTag) {
    fail(`le tag ${tag} ne correspond pas à la version ${version} (attendu : ${expectedTag}).`);
  }

  const headingPattern = new RegExp(
    `^## \\[${escapeRegExp(version)}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`,
    "m",
  );
  const headingMatch = changelog.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    fail(`sharex-mobile/CHANGELOG.md ne contient pas de section [${version}] datée.`);
  }

  const sectionStart = headingMatch.index;
  const followingHeading = changelog.indexOf("\n## ", sectionStart + headingMatch[0].length);
  releaseNotes = changelog
    .slice(sectionStart, followingHeading === -1 ? changelog.length : followingHeading)
    .trim();

  const notesBody = releaseNotes.slice(headingMatch[0].length).trim();
  if (!/^###\s+/m.test(notesBody) || !/^[-*]\s+\S+/m.test(notesBody)) {
    fail(`la section [${version}] du changelog ne contient aucune note de release.`);
  }
}

const runNumber = process.env.GITHUB_RUN_NUMBER || "local";
const artifactName = tag
  ? `sharex-manager-mobile-${version}.apk`
  : `sharex-manager-mobile-${version}-test-${runNumber}.apk`;
const checksumName = tag ? "SHA256SUMS" : `SHA256SUMS-test-${runNumber}`;
const isPrerelease = version.includes("-");

const githubOutput = argumentValue("--github-output") || process.env.GITHUB_OUTPUT;
if (githubOutput) {
  fs.appendFileSync(
    githubOutput,
    [
      `version=${version}`,
      `tag=${tag || ""}`,
      `artifact_name=${artifactName}`,
      `checksum_name=${checksumName}`,
      `profile=${tag ? "production-apk" : "preview"}`,
      `prerelease=${isPrerelease}`,
      `release_title=ShareX Manager Mobile ${version}`,
      "",
    ].join("\n"),
  );
}

const notesOutput = argumentValue("--notes-output");
if (notesOutput && releaseNotes) {
  const absoluteNotesPath = path.resolve(repositoryRoot, notesOutput);
  fs.mkdirSync(path.dirname(absoluteNotesPath), { recursive: true });
  fs.writeFileSync(absoluteNotesPath, `${releaseNotes}\n`);
}

console.log(`Version mobile validée : ${version}`);
console.log(`Mode : ${tag ? `release ${tag}` : "test manuel"}`);
console.log(`Profil EAS : ${tag ? "production-apk" : "preview"}`);
console.log(`APK : ${artifactName}`);
