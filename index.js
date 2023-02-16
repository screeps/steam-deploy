const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require('fs/promises');

const executables = {
  linux: 'tools/ContentBuilder/builder_linux/steamcmd.sh',
  darwin: 'tools/ContentBuilder/builder_osx/steamcmd.sh',
  win32: 'tools/ContentBuilder/builder/steamcmd.exe'
}

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
  "FileExclusion" "*.pdb"
  "FileExclusion" "**/*_BurstDebugInformation_DoNotShip*"
  "FileExclusion" "**/*_BackUpThisFolder_ButDontShipItWithYourGame*"
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

    const steamdir = core.getInput('steamdir');
    core.info(`steamdir: ${steamdir}`);
    await fs.mkdir(`${steamdir}/config`);

    await fs.writeFile(`${steamdir}/config/config.vdf`, Buffer.from(core.getInput('configVdf')));
    await fs.writeFile(`${steamdir}/${core.getInput('ssfnFileName')}`, Buffer.from(core.getInput('ssfnFileContents')));

    const executable = `${steamdir}/${executables[process.platform]}`;

    const username = core.getInput('username');
    const password = core.getInput('password');
    const result = await exec.exec(executable, ['+login', username, password, '+quit', '+quit']);
    core.info(`SteamCMD result: ${result}`);

    core.setOutput('manifest', manifestPath);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
