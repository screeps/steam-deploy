const core = require('@actions/core');
const exec = require('@actions/exec');
const io = require('@actions/io');
const s = require('fs');
const fs = require('fs/promises');
const path = require('path');

async function getSteamDir() {
  if(process.platform == "darwin") {
    return `${process.env['HOME']}/Library/Application Support/Steam`;
  }

  if(process.platform == "win32") {
    return path.dirname(await io.which('steamcmd.exe'));
  }

  if(process.platform == "linux") {
    return `${process.env['HOME']}/Steam`;
  }

  throw `Unsupported platform ${process.platform}, only linux, win32, and darwin supported.`
}

async function saveConfigs() {
  const configVdf = core.getInput('configVdf');
  const ssfnFileName = core.getInput('ssfnFileName');
  const ssfnFileContents = core.getInput('ssfnFileContents');

  const steamdir = await getSteamDir();
  core.info(`steamdir: ${steamdir}`);

  if (!s.existsSync(`${steamdir}/config`)) {
    core.info(`${steamdir}/config not exists, creating`);
    await fs.mkdir(`${steamdir}/config`, {recursive: true});
  } else {
    core.info(`${steamdir}/config exists`);
  }

  await fs.writeFile(`${steamdir}/config/config.vdf`, Buffer.from(configVdf, 'base64'));
  await fs.writeFile(`${steamdir}/${ssfnFileName}`, Buffer.from(ssfnFileContents, 'base64'));
}

async function generateManifests() {
  const appId = parseInt(core.getInput('appId'));
  const buildDescription = core.getInput('buildDescription');
  const rootPath = core.getInput('rootPath');
  const releaseBranch = core.getInput('releaseBranch');
  const workspace = process.env['GITHUB_WORKSPACE'];

  const manifestPath = `${ workspace }/manifest.vdf`;

  const depots = [];
  for(let i = 1; i < 10; i++) {
    const depotId = appId + i;
    const depotPath = core.getInput(`depot${i}Path`);
    if(depotPath) {
      if(!s.existsSync(`${rootPath}/${depotPath}`)) {
        core.info(`No files for depot ${depotId}, skipping`);
        continue;
      }
      core.info(`Adding depot ${depotId}`);

      depots.push(depotId);

      let depotText = `"DepotBuildConfig"\n{`;
      depotText += `  "DepotID" "${depotId}\n"`;
      depotText += `  "FileMapping"\n  {\n`;
      depotText += `    "LocalPath" "./${depotPath}/*"\n`;
      depotText += `    "DepotPath" "."\n`;
      depotText += `    "Recursive" "1"\n`;
      depotText += `  }\n}`

      await fs.writeFile(`${ workspace }/depot${depotId}.vdf`, depotText);
      core.info(`depot${depotId}.vdf`);
      core.info(depotText);
    }
  }

  if(!depots.length) {
    core.setFailed('No depots to upload');
    return;
  }

  let manifestText = `"appbuild"\n{\n  "appid" "${appId}"\n`;

  if(buildDescription) {
    manifestText += `  "desc" "${buildDescription}"\n`;
  }

  manifestText += `  "buildoutput" "BuildOutput"\n  "contentroot" "${rootPath}"\n`;

  if(releaseBranch) {
    manifestText += `  "setlive" "${releaseBranch}"\n`;
  }

  manifestText += `  "depots"\n  {\n`;
  for(const depot of depots) {
    manifestText += `    "${depot}" "depot${depot}.vdf"\n`;
  }
  manifestText += `  }\n`;
  manifestText += `}`;

  await fs.writeFile(manifestPath, manifestText);
  core.info(manifestPath);
  core.info(manifestText);

  return manifestPath;
}

async function deploy(manifestPath) {
  const username = core.getInput('username');
  const password = core.getInput('password');

  const buildResult = await exec.exec(
      'steamcmd',
      [
        '+login',
        username,
        password,
        '+run_app_build',
        manifestPath,
        '+quit'
      ],
      {cwd: process.env['GITHUB_WORKSPACE']});
  if (buildResult) {
    const steamdir = await getSteamDir();

    const logsDirectory = `${steamdir}/Logs`;
    const files = await fs.readdir(logsDirectory);

    for (const file of files) {
      const filePath = path.join(logsDirectory, file);
      const fileStat = await fs.stat(filePath);

      if (fileStat.isFile()) {
        const contents = await fs.readFile(filePath, 'utf-8');
        console.log(`${file}:\n${contents}`);
      }
    }
  }
}

async function run() {
  try {
    core.info(`Saving configuration files...`);
    await saveConfigs();

    core.info(`Generating depot manifests...`);
    const manifestPath = await generateManifests();
    core.setOutput('manifest', manifestPath);

    core.info(`Deploying to Steam...`);
    await deploy(manifestPath);

    core.info('Build successful');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
