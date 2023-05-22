import { lodash as _, Logger, getInputs, getStepContext } from '@serverless-cd/core';
import Cache, { IProps, ICredentials } from './cache';

interface ISchemaError {
  error: Error;
};

const getCacheInputs = async (inputs: Record<string, any>, context: Record<string, any>, logger: Logger): Promise<IProps | ISchemaError> => {
  logger.debug(`context: ${JSON.stringify(context)}`);
  logger.debug(`inputs: ${JSON.stringify(inputs)}`);
  const newInputs = getInputs(inputs, context) as Record<string, any>;
  logger.debug(`newInputs: ${JSON.stringify(newInputs)}`);

  const currentRegion = _.get(context, 'inputs.currentRegion');
  const region = _.get(context, 'inputs.ctx.data.cacheConfig.oss.regionId', currentRegion);
  const credentials = {
    accountId: _.get(context, 'inputs.sts.accountId') || _.get(context, 'inputs.uid'),
    accessKeyId: _.get(context, 'inputs.sts.accessKeyId'),
    accessKeySecret: _.get(context, 'inputs.sts.accessKeySecret'),
    securityToken: _.get(context, 'inputs.sts.securityToken'),
  };

  return {
    region,
    cwd: _.get(context, 'cwd', process.cwd()),
    objectKey: _.get(newInputs, 'key', ''),
    cachePath: _.get(newInputs, 'path', ''),
    bucket: _.get(context, 'inputs.ctx.data.cacheConfig.oss.bucketName', ''),
    internal: currentRegion === region,
    credentials,
  };
}

export const run = async (inputs: Record<string, any>, context: Record<string, any>, logger: Logger) => {
  logger.info('start @serverless-cd/cache run');
  const props = await getCacheInputs(inputs, context, logger);
  if ((props as ISchemaError).error) {
    const error = _.get(props, 'error') as unknown as Error;
    logger.warn(`The entry information is wrong: ${error.message}`);
    return { 'cache-hit': false, error };
  }
  const cache = new Cache(props as IProps, logger);
  const res = await cache.run();
  logger.info('Run @serverless-cd/cache end');
  return res;
};

export const postRun = async (inputs: Record<string, any>, context: Record<string, any>, logger: Logger) => {
  logger.info('start @serverless-cd/cache postRun');
  const props = await getCacheInputs(inputs, context, logger);
  if ((props as ISchemaError).error) {
    const error = _.get(props, 'error') as unknown as Error;
    logger.warn(`The entry information is wrong: ${error.message}`);
    return;
  }

  const stepContext = getStepContext(context);
  const cacheHit = _.get(stepContext, 'run.outputs.cache-hit');
  const cacheError = _.get(stepContext, 'run.outputs.error');
  logger.debug(`Get run output cache hit: ${cacheHit}`);
  const cache = new Cache((props as IProps), logger);
  await cache.postRun(cacheHit, cacheError);
  logger.info('postRun @serverless-cd/cache end');
};

export default Cache;
