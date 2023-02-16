const core = require('@actions/core');
const fs = require('fs/promises');

// most @actions toolkit packages have async methods
async function run() {
  try {
    const manifestPath = `${ process.cwd() }/manifest.vdf`;

    core.info(`Generating depot manifests`);
    const appId = core.getInput('appId');
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
      manifestText += `    "${depot}" "depot${depot}.vdf"`;
    }
    manifestText += `  }\n`;
    manifestText += `}`;

    await fs.writeFile(manifestPath, manifestText);
    core.info(manifestText);

    core.setOutput('manifest', manifestPath);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
