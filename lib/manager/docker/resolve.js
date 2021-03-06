const configParser = require('../../config');

module.exports = {
  resolvePackageFile,
};

async function resolvePackageFile(config, inputFile) {
  const { logger } = config;
  const packageFile = configParser.mergeChildConfig(config.docker, inputFile);
  logger.debug(
    `Resolving packageFile ${JSON.stringify(packageFile.packageFile)}`
  );
  packageFile.content = await config.api.getFileContent(
    packageFile.packageFile,
    config.contentBranch
  );
  if (!packageFile.content) {
    logger.debug('No packageFile content');
    return null;
  }
  const strippedComment = packageFile.content.replace(/^(#.*?\n)+/, '');
  const fromMatch = strippedComment.match(/^FROM (.*)\n/);
  if (!fromMatch) {
    logger.debug(
      { content: packageFile.content, strippedComment },
      'No FROM found'
    );
    return null;
  }
  [, packageFile.currentFrom] = fromMatch;
  logger.debug('Adding Dockerfile');
  return packageFile;
}
