const core = require('@actions/core');
const exec = require('@actions/exec');
const s = require('fs');
const fs = require('fs/promises');
const path = require('path');

async function run() {
  try {
    const manifestPath = `${ process.cwd() }/manifest.vdf`;

    core.info(`Generating depot manifests`);
    const appId = parseInt(core.getInput('appId'));
    const depots = [];
    for(let i = 1; i < 10; i++) {
      const depotId = appId + i;
      core.debug(`Depot ID ${depotId}`);
      const depotPath = core.getInput(`depot${i}Path`);
      if(depotPath) {
        depots.push(depotId);
        core.debug(`Adding depot ${depotId}`);
        const depotText = `"DepotBuildConfig"
{
  "DepotID" "${depotId}"
  "FileMapping"
  {
    "LocalPath" "./${depotPath}/*"
    "DepotPath" "."
    "recursive" "1"
  }
}`;
        await fs.writeFile(`depot${depotId}.vdf`, depotText);
        core.info(depotText);
      }
    }

    let manifestText = `"appbuild"\n{\n  "appid" "${appId}"\n`;

    const buildDescription = core.getInput('buildDescription');
    if(buildDescription) {
      manifestText += `  "desc" "${buildDescription}"\n`;
    }
    manifestText += `  "buildoutput" "BuildOutput"\n`;

    const rootPath = core.getInput('rootPath');
    manifestText += `  "contentroot" "${rootPath}"\n`;

    const releaseBranch = core.getInput('releaseBranch');
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

    const steamdir = `${process.env['HOME']}/Steam`;
    core.info(`steamdir: ${steamdir}`);
    if(!s.existsSync(`${steamdir}/config`)) {
      await fs.mkdir(`${steamdir}/config`);
    }

    await fs.writeFile(`${steamdir}/config/config.vdf`, Buffer.from(core.getInput('configVdf'), 'base64'));
    await fs.writeFile(`${steamdir}/${core.getInput('ssfnFileName')}`, Buffer.from(core.getInput('ssfnFileContents'), 'base64'));

    const executable = `steamcmd`;

    // test login
    const username = core.getInput('username');
    const password = core.getInput('password');
    const testRunResult = await exec.exec(executable, ['+login', username, password, '+quit']);

    if(testRunResult) {
      core.setFailed('Steam login failed');
      return;
    }

    core.info(`Login successful`);

    const workspace = process.env['GITHUB_WORKSPACE'];
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
