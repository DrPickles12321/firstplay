const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || major === 22 && minor < 13) {
  process.stderr.write('FirstPlay requires Node.js 22.13 or newer. The tested version is 22.22.3. Select that version, then run this command again.\n');
  process.exitCode = 1;
}
