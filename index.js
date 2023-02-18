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

  return `${process.env['HOME']}/Steam`;
}

async function run() {
  try {
    const workspace = process.env['GITHUB_WORKSPACE'];

    const appId = parseInt(core.getInput('appId'));
    const buildDescription = core.getInput('buildDescription');
    const rootPath = core.getInput('rootPath');
    const releaseBranch = core.getInput('releaseBranch');
    const username = core.getInput('username');
    const password = core.getInput('password');
    const configVdf = core.getInput('configVdf');
    const ssfnFileName = core.getInput('ssfnFileName');
    const ssfnFileContents = core.getInput('ssfnFileContents');

    const manifestPath = `${ workspace }/manifest.vdf`;

    core.info(`Generating depot manifests`);
    const depots = [];
    for(let i = 1; i < 10; i++) {
      const depotId = appId + i;
      core.debug(`Depot ID ${depotId}`);
      const depotPath = core.getInput(`depot${i}Path`);
      if(depotPath) {
        if(!s.existsSync(`${rootPath}/${depotPath}`)) {
          continue;
        }
        depots.push(depotId);
        core.debug(`Adding depot ${depotId}`);

        let depotText = `"DepotBuildConfig"\n{`;
        depotText += `  "DepotID" "${depotId}\n"`;
        depotText += `  "FileMapping"\n  {\n`;
        depotText += `    "LocalPath" "./${depotPath}/*"\n`;
        depotText += `    "DepotPath" "."\n`;
        depotText += `    "Recursive" "1"\n`;
        depotText += `  }\n}`

        await fs.writeFile(`${ workspace }/depot${depotId}.vdf`, depotText);
        core.info(depotText);
      }
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
    core.info(manifestText);

    core.setOutput('manifest', manifestPath);

    const steamdir = await getSteamDir();
    core.info(`steamdir: ${steamdir}`);

    if(!s.existsSync(`${steamdir}/config`)) {
      core.info(`${steamdir}/config not exists, creating`);
      await fs.mkdir(`${steamdir}/config`, { recursive: true });
    } else {
      core.info(`${steamdir}/config exists`);
    }

    await fs.writeFile(`${steamdir}/config/config.vdf`, Buffer.from(configVdf, 'base64'));
    await fs.writeFile(`${steamdir}/${ssfnFileName}`, Buffer.from(ssfnFileContents, 'base64'));

    const executable = `steamcmd`;

    // test login
    const testRunResult = await exec.exec(executable, ['+login', username, password, '+quit']);

    if(testRunResult) {
      core.setFailed('Steam login failed');
      return;
    }

    core.info(`Login successful`);

    const buildResult = await exec.exec(
        executable,
        [
            '+login',
          username,
          password,
          '+run_app_build',
          manifestPath,
          '+quit'
        ],
        {cwd: workspace});
    if(buildResult) {
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

    core.info('Build successful');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
