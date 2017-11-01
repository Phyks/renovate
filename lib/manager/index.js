const docker = require('./docker/package');
const npm = require('./npm/package');

const dockerDetect = require('./docker/detect');
const meteorDetect = require('./meteor/detect');
const npmDetect = require('./npm/detect');

const npmUpdater = require('./npm/update');
const meteorUpdater = require('./meteor/update');
const dockerfileHelper = require('./docker/update');

module.exports = {
  detectPackageFiles,
  getPackageUpdates,
  getUpdatedPackageFiles,
};

async function detectPackageFiles(config) {
  const { logger } = config;
  let packageFiles = [];
  const fileList = (await config.api.getFileList()).filter(
    file => !config.ignorePaths.some(ignorePath => file.includes(ignorePath))
  );
  logger.trace({ config }, 'detectPackageFiles');
  const packageJsonFiles = await npmDetect.detectPackageFiles(config, fileList);
  if (packageJsonFiles.length) {
    logger.info({ packageJsonFiles }, 'Found package.json files');
    packageFiles = packageFiles.concat(packageJsonFiles);
  }
  const meteorFiles = await meteorDetect.detectPackageFiles(config, fileList);
  if (meteorFiles.length) {
    logger.info({ packageJsonFiles }, 'Found meteor files');
    packageFiles = packageFiles.concat(meteorFiles);
  }
  const dockerFiles = await dockerDetect.detectPackageFiles(config, fileList);
  if (dockerFiles.length) {
    logger.info({ dockerFiles }, 'Found Dockerfiles');
    packageFiles = packageFiles.concat(dockerFiles);
  }
  return packageFiles;
}

async function getPackageUpdates(config) {
  if (config.packageFile.endsWith('Dockerfile')) {
    return docker.getPackageUpdates(config);
  } else if (config.packageFile.endsWith('package.json')) {
    return npm.getPackageUpdates(config);
  } else if (config.packageFile.endsWith('package.js')) {
    return npm.getPackageUpdates(config);
  }
  config.logger.info(`Cannot find manager for ${config.packageFile}`);
  throw new Error('Unsupported package manager');
}

async function getUpdatedPackageFiles(config) {
  const { logger } = config;
  const updatedPackageFiles = {};

  for (const upgrade of config.upgrades) {
    if (upgrade.type !== 'lockFileMaintenance') {
      const existingContent =
        updatedPackageFiles[upgrade.packageFile] ||
        (await config.api.getFileContent(
          upgrade.packageFile,
          config.parentBranch
        ));
      let newContent = existingContent;
      if (upgrade.packageFile.endsWith('package.json')) {
        newContent = npmUpdater.setNewValue(
          existingContent,
          upgrade.depType,
          upgrade.depName,
          upgrade.newVersion,
          config.logger
        );
      } else if (upgrade.packageFile.endsWith('package.js')) {
        newContent = meteorUpdater.setNewValue(
          existingContent,
          upgrade.depName,
          upgrade.currentVersion,
          upgrade.newVersion,
          config.logger
        );
      } else if (upgrade.packageFile.endsWith('Dockerfile')) {
        newContent = dockerfileHelper.setNewValue(
          existingContent,
          upgrade.depName,
          upgrade.currentFrom,
          upgrade.newFrom,
          config.logger
        );
      }
      if (!newContent) {
        if (config.parentBranch && config.canRebase) {
          logger.info('Rebasing branch after error updating content');
          return getUpdatedPackageFiles({
            ...config,
            parentBranch: undefined,
          });
        }
        throw new Error('Error updating branch content and cannot rebase');
      }
      if (newContent !== existingContent) {
        if (config.parentBranch && config.canRebase) {
          // This ensure it's always 1 commit from Renovate
          logger.info('Need to update package file so will rebase first');
          return getUpdatedPackageFiles({
            ...config,
            parentBranch: undefined,
          });
        }
        logger.debug('Updating packageFile content');
        updatedPackageFiles[upgrade.packageFile] = newContent;
      }
    }
  }
  return {
    parentBranch: config.parentBranch, // Need to overwrite original config
    updatedPackageFiles: Object.keys(updatedPackageFiles).map(packageFile => ({
      name: packageFile,
      contents: updatedPackageFiles[packageFile],
    })),
  };
}